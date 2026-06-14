alter table public.wallet_profiles
  drop constraint if exists wallet_profiles_funding_model_check;
alter table public.wallet_profiles
  add constraint wallet_profiles_funding_model_check
  check (funding_model in ('prepaid', 'bank-linked', 'hybrid', 'bank-direct'));

alter table public.wallet_profiles
  drop constraint if exists wallet_profiles_check;
alter table public.wallet_profiles
  drop constraint if exists wallet_profiles_bank_only_wallet_balance_check;
alter table public.wallet_profiles
  add constraint wallet_profiles_bank_only_wallet_balance_check
  check (funding_model not in ('bank-linked', 'bank-direct') or wallet_balance = 0);

alter table public.wallet_profiles
  drop constraint if exists wallet_profiles_profile_kind_check;
alter table public.wallet_profiles
  add constraint wallet_profiles_profile_kind_check
  check (profile_kind in ('person', 'business', 'charity', 'church'));

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
    funding_description :=
      case
        when profile_record.funding_model = 'bank-direct' then 'bank account'
        else 'linked bank account'
      end;
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
      left(
        transaction_detail || case when bank_portion > 0 then ' / wallet portion' else '' end,
        240
      ),
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
      left(
        transaction_detail || case when wallet_portion > 0 then ' / bank fallback' else '' end,
        240
      ),
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

revoke all on function public.apply_wallet_debit(uuid, text, numeric, text, text, text)
  from public;
revoke all on function public.transfer_between_wallets(
  uuid, text, text, numeric, text, text, text
) from public;
grant execute on function public.transfer_between_wallets(
  uuid, text, text, numeric, text, text, text
) to authenticated;
