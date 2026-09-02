-- Show Ops · MHT workspace clean-down before go-live (proposed 2 Sept 2026)
--
-- KEEP, untouched:  show_hotels (1,213), show_bus_stops (327), show_products (14),
--                   show_rate_prices (9,608), show_supplier_rates (39),
--                   show_pickup_timetables (418), show_ops_members, businesses.
--
-- REMOVE: the Lanzasoft mirror of bookings + everything hanging off them, the
--         partners flagged dead in their own names, the inactive pre-import seed
--         partners, and two leftover *_backup_20260815 tables from the August
--         migration work.
--
-- Run inside one transaction. Nothing here touches hotels, stops or shows.
-- Joel, 31 Aug: "When you remove things DONT WIPE HOTEL LISTS BUS STOPS".

begin;

-- 0. Data fix, not a deletion: "7 MHT LPA" is the Gran Canaria show but was
--    filed under Lanzarote, so the desk cannot book it once you pick GC.
update public.show_products set island = 'Gran Canaria', updated_at = now()
 where name = '7 MHT LPA' and island = 'Lanzarote';

-- 1. Bookings and their dependants (invoices, lines, payments, night closes, bus orders).
delete from public.show_invoice_lines;
delete from public.show_invoices;
delete from public.show_booking_payments;
delete from public.show_night_closes;
delete from public.show_bus_orders;
delete from public.show_bookings;

-- 2. Partners flagged dead in their own name (28 rows as of 2 Sept).
delete from public.show_suppliers
 where name ~* '(do not use|closed down|not used|jordi test|joel test)';

-- 3. Partners already inactive (116 rows as of 2 Sept), which includes the
--    pre-import seed rows with lowercase types (agency / partner / shop / tour_op / hotel / direct).
delete from public.show_suppliers where active = false;

-- 4. Leftover working tables from 15 Aug.
drop table if exists public.show_bookings_supplier_backup_20260815;
drop table if exists public.show_suppliers_backup_20260815;

-- 5. Sanity: what is left.
select 'suppliers' as t, count(*) from public.show_suppliers
union all select 'hotels', count(*) from public.show_hotels
union all select 'stops', count(*) from public.show_bus_stops
union all select 'products', count(*) from public.show_products
union all select 'rate_prices', count(*) from public.show_rate_prices
union all select 'bookings', count(*) from public.show_bookings;

commit;
