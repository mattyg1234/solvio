-- Show Ops · 5 Sept 2026 · Joel's notes
--
-- How the guest paid (cash / card / direct / transfer). Picked on the booking
-- form, shown on the edit page and the desk, exported in bookings.csv. Blank
-- when the office has not said yet.

alter table public.show_bookings
  add column if not exists payment_method text;

alter table public.show_bookings drop constraint if exists show_bookings_payment_method_check;
alter table public.show_bookings
  add constraint show_bookings_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'card', 'direct', 'transfer'));

comment on column public.show_bookings.payment_method is
  'How the guest paid: cash, card, direct or transfer. Null until the office picks one.';
