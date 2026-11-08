-- Year on year (Joel, 8 Nov 2026): last year's pax per show night and island,
-- loaded from Joel's night tracker or the old booking system export, so Reports
-- can show "pax vs last year" now that the old bookings are out of the Hub.
-- Where a night/island has a row here, Reports uses it instead of counting Hub bookings.
-- Additive only: new table, nothing existing is changed.

create table if not exists public.show_last_year_pax (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  show_date date not null,
  island text not null,
  pax integer not null check (pax >= 0),
  source text,
  updated_at timestamptz not null default now(),
  unique (business_id, show_date, island)
);

create index if not exists show_last_year_pax_business_date_idx
  on public.show_last_year_pax (business_id, show_date);

alter table public.show_last_year_pax enable row level security;

-- Hub staff only (owner or a non-seller member); partners never see it.
drop policy if exists show_last_year_pax_staff on public.show_last_year_pax;
create policy show_last_year_pax_staff on public.show_last_year_pax
  for all to authenticated
  using (
    exists (select 1 from public.businesses b where b.id = show_last_year_pax.business_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.show_ops_members m
      where m.business_id = show_last_year_pax.business_id and m.user_id = (select auth.uid()) and m.role <> 'seller')
  )
  with check (
    exists (select 1 from public.businesses b where b.id = show_last_year_pax.business_id and b.owner_id = (select auth.uid()))
    or exists (select 1 from public.show_ops_members m
      where m.business_id = show_last_year_pax.business_id and m.user_id = (select auth.uid()) and m.role <> 'seller')
  );

grant select, insert, update, delete on public.show_last_year_pax to authenticated;
