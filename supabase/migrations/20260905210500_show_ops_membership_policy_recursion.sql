-- Break the businesses -> members -> businesses RLS expansion loop.
-- FOR ALL membership policies also participate in SELECT; an inline owner lookup
-- therefore recurses even when another permissive policy grants self access.
create or replace function private.show_ops_is_business_owner(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())
  );
$$;

-- Workspace discovery includes seller memberships, unlike staff booking access.
create or replace function private.show_ops_current_member_businesses()
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct m.business_id), '{}'::uuid[])
  from public.show_ops_members m
  where m.user_id = (select auth.uid());
$$;

revoke all on function private.show_ops_is_business_owner(uuid) from public;
revoke all on function private.show_ops_current_member_businesses() from public;
grant execute on function private.show_ops_is_business_owner(uuid) to authenticated;
grant execute on function private.show_ops_current_member_businesses() to authenticated;

-- Preserve the legacy policy's strict owner semantics. Other admin/invitation
-- policies and restrictive island/role checks remain independent and unchanged.
alter policy show_ops_members_write on public.show_ops_members
  using (private.show_ops_is_business_owner(business_id))
  with check (private.show_ops_is_business_owner(business_id));

alter policy businesses_select_show_ops_member on public.businesses
  using (id = any ((select private.show_ops_current_member_businesses())::uuid[]));
