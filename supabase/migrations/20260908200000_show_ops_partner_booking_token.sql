/*
 * Partner booking links: each partner gets a unique, unguessable token. Bookings
 * made through /p/<token> are stamped with that partner's supplier_id, so the
 * office knows who booked what without partners needing a login.
 */
alter table public.show_suppliers add column if not exists booking_token text;
update public.show_suppliers
   set booking_token = translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_')
 where booking_token is null;
create unique index if not exists show_suppliers_booking_token_key on public.show_suppliers (booking_token);
