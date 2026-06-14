create table if not exists public.scenario_profiles (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id text not null,
  profile_type text not null check (profile_type in ('person', 'merchant')),
  profile_data jsonb not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create table if not exists public.scenario_transactions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  transaction_id text not null,
  mode text not null check (mode in ('interpersonal', 'merchant')),
  payer_name text not null,
  recipient_name text not null,
  amount text not null,
  reference text not null,
  status text not null check (
    status in ('authorized', 'declined', 'expired', 'cancelled', 'refunded')
  ),
  receipt_number text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, transaction_id)
);

create index if not exists scenario_transactions_workspace_updated_idx
  on public.scenario_transactions(workspace_id, updated_at desc);

alter table public.scenario_profiles enable row level security;
alter table public.scenario_transactions enable row level security;

drop policy if exists "members can view scenario profiles"
  on public.scenario_profiles;
create policy "members can view scenario profiles"
on public.scenario_profiles for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can view scenario transactions"
  on public.scenario_transactions;
create policy "members can view scenario transactions"
on public.scenario_transactions for select
to authenticated
using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.scenario_profiles from authenticated;
revoke insert, update, delete on public.scenario_transactions from authenticated;
grant select on public.scenario_profiles to authenticated;
grant select on public.scenario_transactions to authenticated;

create or replace function public.load_scenario_lab_state(
  target_workspace_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  workspace_revision bigint;
  custom_people jsonb;
  custom_merchants jsonb;
  transactions jsonb;
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace membership required';
  end if;

  select revision into workspace_revision
  from public.workspaces
  where id = target_workspace_id;
  if workspace_revision is null then raise exception 'Workspace not found'; end if;

  select coalesce(jsonb_agg(profile_data order by display_order), '[]'::jsonb)
  into custom_people
  from public.scenario_profiles
  where workspace_id = target_workspace_id and profile_type = 'person';

  select coalesce(jsonb_agg(profile_data order by display_order), '[]'::jsonb)
  into custom_merchants
  from public.scenario_profiles
  where workspace_id = target_workspace_id and profile_type = 'merchant';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', transaction_id,
        'mode', mode,
        'payer', payer_name,
        'recipient', recipient_name,
        'amount', amount,
        'reference', reference,
        'status', status,
        'createdAt', created_at,
        'updatedAt', updated_at,
        'receiptNumber', receipt_number
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  )
  into transactions
  from public.scenario_transactions
  where workspace_id = target_workspace_id;

  return jsonb_build_object(
    'revision', workspace_revision,
    'customPeople', custom_people,
    'customMerchants', custom_merchants,
    'transactions', transactions
  );
end;
$$;

create or replace function public.replace_scenario_lab_state(
  target_workspace_id uuid,
  custom_people jsonb,
  custom_merchants jsonb,
  transaction_rows jsonb,
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
  if auth.uid() is null or not public.can_edit_workspace(target_workspace_id) then
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

  delete from public.scenario_transactions where workspace_id = target_workspace_id;
  delete from public.scenario_profiles where workspace_id = target_workspace_id;

  insert into public.scenario_profiles (
    workspace_id, profile_id, profile_type, profile_data, display_order
  )
  select
    target_workspace_id,
    profile->>'id',
    'person',
    profile,
    profile_position::integer - 1
  from jsonb_array_elements(coalesce(custom_people, '[]'::jsonb))
    with ordinality as profiles(profile, profile_position);

  insert into public.scenario_profiles (
    workspace_id, profile_id, profile_type, profile_data, display_order
  )
  select
    target_workspace_id,
    profile->>'id',
    'merchant',
    profile,
    profile_position::integer - 1
  from jsonb_array_elements(coalesce(custom_merchants, '[]'::jsonb))
    with ordinality as profiles(profile, profile_position);

  insert into public.scenario_transactions (
    workspace_id, transaction_id, mode, payer_name, recipient_name,
    amount, reference, status, receipt_number, created_at, updated_at
  )
  select
    target_workspace_id,
    transaction->>'id',
    transaction->>'mode',
    transaction->>'payer',
    transaction->>'recipient',
    transaction->>'amount',
    transaction->>'reference',
    transaction->>'status',
    transaction->>'receiptNumber',
    (transaction->>'createdAt')::timestamptz,
    (transaction->>'updatedAt')::timestamptz
  from jsonb_array_elements(coalesce(transaction_rows, '[]'::jsonb))
    as transactions(transaction);

  update public.workspaces
  set revision = revision + 1, updated_at = now(), updated_by = auth.uid()
  where id = target_workspace_id
  returning revision into next_revision;

  return next_revision;
end;
$$;

revoke all on function public.load_scenario_lab_state(uuid) from public;
revoke all on function public.replace_scenario_lab_state(
  uuid, jsonb, jsonb, jsonb, bigint
) from public;

grant execute on function public.load_scenario_lab_state(uuid) to authenticated;
grant execute on function public.replace_scenario_lab_state(
  uuid, jsonb, jsonb, jsonb, bigint
) to authenticated;
