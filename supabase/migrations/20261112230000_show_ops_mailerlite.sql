-- MailerLite (Joel, 2 Nov): opted-in guests are added to MHT's MailerLite automatically.
-- Additive: one more integration provider, and four tracking columns on bookings.

alter table public.show_ops_integrations
  drop constraint if exists show_ops_integrations_provider_check;
alter table public.show_ops_integrations
  add constraint show_ops_integrations_provider_check check (provider in ('holded', 'twilio', 'mailerlite'));

alter table public.show_bookings
  add column if not exists mailerlite_synced_at timestamptz,
  add column if not exists mailerlite_subscriber_id text check (mailerlite_subscriber_id is null or char_length(mailerlite_subscriber_id) <= 40),
  add column if not exists mailerlite_removed_at timestamptz,
  add column if not exists mailerlite_error text check (mailerlite_error is null or char_length(mailerlite_error) <= 300);

create index if not exists show_bookings_mailerlite_waiting_idx
  on public.show_bookings (business_id, marketing_opt_in_at)
  where marketing_opt_in_at is not null and mailerlite_synced_at is null;
