alter table public.workspaces
  add column if not exists revision bigint not null default 0,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.wallet_profiles
  add column if not exists profile_kind text not null default 'person'
    check (profile_kind in ('person', 'business', 'charity', 'church'));

drop function if exists public.replace_wallet_lab_state(uuid, jsonb, jsonb);

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

  select revision
  into current_revision
  from public.workspaces
  where id = target_workspace_id
  for update;

  if current_revision is null then
    raise exception 'Workspace not found';
  end if;

  if current_revision <> expected_revision then
    raise exception 'Workspace revision conflict: expected %, current %',
      expected_revision,
      current_revision
      using errcode = '40001';
  end if;

  delete from public.ledger_entries where workspace_id = target_workspace_id;
  delete from public.wallet_profiles where workspace_id = target_workspace_id;

  insert into public.wallet_profiles (
    workspace_id,
    profile_id,
    owner_name,
    profile_kind,
    funding_model,
    wallet_balance,
    bank_balance,
    bank_name,
    bank_detail,
    wallet_identifier,
    color,
    is_custom,
    display_order
  )
  select
    target_workspace_id,
    wallet->>'id',
    wallet->>'ownerName',
    coalesce(wallet->>'profileKind', 'person'),
    wallet->>'model',
    coalesce((wallet->>'walletBalance')::numeric, 0),
    coalesce((wallet->>'bankBalance')::numeric, 0),
    coalesce(wallet->>'bankName', ''),
    coalesce(wallet->>'bankDetail', ''),
    wallet->>'walletIdentifier',
    coalesce(wallet->>'color', 'from-emerald-700 to-teal-600'),
    coalesce((wallet->>'isCustom')::boolean, true),
    wallet_position::integer - 1
  from jsonb_array_elements(wallet_rows) with ordinality as rows(wallet, wallet_position);

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
  from jsonb_array_elements(ledger_rows) as rows(entry);

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

revoke all on function public.replace_wallet_lab_state(uuid, jsonb, jsonb, bigint)
  from public;
grant execute on function public.replace_wallet_lab_state(uuid, jsonb, jsonb, bigint)
  to authenticated;
