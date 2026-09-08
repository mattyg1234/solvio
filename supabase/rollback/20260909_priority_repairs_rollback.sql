-- ROLLBACK for the 9 Sept 2026 priority-repair release (audit B01/B02/B03).
-- Run ONLY if the release must be reverted. Drops the new triggers, policies and
-- functions; keeps data. Opening-balance ledger rows (method 'import') stay:
-- the previous application code tolerates them and they are real history.
-- Pair with: git revert of the release commit, then redeploy.
begin;

-- B03 permissions (20260908221252)
drop trigger if exists show_ops_action_columns on public.show_bookings;
drop function if exists private.show_ops_guard_booking_action_columns();
drop policy if exists show_bookings_action_insert on public.show_bookings;
drop policy if exists show_bookings_action_update on public.show_bookings;
drop policy if exists show_bookings_action_delete on public.show_bookings;
drop policy if exists show_booking_payments_action_insert on public.show_booking_payments;
drop policy if exists show_booking_payments_action_update on public.show_booking_payments;
drop policy if exists show_booking_payments_action_delete on public.show_booking_payments;
drop policy if exists show_invoices_action_scope on public.show_invoices;
drop policy if exists show_invoice_lines_action_scope on public.show_invoice_lines;
do $$ declare t text; op text; begin
  foreach t in array array['show_products','show_ticket_types','show_extras','show_suppliers','show_supplier_rates','show_rate_prices','show_hotels','show_bus_stops'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    foreach op in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', t||'_action_'||op, t);
    end loop;
  end loop;
end $$;
drop function if exists private.show_ops_has_action(uuid,text,text[]);

-- B01 payments (20260908221214)
drop trigger if exists show_ops_booking_payment_summary on public.show_bookings;
drop trigger if exists show_ops_payment_summary on public.show_booking_payments;
drop trigger if exists show_ops_payment_insert_guard on public.show_booking_payments;
drop function if exists private.show_ops_guard_booking_payment_summary();
drop function if exists private.show_ops_refresh_payment_summary();
drop function if exists private.show_ops_guard_payment_insert();
drop function if exists private.show_ops_ensure_opening(public.show_bookings);
drop index if exists public.show_booking_payments_one_opening;

-- B02 partner-link RPC (20260908221151)
drop function if exists public.show_ops_create_partner_link_booking(text,jsonb);
drop function if exists private.show_ops_create_partner_link_booking(text,jsonb);

delete from supabase_migrations.schema_migrations
 where version in ('20260908221151','20260908221214','20260908221252');
commit;

-- Balance restore, only if the pre-release snapshot exists and balances must go back:
-- update public.show_bookings b set balance_remaining = s.balance_remaining, payment_status = s.payment_status
--   from private.snap_20260909_show_bookings s where s.id = b.id;
