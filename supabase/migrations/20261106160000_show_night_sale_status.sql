-- Night sale status (Joel, 6 Nov 2026): replaces the nightly "RES HAND OVER FORM"
-- email. Per show night and island, staff mark what has been done on the outside
-- channels. A cross means closed / done; blank means nothing done yet.
--   transport_closed  - transport no longer available for that night
--   part_stop_sale    - stop sale email sent, Tiqets & Viator closed, GYG / MHT web reduced
--   full_stop_sale    - everything closed online
-- Record only: it does not block bookings or email partners. The existing
-- Part close / Full close (show_night_closes) still does that.
-- Additive only: new table, nothing existing is changed.

create table if not exists public.show_night_sale_status (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  show_date date not null,
  island text not null,
  transport_closed boolean not null default false,
  part_stop_sale boolean not null default false,
  full_stop_sale boolean not null default false,
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  unique (business_id, show_date, island)
);

create index if not exists show_night_sale_status_business_date_idx
  on public.show_night_sale_status (business_id, show_date);

alter table public.show_night_sale_status enable row level security;

-- Hub staff only (owner or a non-seller member); partners never see it.
drop policy if exists show_night_sale_status_staff on public.show_night_sale_status;
create policy show_night_sale_status_staff on public.show_night_sale_status
  for all to authenticated
  using (
    exists (select 1 from public.businesses b where b.id = show_night_sale_status.business_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.show_ops_members m
      where m.business_id = show_night_sale_status.business_id and m.user_id = (select auth.uid()) and m.role <> 'seller')
  )
  with check (
    exists (select 1 from public.businesses b where b.id = show_night_sale_status.business_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.show_ops_members m
      where m.business_id = show_night_sale_status.business_id and m.user_id = (select auth.uid()) and m.role <> 'seller')
  );

-- Same island scope as the other night tables.
drop policy if exists show_night_sale_status_island_scope on public.show_night_sale_status;
create policy show_night_sale_status_island_scope on public.show_night_sale_status
  as restrictive for all to authenticated
  using (private.show_ops_island_access(business_id, island))
  with check (private.show_ops_island_access(business_id, island));

grant select, insert, update, delete on public.show_night_sale_status to authenticated;
