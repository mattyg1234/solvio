-- Guest QR tickets: opaque token on each booking (public /ticket/[token]).
alter table public.show_bookings
  add column if not exists ticket_token uuid;

update public.show_bookings
set ticket_token = gen_random_uuid()
where ticket_token is null;

alter table public.show_bookings
  alter column ticket_token set default gen_random_uuid(),
  alter column ticket_token set not null;

create unique index if not exists show_bookings_ticket_token_uidx
  on public.show_bookings (ticket_token);
