-- Show Ops money correctness: transport prices, cancel, invoice void, pax checks.

alter table public.show_products
  add column if not exists adult_price_no_transport numeric(12,2),
  add column if not exists child_price_no_transport numeric(12,2),
  add column if not exists infant_price_no_transport numeric(12,2);

alter table public.show_bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null,
  add column if not exists cancel_reason text;

create index if not exists show_bookings_active_idx
  on public.show_bookings (business_id, show_date)
  where cancelled_at is null;

alter table public.show_bookings
  drop constraint if exists show_bookings_pax_nonneg;
alter table public.show_bookings
  add constraint show_bookings_pax_nonneg
  check (adults >= 0 and children >= 0 and infants >= 0);

alter table public.show_invoices
  add column if not exists voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users (id) on delete set null;

create index if not exists show_invoices_voided_idx
  on public.show_invoices (business_id, voided);

-- Unpaid deposit bookings stored "door balance" (total − deposit) with zero payments.
-- Outstanding is now the full total until money is recorded.
update public.show_bookings
set balance_remaining = total_cost
where billing_mode = 'deposit'
  and payment_status = 'unpaid'
  and cancelled_at is null;
