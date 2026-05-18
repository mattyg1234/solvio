/*
 * Merchant accounts (operators): profile row per auth user + optional business row from signup metadata.
 * Apply via Supabase Dashboard → SQL Editor (paste & run), or: supabase db push (when CLI is linked).
 */

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  stripe_connect_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_id_idx on public.businesses (owner_id);

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = (select auth.uid()));

drop policy if exists "businesses_select_own" on public.businesses;
drop policy if exists "businesses_insert_own" on public.businesses;
drop policy if exists "businesses_update_own" on public.businesses;
drop policy if exists "businesses_delete_own" on public.businesses;

create policy "businesses_select_own"
on public.businesses for select to authenticated
using (owner_id = (select auth.uid()));

create policy "businesses_insert_own"
on public.businesses for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "businesses_update_own"
on public.businesses for update to authenticated
using (owner_id = (select auth.uid()));

create policy "businesses_delete_own"
on public.businesses for delete to authenticated
using (owner_id = (select auth.uid()));

-- ── Auth hook: profile + optional business ───────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
begin
  biz_name := coalesce(new.raw_user_meta_data ->> 'business_name', '');

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  if length(trim(biz_name)) > 0 then
    insert into public.businesses (owner_id, name)
    values (new.id, trim(biz_name));
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user();
