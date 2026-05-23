-- Add 'booking' subscription tier (£89/mo — booking system + 30 demo AI minutes, no full receptionist)
-- Requires dropping and recreating the check constraint (Postgres doesn't support ALTER CONSTRAINT).

alter table public.businesses
  drop constraint if exists businesses_subscription_tier_check;

alter table public.businesses
  add constraint businesses_subscription_tier_check
  check (subscription_tier in ('trial', 'booking', 'pro', 'business', 'scale', 'enterprise'));

comment on column public.businesses.subscription_tier is
  'Active Stripe subscription tier. Updated by webhook on checkout.session.completed. booking=£89 booking-only+30 demo AI min; pro=£200 full AI; scale=£499 unlimited.';
