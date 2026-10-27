/*
 * Email bookings: a bookings inbox can also be MHT's HubSpot Conversations inbox, read with a
 * HubSpot private app token (stored encrypted in show_email_booking_tokens, like Gmail's).
 */
alter table public.show_email_booking_connections drop constraint if exists show_email_booking_connections_provider_check;
alter table public.show_email_booking_connections
  add constraint show_email_booking_connections_provider_check check (provider in ('gmail', 'microsoft', 'hubspot'));
