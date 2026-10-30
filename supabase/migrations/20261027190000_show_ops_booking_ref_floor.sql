-- Show Ops · 27 Oct 2026: booking refs keep counting after old bookings are removed
--
-- MHT cleared its imported history before go-live (kept in backup_20261027).
-- The next ref was max(booking_ref_num) + 1 over live bookings, so an empty
-- table would restart the series at MHT-1000. The business now remembers the
-- highest number already used and new refs continue above it (MHT-319918, …).

alter table public.businesses
  add column if not exists show_ops_booking_ref_floor bigint;

comment on column public.businesses.show_ops_booking_ref_floor is
  'Highest booking ref number already used, including bookings since removed. New refs continue above it.';

create or replace function public.show_ops_next_booking_ref(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
  series text;
  cfg jsonb;
  ref_floor bigint;
begin
  if not public.show_ops_can_access(p_business_id)
     and public.show_ops_seller_supplier_id(p_business_id) is null then
    raise exception 'not allowed';
  end if;

  select show_ops_config, show_ops_booking_ref_floor into cfg, ref_floor from public.businesses where id = p_business_id;

  -- Series: the invoice series in config, else MHT for the legacy tracker, else SO.
  series := nullif(upper(regexp_replace(coalesce(cfg #>> '{invoice,series}', ''), '[^A-Za-z0-9]', '', 'g')), '');
  if series is null and coalesce(cfg #>> '{feature_flags,mht_tracker_v1}', '') in ('true', '1') then
    series := 'MHT';
  end if;
  series := coalesce(series, 'SO');

  -- One booking at a time per business so two desks cannot mint the same number.
  perform pg_advisory_xact_lock(hashtext('show_ops_booking_ref:' || p_business_id::text));

  select coalesce(max(booking_ref_num), 0) + 1
    into n
    from public.show_bookings
   where business_id = p_business_id;
  n := greatest(n, coalesce(ref_floor, 0) + 1, 1000);

  return series || '-' || n::text;
end;
$$;

revoke all on function public.show_ops_next_booking_ref(uuid) from public;
grant execute on function public.show_ops_next_booking_ref(uuid) to authenticated;
