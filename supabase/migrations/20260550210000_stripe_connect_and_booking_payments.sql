-- Stripe Connect readiness flags + booking deposit tracking

alter table public.businesses
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_details_submitted boolean not null default false;

alter table public.booking_requests
  add column if not exists payment_status text not null default 'none',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists deposit_amount_cents integer;

comment on column public.booking_requests.payment_status is 'none | pending | paid | failed | waived';

create index if not exists booking_requests_stripe_checkout_idx
  on public.booking_requests (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
