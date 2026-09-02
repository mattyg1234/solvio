-- Show Ops · 2 Sept 2026 follow-ups from Joel's click-through
--
-- 1. Bus orders carry how many buses were ordered, not just the seats. LPA runs
--    two coaches on a busy night and the outlook could only say "100 seats".
-- 2. Booking refs sort numerically. Refs are text (MHT-L316713, MHT-1002,
--    SO-260901-00004) so "sort by ref" was alphabetical and meaningless. A stored
--    generated column holds the trailing number and the desk sorts on that.
-- 3. New booking refs continue the operator's own series (MHT-316714, …) instead
--    of a Solvio-wide SO-yymmdd-nnnnn counter that looked foreign next to the
--    imported history and never sorted with it.

alter table public.show_bus_orders
  add column if not exists bus_count integer not null default 1;

alter table public.show_bookings
  add column if not exists booking_ref_num bigint
  generated always as (nullif((regexp_match(booking_ref, '(\d+)\s*$'))[1], '')::bigint) stored;

create index if not exists show_bookings_ref_num_idx
  on public.show_bookings (business_id, booking_ref_num);

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
begin
  if not public.show_ops_can_access(p_business_id)
     and public.show_ops_seller_supplier_id(p_business_id) is null then
    raise exception 'not allowed';
  end if;

  select show_ops_config into cfg from public.businesses where id = p_business_id;

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
  if n < 1000 then
    n := 1000;
  end if;

  return series || '-' || n::text;
end;
$$;

revoke all on function public.show_ops_next_booking_ref(uuid) from public;
grant execute on function public.show_ops_next_booking_ref(uuid) to authenticated;
