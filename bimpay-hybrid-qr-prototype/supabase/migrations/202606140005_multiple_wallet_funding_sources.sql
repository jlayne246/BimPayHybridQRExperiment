/*
 * Normalized linked funding accounts.
 *
 * wallet_profiles.bank_balance remains a compatibility aggregate, while rows
 * in wallet_funding_sources are authoritative for source-aware transactions.
 * A transaction may debit only one selected source.
 */
create table if not exists public.wallet_funding_sources (
  workspace_id uuid not null,
  profile_id text not null,
  source_id text not null,
  source_name text not null check (char_length(source_name) between 1 and 60),
  source_detail text not null default '',
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  priority integer not null default 1 check (priority > 0),
  is_default boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, profile_id, source_id),
  foreign key (workspace_id, profile_id)
    references public.wallet_profiles(workspace_id, profile_id) on delete cascade
);

create unique index if not exists wallet_funding_sources_one_default
on public.wallet_funding_sources(workspace_id, profile_id)
where is_default;

alter table public.wallet_funding_sources enable row level security;

drop policy if exists "members can view funding sources"
  on public.wallet_funding_sources;
create policy "members can view funding sources"
on public.wallet_funding_sources for select
to authenticated
using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.wallet_funding_sources from authenticated;
grant select on public.wallet_funding_sources to authenticated;

insert into public.wallet_funding_sources (
  workspace_id,
  profile_id,
  source_id,
  source_name,
  source_detail,
  balance,
  priority,
  is_default,
  enabled
)
select
  workspace_id,
  profile_id,
  profile_id || '-primary',
  coalesce(nullif(bank_name, ''), 'Test Bank'),
  coalesce(nullif(bank_detail, ''), 'Primary linked account'),
  bank_balance,
  1,
  true,
  true
from public.wallet_profiles
on conflict (workspace_id, profile_id, source_id) do nothing;

create or replace function public.replace_wallet_lab_state(
  target_workspace_id uuid,
  wallet_rows jsonb,
  ledger_rows jsonb,
  expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision bigint;
  next_revision bigint;
begin
  if not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Workspace edit permission required';
  end if;

  select revision into current_revision
  from public.workspaces
  where id = target_workspace_id
  for update;

  if current_revision is null then raise exception 'Workspace not found'; end if;
  if current_revision <> expected_revision then
    raise exception 'Workspace revision conflict: expected %, current %',
      expected_revision, current_revision using errcode = '40001';
  end if;

  delete from public.ledger_entries where workspace_id = target_workspace_id;
  delete from public.wallet_profiles where workspace_id = target_workspace_id;

  insert into public.wallet_profiles (
    workspace_id, profile_id, owner_name, profile_kind, funding_model,
    wallet_balance, bank_balance, bank_name, bank_detail,
    wallet_identifier, color, is_custom, display_order
  )
  select
    target_workspace_id,
    wallet->>'id',
    wallet->>'ownerName',
    coalesce(wallet->>'profileKind', 'person'),
    wallet->>'model',
    coalesce((wallet->>'walletBalance')::numeric, 0),
    coalesce((
      select sum(coalesce((source->>'balance')::numeric, 0))
      from jsonb_array_elements(
        coalesce(wallet->'fundingSources', '[]'::jsonb)
      ) as sources(source)
    ), coalesce((wallet->>'bankBalance')::numeric, 0)),
    coalesce(wallet->>'bankName', ''),
    coalesce(wallet->>'bankDetail', ''),
    wallet->>'walletIdentifier',
    coalesce(wallet->>'color', 'from-emerald-700 to-teal-600'),
    coalesce((wallet->>'isCustom')::boolean, true),
    wallet_position::integer - 1
  from jsonb_array_elements(wallet_rows) with ordinality as rows(wallet, wallet_position);

  insert into public.wallet_funding_sources (
    workspace_id, profile_id, source_id, source_name, source_detail,
    balance, priority, is_default, enabled
  )
  select
    target_workspace_id,
    wallet->>'id',
    source->>'id',
    source->>'name',
    coalesce(source->>'detail', ''),
    coalesce((source->>'balance')::numeric, 0),
    coalesce((source->>'priority')::integer, source_position::integer),
    coalesce((source->>'isDefault')::boolean, source_position = 1),
    coalesce((source->>'enabled')::boolean, true)
  from jsonb_array_elements(wallet_rows) as wallets(wallet)
  cross join lateral jsonb_array_elements(
    coalesce(wallet->'fundingSources', '[]'::jsonb)
  ) with ordinality as sources(source, source_position);

  insert into public.wallet_funding_sources (
    workspace_id, profile_id, source_id, source_name, source_detail,
    balance, priority, is_default, enabled
  )
  select
    target_workspace_id,
    wallet->>'id',
    wallet->>'id' || '-primary',
    coalesce(nullif(wallet->>'bankName', ''), 'Test Bank'),
    coalesce(nullif(wallet->>'bankDetail', ''), 'Primary linked account'),
    coalesce((wallet->>'bankBalance')::numeric, 0),
    1,
    true,
    true
  from jsonb_array_elements(wallet_rows) as wallets(wallet)
  where jsonb_array_length(coalesce(wallet->'fundingSources', '[]'::jsonb)) = 0;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  )
  select
    target_workspace_id,
    entry->>'id',
    entry->>'ownerId',
    entry->>'title',
    coalesce(entry->>'detail', ''),
    (entry->>'amount')::numeric,
    entry->>'balanceType',
    entry->>'reference',
    (entry->>'createdAt')::timestamptz
  from jsonb_array_elements(ledger_rows) as entries(entry);

  update public.workspaces
  set revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where id = target_workspace_id
  returning revision into next_revision;

  return next_revision;
end;
$$;

create or replace function public.apply_wallet_debit_from_source(
  target_workspace_id uuid,
  target_profile_id text,
  target_source_id text,
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
  source_record public.wallet_funding_sources%rowtype;
  wallet_portion numeric(12, 2) := 0;
  bank_portion numeric(12, 2) := 0;
  funding_description text;
begin
  select * into profile_record
  from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = target_profile_id
  for update;
  if not found then raise exception 'Wallet profile not found'; end if;

  if profile_record.funding_model <> 'prepaid' then
    select * into source_record
    from public.wallet_funding_sources
    where workspace_id = target_workspace_id
      and profile_id = target_profile_id
      and enabled
      and (
        source_id = target_source_id
        or (target_source_id is null and is_default)
      )
    order by
      case when source_id = target_source_id then 0 else 1 end,
      priority
    limit 1
    for update;
  end if;

  if profile_record.funding_model = 'prepaid' then
    if transaction_amount > profile_record.wallet_balance then
      raise exception 'Insufficient stored wallet value';
    end if;
    wallet_portion := transaction_amount;
    funding_description := 'stored wallet value';
  elsif profile_record.funding_model in ('bank-linked', 'bank-direct') then
    if source_record.source_id is null then raise exception 'Linked funding source not found'; end if;
    if transaction_amount > source_record.balance then
      raise exception 'Selected linked account has insufficient funds';
    end if;
    bank_portion := transaction_amount;
    funding_description := source_record.source_name || ' (' || source_record.source_detail || ')';
  else
    wallet_portion := least(transaction_amount, profile_record.wallet_balance);
    bank_portion := transaction_amount - wallet_portion;
    if bank_portion > 0 and source_record.source_id is null then
      raise exception 'Linked funding source not found';
    end if;
    if bank_portion > coalesce(source_record.balance, 0) then
      raise exception 'Selected linked account has insufficient funds';
    end if;
    funding_description :=
      case
        when wallet_portion > 0 and bank_portion > 0
          then 'wallet value plus ' || source_record.source_name
        when bank_portion > 0
          then source_record.source_name || ' (' || source_record.source_detail || ')'
        else 'stored wallet value'
      end;
  end if;

  update public.wallet_profiles
  set wallet_balance = wallet_balance - wallet_portion, updated_at = now()
  where workspace_id = target_workspace_id and profile_id = target_profile_id;

  if bank_portion > 0 then
    update public.wallet_funding_sources
    set balance = balance - bank_portion, updated_at = now()
    where workspace_id = target_workspace_id
      and profile_id = target_profile_id
      and source_id = source_record.source_id;
  end if;

  -- Keep the legacy aggregate synchronized after the source-level debit.
  update public.wallet_profiles profile
  set bank_balance = coalesce((
    select sum(source.balance)
    from public.wallet_funding_sources source
    where source.workspace_id = target_workspace_id
      and source.profile_id = target_profile_id
  ), 0)
  where profile.workspace_id = target_workspace_id
    and profile.profile_id = target_profile_id;

  if wallet_portion > 0 then
    insert into public.ledger_entries (
      workspace_id, entry_id, owner_profile_id, title, detail,
      amount, balance_type, reference, created_at
    ) values (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      left(transaction_title, 120),
      left(transaction_detail || case when bank_portion > 0 then ' / wallet portion' else '' end, 240),
      -wallet_portion, 'wallet', left(transaction_reference, 100), now()
    );
  end if;

  if bank_portion > 0 then
    insert into public.ledger_entries (
      workspace_id, entry_id, owner_profile_id, title, detail,
      amount, balance_type, reference, created_at
    ) values (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      left(transaction_title, 120),
      left(transaction_detail || ' / ' || source_record.source_name || ' / ' ||
        source_record.source_detail, 240),
      -bank_portion, 'bank', left(transaction_reference, 100), now()
    );
  end if;

  return jsonb_build_object(
    'walletPortion', wallet_portion,
    'bankPortion', bank_portion,
    'fundingDescription', funding_description,
    'fundingSourceId', source_record.source_id
  );
end;
$$;

create or replace function public.reload_wallet_from_source(
  target_workspace_id uuid,
  target_profile_id text,
  target_source_id text,
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
  source_record public.wallet_funding_sources%rowtype;
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id, request_idempotency_key, 'reload'
  );
  if existing_response is not null then return existing_response; end if;
  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Reload amount must be between 0.01 and 5000.00';
  end if;

  select * into profile_record from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = target_profile_id
  for update;
  if not found then raise exception 'Wallet profile not found'; end if;
  if profile_record.funding_model in ('bank-linked', 'bank-direct') then
    raise exception 'A bank-only profile cannot be reloaded';
  end if;

  select * into source_record from public.wallet_funding_sources
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id
    and enabled
    and (source_id = target_source_id or (target_source_id is null and is_default))
  order by case when source_id = target_source_id then 0 else 1 end, priority
  limit 1 for update;
  if source_record.source_id is null then raise exception 'Linked funding source not found'; end if;
  if transaction_amount > source_record.balance then
    raise exception 'Selected linked account has insufficient funds';
  end if;

  update public.wallet_funding_sources
  set balance = balance - transaction_amount, updated_at = now()
  where workspace_id = target_workspace_id
    and profile_id = target_profile_id
    and source_id = source_record.source_id;
  update public.wallet_profiles
  set
    wallet_balance = wallet_balance + transaction_amount,
    bank_balance = bank_balance - transaction_amount,
    updated_at = now()
  where workspace_id = target_workspace_id and profile_id = target_profile_id;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  ) values
    (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      'Wallet reloaded', left(source_record.source_name || ' / ' || source_record.source_detail, 240),
      transaction_amount, 'wallet', left(transaction_reference, 100), now()
    ),
    (
      target_workspace_id, gen_random_uuid()::text, target_profile_id,
      'Bank funded wallet reload', left('Value moved from ' || source_record.source_name, 240),
      -transaction_amount, 'bank', left(transaction_reference, 100), now()
    );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := jsonb_build_object(
    'revision', next_revision,
    'fundingDescription', source_record.source_name || ' (' || source_record.source_detail || ')',
    'fundingSourceId', source_record.source_id,
    'amount', transaction_amount
  );
  return public.finish_wallet_transaction(
    target_workspace_id, request_idempotency_key, transaction_response
  );
end;
$$;

create or replace function public.pay_merchant_from_source(
  target_workspace_id uuid,
  payer_profile_id text,
  target_source_id text,
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
    target_workspace_id, request_idempotency_key, 'merchant_payment'
  );
  if existing_response is not null then return existing_response; end if;
  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Payment amount must be between 0.01 and 5000.00';
  end if;

  debit_result := public.apply_wallet_debit_from_source(
    target_workspace_id, payer_profile_id, target_source_id, transaction_amount,
    transaction_reference, 'Paid ' || left(trim(merchant_name), 80),
    left(transaction_detail, 200)
  );
  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := debit_result || jsonb_build_object(
    'revision', next_revision, 'amount', transaction_amount
  );
  return public.finish_wallet_transaction(
    target_workspace_id, request_idempotency_key, transaction_response
  );
end;
$$;

create or replace function public.transfer_between_wallets_from_source(
  target_workspace_id uuid,
  payer_profile_id text,
  recipient_profile_id text,
  target_source_id text,
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
  recipient_source public.wallet_funding_sources%rowtype;
  debit_result jsonb;
  recipient_balance_type text;
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id, request_idempotency_key, 'wallet_transfer'
  );
  if existing_response is not null then return existing_response; end if;
  if payer_profile_id = recipient_profile_id then
    raise exception 'Payer and recipient must be different profiles';
  end if;
  if transaction_amount <= 0 or transaction_amount > 5000 then
    raise exception 'Transfer amount must be between 0.01 and 5000.00';
  end if;

  perform profile_id from public.wallet_profiles
  where workspace_id = target_workspace_id
    and profile_id in (payer_profile_id, recipient_profile_id)
  order by profile_id for update;

  select * into payer_record from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = payer_profile_id;
  select * into recipient_record from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = recipient_profile_id;
  if payer_record.profile_id is null or recipient_record.profile_id is null then
    raise exception 'Payer or recipient profile not found';
  end if;

  debit_result := public.apply_wallet_debit_from_source(
    target_workspace_id, payer_profile_id, target_source_id, transaction_amount,
    transaction_reference, 'Sent to ' || recipient_record.owner_name,
    left(transaction_detail, 200)
  );

  recipient_balance_type :=
    case when recipient_record.funding_model in ('bank-linked', 'bank-direct')
      then 'bank' else 'wallet' end;

  if recipient_balance_type = 'bank' then
    select * into recipient_source
    from public.wallet_funding_sources
    where workspace_id = target_workspace_id
      and profile_id = recipient_profile_id
      and enabled
    order by is_default desc, priority
    limit 1 for update;
    if recipient_source.source_id is null then
      raise exception 'Recipient linked account not found';
    end if;
    update public.wallet_funding_sources
    set balance = balance + transaction_amount, updated_at = now()
    where workspace_id = target_workspace_id
      and profile_id = recipient_profile_id
      and source_id = recipient_source.source_id;
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
  ) values (
    target_workspace_id, gen_random_uuid()::text, recipient_profile_id,
    'Received from ' || payer_record.owner_name,
    left(
      payer_record.funding_model || ' to ' || recipient_record.funding_model ||
      case when recipient_balance_type = 'bank'
        then ' / ' || recipient_source.source_name else '' end,
      240
    ),
    transaction_amount, recipient_balance_type,
    left(transaction_reference, 100), now()
  );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := debit_result || jsonb_build_object(
    'revision', next_revision,
    'amount', transaction_amount,
    'recipientBalanceType', recipient_balance_type
  );
  return public.finish_wallet_transaction(
    target_workspace_id, request_idempotency_key, transaction_response
  );
end;
$$;

create or replace function public.adjust_sandbox_balance_from_source(
  target_workspace_id uuid,
  target_profile_id text,
  target_source_id text,
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
  source_record public.wallet_funding_sources%rowtype;
  resulting_balance numeric(12, 2);
  next_revision bigint;
  transaction_response jsonb;
begin
  existing_response := public.begin_wallet_transaction(
    target_workspace_id, request_idempotency_key, 'balance_adjustment'
  );
  if existing_response is not null then return existing_response; end if;
  if target_balance_type not in ('wallet', 'bank') then
    raise exception 'Balance type must be wallet or bank';
  end if;
  if adjustment_amount = 0 or abs(adjustment_amount) > 100000 then
    raise exception 'Adjustment must be non-zero and within sandbox limits';
  end if;

  select * into profile_record from public.wallet_profiles
  where workspace_id = target_workspace_id and profile_id = target_profile_id
  for update;
  if not found then raise exception 'Wallet profile not found'; end if;
  if target_balance_type = 'wallet'
    and profile_record.funding_model in ('bank-linked', 'bank-direct') then
    raise exception 'A bank-only profile cannot hold stored wallet value';
  end if;

  if target_balance_type = 'bank' then
    select * into source_record from public.wallet_funding_sources
    where workspace_id = target_workspace_id
      and profile_id = target_profile_id
      and enabled
      and (source_id = target_source_id or (target_source_id is null and is_default))
    order by case when source_id = target_source_id then 0 else 1 end, priority
    limit 1 for update;
    if source_record.source_id is null then raise exception 'Linked funding source not found'; end if;
    resulting_balance := source_record.balance + adjustment_amount;
    if resulting_balance < 0 then raise exception 'Adjustment would create a negative balance'; end if;
    update public.wallet_funding_sources
    set balance = resulting_balance, updated_at = now()
    where workspace_id = target_workspace_id
      and profile_id = target_profile_id
      and source_id = source_record.source_id;
    update public.wallet_profiles profile
    set
      bank_balance = (
        select sum(source.balance)
        from public.wallet_funding_sources source
        where source.workspace_id = target_workspace_id
          and source.profile_id = target_profile_id
      ),
      updated_at = now()
    where profile.workspace_id = target_workspace_id
      and profile.profile_id = target_profile_id;
  else
    resulting_balance := profile_record.wallet_balance + adjustment_amount;
    if resulting_balance < 0 then raise exception 'Adjustment would create a negative balance'; end if;
    update public.wallet_profiles
    set wallet_balance = resulting_balance, updated_at = now()
    where workspace_id = target_workspace_id and profile_id = target_profile_id;
  end if;

  insert into public.ledger_entries (
    workspace_id, entry_id, owner_profile_id, title, detail,
    amount, balance_type, reference, created_at
  ) values (
    target_workspace_id, gen_random_uuid()::text, target_profile_id,
    'Sandbox balance adjustment',
    left(
      adjustment_reason || case when target_balance_type = 'bank'
        then ' / ' || source_record.source_name || ' / ' || source_record.source_detail
        else '' end,
      240
    ),
    adjustment_amount, target_balance_type,
    left(transaction_reference, 100), now()
  );

  next_revision := public.bump_wallet_workspace_revision(target_workspace_id);
  transaction_response := jsonb_build_object(
    'revision', next_revision,
    'amount', adjustment_amount,
    'balanceType', target_balance_type,
    'resultingBalance', resulting_balance,
    'fundingSourceId', source_record.source_id
  );
  return public.finish_wallet_transaction(
    target_workspace_id, request_idempotency_key, transaction_response
  );
end;
$$;

revoke all on function public.apply_wallet_debit_from_source(
  uuid, text, text, numeric, text, text, text
) from public;
revoke all on function public.reload_wallet_from_source(
  uuid, text, text, numeric, text, text
) from public;
revoke all on function public.pay_merchant_from_source(
  uuid, text, text, numeric, text, text, text, text
) from public;
revoke all on function public.transfer_between_wallets_from_source(
  uuid, text, text, text, numeric, text, text, text
) from public;
revoke all on function public.adjust_sandbox_balance_from_source(
  uuid, text, text, text, numeric, text, text, text
) from public;

grant execute on function public.reload_wallet_from_source(
  uuid, text, text, numeric, text, text
) to authenticated;
grant execute on function public.pay_merchant_from_source(
  uuid, text, text, numeric, text, text, text, text
) to authenticated;
grant execute on function public.transfer_between_wallets_from_source(
  uuid, text, text, text, numeric, text, text, text
) to authenticated;
grant execute on function public.adjust_sandbox_balance_from_source(
  uuid, text, text, text, numeric, text, text, text
) to authenticated;
