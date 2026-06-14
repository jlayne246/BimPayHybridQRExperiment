/*
 * Atomic wallet operations and idempotency.
 *
 * Each public operation checks workspace edit permission, locks the affected
 * balances, writes ledger rows, and increments the workspace revision in one
 * PostgreSQL transaction.
 */
create table if not exists public.wallet_transaction_requests (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null,
  operation text not null check (
    operation in ('reload', 'merchant_payment', 'wallet_transfer', 'balance_adjustment')
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, idempotency_key)
);

alter table public.wallet_transaction_requests enable row level security;

revoke insert, update, delete on public.wallet_profiles from authenticated;
revoke insert, update, delete on public.ledger_entries from authenticated;
revoke insert, update, delete on public.wallet_transaction_requests from authenticated;

drop policy if exists "members can view transaction requests"
  on public.wallet_transaction_requests;
create policy "members can view transaction requests"
on public.wallet_transaction_requests for select
to authenticated
using (public.is_workspace_member(workspace_id));

create or replace function public.begin_wallet_transaction(
  target_workspace_id uuid,
  request_idempotency_key text,
  request_operation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  existing_response jsonb;
begin
  if auth.uid() is null or not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Workspace edit permission required';
  end if;
  if request_idempotency_key is null or char_length(trim(request_idempotency_key)) < 8 then
    raise exception 'A valid idempotency key is required';
  end if;

  -- The composite primary key makes retries race safely at the database.
  insert into public.wallet_transaction_requests (
    workspace_id,
    idempotency_key,
    operation,
    created_by
  )
  values (
    target_workspace_id,
    left(trim(request_idempotency_key), 100),
    request_operation,
    auth.uid()
  )
  on conflict (workspace_id, idempotency_key) do nothing;

  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    return null;
  end if;

  select response
  into existing_response
  from public.wallet_transaction_requests
  where workspace_id = target_workspace_id
    and idempotency_key = left(trim(request_idempotency_key), 100);

  if existing_response is null then
    raise exception 'Transaction request is still being processed'
      using errcode = '40001';
  end if;

  return existing_response;
end;
$$;

create or replace function public.finish_wallet_transaction(
  target_workspace_id uuid,
  request_idempotency_key text,
  transaction_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.wallet_transaction_requests
  set response = transaction_response
  where workspace_id = target_workspace_id
    and idempotency_key = left(trim(request_idempotency_key), 100)
    and created_by = auth.uid();

  return transaction_response;
end;
$$;

create or replace function public.bump_wallet_workspace_revision(
  target_workspace_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revision bigint;
begin
  update public.workspaces
  set
    revision = revision + 1,
    updated_at = now(),
    updated_by = auth.uid()
  where id = target_workspace_id
  returning revision into next_revision;

  return next_revision;
end;
$$;

create or replace function public.apply_wallet_debit(
  target_workspace_id uuid,
  target_profile_id text,
  transaction_amount numeric,
  transaction_reference text,
  transaction_title text,
  transaction_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_record public.wallet_profiles%rowtype;
  wallet_portion numeric(12, 2) := 0;
  bank_portion numeric(12, 2) := 0;
  funding_description text;
begin
  select *
  into profile_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id
  for update;

  if not found then
    raise exception 'Wallet profile not found';
  end if;

  if profile_record.funding_model = 'prepaid' then
    if transaction_amount > profile_record.wallet_balance then
      raise exception 'Insufficient stored wallet value';
    end if;
    wallet_portion := transaction_amount;
    funding_description := 'stored wallet value';
  elsif profile_record.funding_model in ('bank-linked', 'bank-direct') then
    if transaction_amount > profile_record.bank_balance then
      raise exception 'Insufficient linked bank funds';
    end if;
    bank_portion := transaction_amount;
    funding_description := 'linked bank account';
  else
    if transaction_amount > profile_record.wallet_balance + profile_record.bank_balance then
      raise exception 'Insufficient hybrid funds';
    end if;
    wallet_portion := least(transaction_amount, profile_record.wallet_balance);
    bank_portion := transaction_amount - wallet_portion;
    funding_description :=
      case
        when wallet_portion > 0 and bank_portion > 0
          then 'wallet value plus bank fallback'
        when bank_portion > 0
          then 'linked bank fallback'
        else 'stored wallet value'
      end;
  end if;

  update public.wallet_profiles
  set
    wallet_balance = wallet_balance - wallet_portion,
    bank_balance = bank_balance - bank_portion,
    updated_at = now()
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id;

  if wallet_portion > 0 then
    insert into public.ledger_entries (
      workspace_id,
      entry_id,
      owner_profile_id,
      title,
      detail,
      amount,
      balance_type,
      reference,
      created_at
    )
    values (
      target_workspace_id,
      gen_random_uuid()::text,
      target_profile_id,
      left(transaction_title, 120),
      left(transaction_detail || case when bank_portion > 0 then ' / wallet portion' else '' end, 240),
      -wallet_portion,
      'wallet',
      left(transaction_reference, 100),
      now()
    );
  end if;

  if bank_portion > 0 then
    insert into public.ledger_entries (
      workspace_id,
      entry_id,
      owner_profile_id,
      title,
      detail,
      amount,
      balance_type,
      reference,
      created_at
    )
    values (
      target_workspace_id,
      gen_random_uuid()::text,
      target_profile_id,
      left(transaction_title, 120),
      left(transaction_detail || case when wallet_portion > 0 then ' / bank fallback' else '' end, 240),
      -bank_portion,
      'bank',
      left(transaction_reference, 100),
      now()
    );
  end if;

  return jsonb_build_object(
    'walletPortion', wallet_portion,
    'bankPortion', bank_portion,
    'fundingDescription', funding_description
  );
end;
$$;

create or replace function public.reload_wallet(
  target_workspace_id uuid,
  target_profile_id text,
  transaction_amount numeric,
  transaction_reference text,
  request_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_response jsonb;
  profile_record public.wallet_profiles%rowtype;
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    'reload'
  );
  if existing_response is not null then return existing_response; end if;

  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Reload amount must be between 0.01 and 5000.00';
  end if;

  select *
  into profile_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id
  for update;

  if not found then raise exception 'Wallet profile not found'; end if;
  if profile_record.funding_model in ('bank-linked', 'bank-direct') then
    raise exception 'A bank-only profile cannot be reloaded';
  end if;
  if transaction_amount > profile_record.bank_balance then
    raise exception 'Insufficient linked bank funds';
  end if;

  update public.wallet_profiles
  set
    wallet_balance = wallet_balance + transaction_amount,
    bank_balance = bank_balance - transaction_amount,
    updated_at = now()
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  )
  values
    (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      'Wallet reloaded', left(profile_record.bank_name || ' / ' || profile_record.bank_detail, 240),
      transaction_amount, 'wallet', left(transaction_reference, 100), now()
    ),
    (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      'Bank funded wallet reload', 'Value moved into the wallet',
      -transaction_amount, 'bank', left(transaction_reference, 100), now()
    );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := jsonb_build_object(
    'revision', next_revision,
    'fundingDescription', 'linked bank account',
    'amount', transaction_amount
  );
  return public.finish_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    transaction_response
  );
end;
$$;

create or replace function public.pay_merchant(
  target_workspace_id uuid,
  payer_profile_id text,
  transaction_amount numeric,
  merchant_name text,
  transaction_detail text,
  transaction_reference text,
  request_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_response jsonb;
  debit_result jsonb;
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    'merchant_payment'
  );
  if existing_response is not null then return existing_response; end if;

  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Payment amount must be between 0.01 and 5000.00';
  end if;

  debit_result := public.apply_wallet_debit(
    target_workspace_id,
    payer_profile_id,
    transaction_amount,
    transaction_reference,
    'Paid ' || left(trim(merchant_name), 80),
    left(transaction_detail, 200)
  );
  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := debit_result || jsonb_build_object(
    'revision', next_revision,
    'amount', transaction_amount
  );
  return public.finish_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    transaction_response
  );
end;
$$;

create or replace function public.transfer_between_wallets(
  target_workspace_id uuid,
  payer_profile_id text,
  recipient_profile_id text,
  transaction_amount numeric,
  transaction_detail text,
  transaction_reference text,
  request_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_response jsonb;
  payer_record public.wallet_profiles%rowtype;
  recipient_record public.wallet_profiles%rowtype;
  debit_result jsonb;
  recipient_balance_type text;
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    'wallet_transfer'
  );
  if existing_response is not null then return existing_response; end if;

  if payer_profile_id = recipient_profile_id then
    raise exception 'Payer and recipient must be different profiles';
  end if;
  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Transfer amount must be between 0.01 and 5000.00';
  end if;

  perform profile_id
  from public.wallet_profiles
  where workspace_id = target_workspace_id
    and profile_id in (payer_profile_id, recipient_profile_id)
  order by profile_id
  for update;

  select * into payer_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = payer_profile_id;
  select * into recipient_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = recipient_profile_id;

  if payer_record.profile_id is null or recipient_record.profile_id is null then
    raise exception 'Payer or recipient profile not found';
  end if;

  debit_result := public.apply_wallet_debit(
    target_workspace_id,
    payer_profile_id,
    transaction_amount,
    transaction_reference,
    'Sent to ' || recipient_record.owner_name,
    left(transaction_detail, 200)
  );

  recipient_balance_type :=
    case
      when recipient_record.funding_model in ('bank-linked', 'bank-direct') then 'bank'
      else 'wallet'
    end;

  if recipient_balance_type = 'bank' then
    update public.wallet_profiles
    set bank_balance = bank_balance + transaction_amount, updated_at = now()
    where workspace_id = target_workspace_id and profile_id = recipient_profile_id;
  else
    update public.wallet_profiles
    set wallet_balance = wallet_balance + transaction_amount, updated_at = now()
    where workspace_id = target_workspace_id and profile_id = recipient_profile_id;
  end if;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  )
  values (
    target_workspace_id,
    gen_random_uuid()::text,
    recipient_profile_id,
    'Received from ' || payer_record.owner_name,
    left(payer_record.funding_model || ' to ' || recipient_record.funding_model, 240),
    transaction_amount,
    recipient_balance_type,
    left(transaction_reference, 100),
    now()
  );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := debit_result || jsonb_build_object(
    'revision', next_revision,
    'amount', transaction_amount,
    'recipientBalanceType', recipient_balance_type
  );
  return public.finish_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    transaction_response
  );
end;
$$;

create or replace function public.adjust_sandbox_balance(
  target_workspace_id uuid,
  target_profile_id text,
  target_balance_type text,
  adjustment_amount numeric,
  adjustment_reason text,
  transaction_reference text,
  request_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_response jsonb;
  profile_record public.wallet_profiles%rowtype;
  resulting_balance numeric(12, 2);
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    'balance_adjustment'
  );
  if existing_response is not null then return existing_response; end if;

  if target_balance_type not in ('wallet', 'bank') then
    raise exception 'Balance type must be wallet or bank';
  end if;
  if adjustment_amount = 0 or abs(adjustment_amount) > 100000 then
    raise exception 'Adjustment must be non-zero and within sandbox limits';
  end if;

  select *
  into profile_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id
  for update;

  if not found then raise exception 'Wallet profile not found'; end if;
  if target_balance_type = 'wallet'
    and profile_record.funding_model in ('bank-linked', 'bank-direct') then
    raise exception 'A bank-only profile cannot hold stored wallet value';
  end if;

  resulting_balance :=
    case
      when target_balance_type = 'wallet'
        then profile_record.wallet_balance + adjustment_amount
      else profile_record.bank_balance + adjustment_amount
    end;
  if resulting_balance < 0 then raise exception 'Adjustment would create a negative balance'; end if;

  update public.wallet_profiles
  set
    wallet_balance = case
      when target_balance_type = 'wallet' then resulting_balance else wallet_balance end,
    bank_balance = case
      when target_balance_type = 'bank' then resulting_balance else bank_balance end,
    updated_at = now()
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  )
  values (
    target_workspace_id,
    gen_random_uuid()::text,
    target_profile_id,
    'Sandbox balance adjustment',
    left(adjustment_reason, 240),
    adjustment_amount,
    target_balance_type,
    left(transaction_reference, 100),
    now()
  );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := jsonb_build_object(
    'revision', next_revision,
    'amount', adjustment_amount,
    'balanceType', target_balance_type,
    'resultingBalance', resulting_balance
  );
  return public.finish_wallet_transaction(
    target_workspace_id,
    request_idempotency_key,
    transaction_response
  );
end;
$$;

revoke all on function public.begin_wallet_transaction(uuid, text, text) from public;
revoke all on function public.finish_wallet_transaction(uuid, text, jsonb) from public;
revoke all on function public.bump_wallet_workspace_revision(uuid) from public;
revoke all on function public.apply_wallet_debit(uuid, text, numeric, text, text, text)
  from public;
revoke all on function public.reload_wallet(uuid, text, numeric, text, text) from public;
revoke all on function public.pay_merchant(uuid, text, numeric, text, text, text, text)
  from public;
revoke all on function public.transfer_between_wallets(
  uuid, text, text, numeric, text, text, text
) from public;
revoke all on function public.adjust_sandbox_balance(
  uuid, text, text, numeric, text, text, text
) from public;

grant execute on function public.reload_wallet(uuid, text, numeric, text, text)
  to authenticated;
grant execute on function public.pay_merchant(uuid, text, numeric, text, text, text, text)
  to authenticated;
grant execute on function public.transfer_between_wallets(
  uuid, text, text, numeric, text, text, text
) to authenticated;
grant execute on function public.adjust_sandbox_balance(
  uuid, text, text, numeric, text, text, text
) to authenticated;
