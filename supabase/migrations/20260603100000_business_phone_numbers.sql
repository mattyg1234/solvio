/*
 * Per-business inbound phone numbers (provisioned via Vapi).
 *
 * Each business gets their own dedicated number that points at their Vapi
 * assistant. Buying happens through the Solvio dashboard, billed on the Vapi
 * account. Solvio passes the cost to the merchant.
 */

alter table public.businesses
  add column if not exists vapi_phone_number_id text,
  add column if not exists phone_number_e164 text,
  add column if not exists phone_number_country text,
  add column if not exists phone_number_provisioned_at timestamptz;

comment on column public.businesses.vapi_phone_number_id is
  'Vapi phone-number resource id (PhoneNumber.id from POST /phone-number). Set when merchant buys their inbound number.';
comment on column public.businesses.phone_number_e164 is
  'Human-readable copy of the purchased number in E.164 format, for UI display + booking flows.';
comment on column public.businesses.phone_number_country is
  'ISO 3166-1 alpha-2 country code of the purchased number — used for UI grouping + future port flows.';

create index if not exists idx_businesses_phone_number
  on public.businesses (phone_number_e164)
  where phone_number_e164 is not null;
