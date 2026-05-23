-- Add stripe_customer_id to businesses so we can match subscription lifecycle events
-- (customer.subscription.deleted / updated) back to the right merchant.
alter table public.businesses
  add column if not exists stripe_customer_id text;

create index if not exists businesses_stripe_customer_id_idx
  on public.businesses (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.businesses.stripe_customer_id is
  'Stripe customer ID stored on first subscription checkout. Used to handle subscription.deleted events.';
