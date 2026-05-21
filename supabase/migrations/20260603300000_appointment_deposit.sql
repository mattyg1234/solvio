/*
 * Optional per-business appointment deposit.
 *
 * When > 0, public booking-form submissions of kind "appointment" are routed
 * through Stripe Connect Checkout for that amount before the booking is
 * accepted. When NULL/0, appointments stay as free booking_requests (current
 * behaviour). Mirrors the table-deposit flow.
 *
 * The booking submit server action reads this column directly via the service
 * role client — no RPC change needed for the MVP. A later iteration can
 * surface it in get_booking_public_context so the public form can render
 * "£X deposit at booking" before submit.
 */

alter table public.businesses
  add column if not exists appointment_deposit_cents integer
    check (appointment_deposit_cents is null or appointment_deposit_cents >= 0);

comment on column public.businesses.appointment_deposit_cents is
  'Optional flat deposit charged at booking time for appointment-kind bookings (in cents). NULL/0 = free request.';
