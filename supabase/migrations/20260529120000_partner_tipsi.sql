-- Tipsi Pro bundle: link Solvio businesses to a Tipsi venue id (no second Twilio account).

alter table public.businesses
  add column if not exists partner_tipsi_business_id text;

create unique index if not exists businesses_partner_tipsi_business_id_key
  on public.businesses (partner_tipsi_business_id)
  where partner_tipsi_business_id is not null;

comment on column public.businesses.partner_tipsi_business_id is
  'Tipsi businesses.id when provisioned via Tipsi Pro (£50) bundle — grants booking tier without Solvio Stripe.';
