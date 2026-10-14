-- Partner billing details in the shape a full invoice (and Holded's contact) needs:
-- the address split into street / postcode / town / province / country, payment
-- days, and whether the partner is a person or a company (14 Oct 2026).
-- Additive only; invoice_address keeps the street line.

alter table public.show_suppliers
  add column if not exists invoice_postal_code text check (invoice_postal_code is null or char_length(invoice_postal_code) <= 12),
  add column if not exists invoice_city text check (invoice_city is null or char_length(invoice_city) <= 120),
  add column if not exists invoice_province text check (invoice_province is null or char_length(invoice_province) <= 120),
  add column if not exists invoice_country_code text not null default 'ES' check (invoice_country_code ~ '^[A-Z]{2}$'),
  add column if not exists payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 365),
  add column if not exists is_person boolean not null default false;

comment on column public.show_suppliers.invoice_address is 'Billing street line (number, street). Postcode, town, province and country have their own columns.';
comment on column public.show_suppliers.payment_terms_days is 'Days to pay this partner''s invoices; empty = the workspace default.';
