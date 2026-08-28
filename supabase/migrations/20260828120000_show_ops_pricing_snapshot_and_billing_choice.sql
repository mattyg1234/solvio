/*
 * Show Ops — operator feedback follow-ups.
 *
 *  1. Pricing snapshot on every booking, so changing a partner nett or a show price
 *     never rewrites money on bookings that are already taken.
 *  2. Per-partner permission to choose deposit vs invoice at booking time.
 *  3. Catch-up for two columns that were applied straight to production and never
 *     made it into a migration file (show_bus_stops.zone / .runs_on).
 */

-- 1 ── Pricing snapshot ------------------------------------------------------
-- What the office actually quoted: unit prices, the nett % in force, and the bus
-- supplement, frozen at save time. Invoicing reads this instead of re-pricing.
alter table public.show_bookings
  add column if not exists pricing_snapshot jsonb;

comment on column public.show_bookings.pricing_snapshot is
  'Prices/rates in force when this booking was saved. Invoicing must use these, never live master data. Null on legacy imports, which still fall back to live pricing.';

-- 2 ── Partner may pick their own billing mode -------------------------------
alter table public.show_suppliers
  add column if not exists can_choose_billing_mode boolean not null default false;

comment on column public.show_suppliers.can_choose_billing_mode is
  'When true the booking desk may switch this partner between deposit and invoice on a single booking. Off for everyone else — their partner record decides.';

-- 3 ── Production catch-up ---------------------------------------------------
alter table public.show_bus_stops
  add column if not exists zone text,
  add column if not exists runs_on text;

comment on column public.show_bus_stops.zone is
  'Resort code driving the weekly outlook columns (CT, PB, PDC, TFS, TFW, CRZ, PDI, PR, …).';

-- 4 ── Backup mirror bucket ---------------------------------------------------
-- Private bucket the /api/cron/show-ops-backup job writes a whole-tenant snapshot
-- into every few minutes. Service-role only: no RLS policies, so nothing but the
-- cron can read or write it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('show-ops-backups', 'show-ops-backups', false, 524288000)
on conflict (id) do nothing;
