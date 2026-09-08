/*
 * Imported paid balances (audit B01).
 *
 * Bookings imported from Lanzasoft carry a paid amount on the booking row
 * (total_cost − balance_remaining) but the payment ledger has no rows for them.
 * Every path that recalculates a deposit balance sums the ledger, so a note-only
 * edit or a door payment could reset a paid booking to "owes everything".
 *
 * Fix: one opening-balance ledger row per affected booking, method 'import',
 * so the ledger and the booking agree. Idempotent — only bookings with a
 * recorded paid amount and no ledger rows are touched. Reports already filter
 * on card/stripe, so these rows never count as till takings.
 */

alter table public.show_booking_payments
  drop constraint if exists show_booking_payments_method_check;
alter table public.show_booking_payments
  add constraint show_booking_payments_method_check
  check (method in ('cash', 'card', 'transfer', 'stripe', 'import', 'other'));

insert into public.show_booking_payments (business_id, booking_id, amount, method, paid_at, note)
select
  b.business_id,
  b.id,
  round(b.total_cost - b.balance_remaining, 2),
  'import',
  coalesce(b.created_at, now()),
  'Opening balance imported from Lanzasoft (paid before Solvio)'
from public.show_bookings b
where b.billing_mode = 'deposit'
  and b.legacy_id is not null
  and round(b.total_cost - b.balance_remaining, 2) > 0
  and not exists (select 1 from public.show_booking_payments p where p.booking_id = b.id);

comment on constraint show_booking_payments_method_check on public.show_booking_payments is
  'import = opening balance carried over from the legacy system, not money taken in Solvio.';
