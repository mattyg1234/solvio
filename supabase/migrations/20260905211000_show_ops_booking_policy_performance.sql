-- Evaluate the caller's memberships once per statement instead of querying them for every booking.
-- The result contains only the current caller's access. It is never shared across requests.
create or replace function private.show_ops_current_staff_businesses()
returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct business_id),'{}'::uuid[]) from (
  select b.id business_id from public.businesses b where b.owner_id=(select auth.uid())
  union all
  select m.business_id from public.show_ops_members m where m.user_id=(select auth.uid()) and m.role in ('booker','office','finance','admin')
 ) scopes;
$$;
create or replace function private.show_ops_current_island_scopes()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(business_id::text,coalesce(to_jsonb(allowed_islands),'null'::jsonb) order by is_owner),'{}'::jsonb) from (
  select m.business_id,m.allowed_islands,false is_owner from public.show_ops_members m where m.user_id=(select auth.uid())
  union all
  select b.id,null::text[],true from public.businesses b where b.owner_id=(select auth.uid())
 ) scopes;
$$;
revoke all on function private.show_ops_current_staff_businesses() from public;
revoke all on function private.show_ops_current_island_scopes() from public;
grant execute on function private.show_ops_current_staff_businesses() to authenticated;
grant execute on function private.show_ops_current_island_scopes() to authenticated;

alter policy show_bookings_sel on public.show_bookings using(
 business_id=any((select private.show_ops_current_staff_businesses())::uuid[])
);
alter policy show_bookings_w on public.show_bookings using(
 business_id=any((select private.show_ops_current_staff_businesses())::uuid[])
) with check(
 business_id=any((select private.show_ops_current_staff_businesses())::uuid[])
);
alter policy show_bookings_island_scope on public.show_bookings using(
 coalesce(((select private.show_ops_current_island_scopes())->business_id::text)='null'::jsonb
 or ((select private.show_ops_current_island_scopes())->business_id::text) ? island,false)
) with check(
 coalesce(((select private.show_ops_current_island_scopes())->business_id::text)='null'::jsonb
 or ((select private.show_ops_current_island_scopes())->business_id::text) ? island,false)
);
