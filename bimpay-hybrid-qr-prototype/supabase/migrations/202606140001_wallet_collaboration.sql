create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.wallet_profiles (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id text not null,
  owner_name text not null check (char_length(owner_name) between 1 and 60),
  funding_model text not null check (
    funding_model in ('prepaid', 'bank-linked', 'hybrid', 'bank-direct')
  ),
  wallet_balance numeric(12, 2) not null default 0 check (wallet_balance >= 0),
  bank_balance numeric(12, 2) not null default 0 check (bank_balance >= 0),
  bank_name text not null default '',
  bank_detail text not null default '',
  wallet_identifier text not null,
  color text not null default 'from-emerald-700 to-teal-600',
  is_custom boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, profile_id),
  unique (workspace_id, wallet_identifier),
  check (funding_model not in ('bank-linked', 'bank-direct') or wallet_balance = 0)
);

create table if not exists public.ledger_entries (
  workspace_id uuid not null,
  entry_id text not null,
  owner_profile_id text not null,
  title text not null,
  detail text not null default '',
  amount numeric(12, 2) not null,
  balance_type text not null check (balance_type in ('wallet', 'bank')),
  reference text not null,
  created_at timestamptz not null,
  primary key (workspace_id, entry_id),
  foreign key (workspace_id, owner_profile_id)
    references public.wallet_profiles(workspace_id, profile_id)
    on delete cascade
);

create index if not exists workspace_members_user_id_idx
  on public.workspace_members(user_id);
create index if not exists ledger_entries_workspace_created_at_idx
  on public.ledger_entries(workspace_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.wallet_profiles enable row level security;
alter table public.ledger_entries enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

drop policy if exists "members can view workspaces" on public.workspaces;
create policy "members can view workspaces"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists "members can view memberships" on public.workspace_members;
create policy "members can view memberships"
on public.workspace_members for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can view wallet profiles" on public.wallet_profiles;
create policy "members can view wallet profiles"
on public.wallet_profiles for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "editors can insert wallet profiles" on public.wallet_profiles;
create policy "editors can insert wallet profiles"
on public.wallet_profiles for insert
to authenticated
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "editors can update wallet profiles" on public.wallet_profiles;
create policy "editors can update wallet profiles"
on public.wallet_profiles for update
to authenticated
using (public.can_edit_workspace(workspace_id))
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "editors can delete wallet profiles" on public.wallet_profiles;
create policy "editors can delete wallet profiles"
on public.wallet_profiles for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

drop policy if exists "members can view ledger entries" on public.ledger_entries;
create policy "members can view ledger entries"
on public.ledger_entries for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "editors can insert ledger entries" on public.ledger_entries;
create policy "editors can insert ledger entries"
on public.ledger_entries for insert
to authenticated
with check (public.can_edit_workspace(workspace_id));

drop policy if exists "editors can delete ledger entries" on public.ledger_entries;
create policy "editors can delete ledger entries"
on public.ledger_entries for delete
to authenticated
using (public.can_edit_workspace(workspace_id));

create or replace function public.create_sandbox_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.workspaces (name, created_by)
  values (left(trim(workspace_name), 80), auth.uid())
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'owner');

  return new_workspace_id;
end;
$$;

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table (user_id uuid, email text, role text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select members.user_id, users.email::text, members.role
  from public.workspace_members members
  join auth.users users on users.id = members.user_id
  where members.workspace_id = target_workspace_id
    and public.is_workspace_member(target_workspace_id)
  order by
    case members.role when 'owner' then 0 when 'editor' then 1 else 2 end,
    users.email;
$$;

create or replace function public.add_workspace_member_by_email(
  target_workspace_id uuid,
  member_email text,
  member_role text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invited_user_id uuid;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Workspace owner permission required';
  end if;
  if member_role not in ('editor', 'viewer') then
    raise exception 'Member role must be editor or viewer';
  end if;

  select id into invited_user_id
  from auth.users
  where lower(email) = lower(trim(member_email));

  if invited_user_id is null then
    raise exception 'User must be invited through Supabase Auth before workspace access is granted';
  end if;
  if exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = invited_user_id
      and role = 'owner'
  ) then
    raise exception 'The workspace owner role cannot be changed';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (target_workspace_id, invited_user_id, member_role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    raise exception 'Workspace owner permission required';
  end if;

  delete from public.workspace_members
  where workspace_id = target_workspace_id
    and user_id = member_user_id
    and role <> 'owner';
end;
$$;

create or replace function public.replace_wallet_lab_state(
  target_workspace_id uuid,
  wallet_rows jsonb,
  ledger_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_workspace(target_workspace_id) then
    raise exception 'Workspace edit permission required';
  end if;

  delete from public.ledger_entries where workspace_id = target_workspace_id;
  delete from public.wallet_profiles where workspace_id = target_workspace_id;

  insert into public.wallet_profiles (
    workspace_id,
    profile_id,
    owner_name,
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
  set updated_at = now()
  where id = target_workspace_id;
end;
$$;

revoke all on function public.create_sandbox_workspace(text) from public;
revoke all on function public.list_workspace_members(uuid) from public;
revoke all on function public.add_workspace_member_by_email(uuid, text, text) from public;
revoke all on function public.remove_workspace_member(uuid, uuid) from public;
revoke all on function public.replace_wallet_lab_state(uuid, jsonb, jsonb) from public;
grant execute on function public.create_sandbox_workspace(text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.add_workspace_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.replace_wallet_lab_state(uuid, jsonb, jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.workspaces;
exception
  when duplicate_object then null;
end
$$;
