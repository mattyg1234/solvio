-- Show Ops: Stripe guest deposit payments (idempotent by Checkout session)

alter table public.show_booking_payments
  drop constraint if exists show_booking_payments_method_check;

alter table public.show_booking_payments
  add constraint show_booking_payments_method_check
  check (method in ('cash', 'card', 'transfer', 'stripe', 'other'));

alter table public.show_booking_payments
  add column if not exists stripe_checkout_session_id text;

create unique index if not exists show_booking_payments_stripe_session_uidx
  on public.show_booking_payments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
