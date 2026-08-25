-- Seller teammates: a seller can see other seller logins for the same supplier.

drop policy if exists show_ops_members_select on public.show_ops_members;
create policy show_ops_members_select on public.show_ops_members
  for select to authenticated
  using (
    public.show_ops_can_access(business_id)
    or user_id = (select auth.uid())
    or (
      role = 'seller'
      and supplier_id is not null
      and supplier_id = public.show_ops_seller_supplier_id(business_id)
    )
  );
