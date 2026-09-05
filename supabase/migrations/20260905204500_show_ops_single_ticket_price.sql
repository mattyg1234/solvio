-- Preserve the existing own-way ticket price when retiring paired bus prices.
-- Bookings, pricing snapshots and invoices are deliberately not updated.
update public.show_products set
 adult_price=coalesce(adult_price_no_transport,adult_price),
 child_price=coalesce(child_price_no_transport,child_price),
 infant_price=coalesce(infant_price_no_transport,infant_price),
 adult_price_no_transport=null,child_price_no_transport=null,infant_price_no_transport=null
where adult_price_no_transport is not null or child_price_no_transport is not null or infant_price_no_transport is not null;
update public.show_ticket_types set
 adult_price=coalesce(adult_price_no_transport,adult_price),
 child_price=coalesce(child_price_no_transport,child_price),
 infant_price=coalesce(infant_price_no_transport,infant_price),
 adult_price_no_transport=null,child_price_no_transport=null,infant_price_no_transport=null
where adult_price_no_transport is not null or child_price_no_transport is not null or infant_price_no_transport is not null;
