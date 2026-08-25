-- Cached Stripe Connect health for dashboard alerts (synced via webhook + refresh).

alter table public.businesses
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_disabled_reason text,
  add column if not exists stripe_connect_requirements_due jsonb not null default '[]'::jsonb;

comment on column public.businesses.stripe_connect_disabled_reason is
  'Stripe Account requirements.disabled_reason when charges are blocked.';
comment on column public.businesses.stripe_connect_requirements_due is
  'JSON array of Stripe requirement field names currently or past due.';
