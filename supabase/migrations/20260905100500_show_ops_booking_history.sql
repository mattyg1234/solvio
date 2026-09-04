-- Show Ops · 5 Sept 2026 · Joel's notes
--
-- Who changed what on a booking, and when. One row per save that actually
-- changed something the office cares about (guest, show, date, hotel, pick-up,
-- pax, partner, money, comments, payment method, ticket number) plus one row
-- on cancel. Shown newest-first at the bottom of the booking edit page.
--
-- changes is {"field": {"from": …, "to": …}, …}; changed_by_name is copied in
-- at write time so the line still reads right after a staff member leaves.

create table if not exists public.show_booking_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_id uuid not null references public.show_bookings (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users (id) on delete set null,
  changed_by_name text,
  changes jsonb not null
);

create index if not exists show_booking_history_booking_idx
  on public.show_booking_history (booking_id, changed_at desc);

create index if not exists show_booking_history_business_idx
  on public.show_booking_history (business_id, changed_at desc);

alter table public.show_booking_history enable row level security;

drop policy if exists show_booking_history_sel on public.show_booking_history;
create policy show_booking_history_sel on public.show_booking_history
  for select to authenticated
  using (public.show_ops_can_access(business_id));

-- Staff append; nobody edits or deletes history from the app.
drop policy if exists show_booking_history_ins on public.show_booking_history;
create policy show_booking_history_ins on public.show_booking_history
  for insert to authenticated
  with check (public.show_ops_can_access(business_id));

grant select, insert on public.show_booking_history to authenticated;

comment on table public.show_booking_history is
  'Audit trail of booking edits: {field: {from, to}} per save, plus cancellations.';
