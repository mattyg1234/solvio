begin;

-- B03 / DB3: role floors AND current page grants, in addition to existing RLS.
-- No permissive tenant/island/seller policy is replaced. NULL and empty page
-- arrays retain nav.ts role defaults; empty island arrays still mean no access.
create or replace function private.show_ops_has_action(
  p_business_id uuid, p_needed text, p_pages text[]
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  member_role text;
  pages text[];
  ranks constant text[] := array['seller','booker','office','finance','admin','owner'];
  all_pages constant text[] := array['dashboard','calendar','shows','bookings','door','invoices','partners','hotels','buses','outlook','reports','lists','settings'];
begin
  if not exists(select 1 from public.businesses b where b.id=p_business_id and b.show_ops_enabled) then
    return false;
  end if;
  if exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=(select auth.uid())) then
    member_role := 'owner';
  else
    select m.role,m.allowed_pages into member_role,pages from public.show_ops_members m
    where m.business_id=p_business_id and m.user_id=(select auth.uid());
  end if;
  if member_role is null or member_role='seller' or array_position(ranks,p_needed) is null
     or coalesce(array_position(ranks,member_role),0)<array_position(ranks,p_needed) then
    return false;
  end if;
  if coalesce(cardinality(pages),0)=0 then
    pages := case member_role
      when 'booker' then array['dashboard','calendar','bookings','door','lists']
      when 'office' then array['dashboard','calendar','bookings','door','lists','buses','outlook','reports']
      when 'finance' then array['dashboard','calendar','bookings','door','lists','buses','outlook','reports','invoices']
      when 'admin' then all_pages
      when 'owner' then all_pages
      else '{}'::text[] end;
  end if;
  pages := array_replace(pages,'stats','reports');
  return exists(select 1 from unnest(p_pages) wanted(page)
    where page=any(all_pages) and page=any(pages)
      and (page not in ('shows','partners','hotels','settings') or member_role in ('admin','owner'))
      and (page<>'invoices' or member_role in ('finance','admin','owner')));
end;
$$;
revoke all on function private.show_ops_has_action(uuid,text,text[]) from public;
grant execute on function private.show_ops_has_action(uuid,text,text[]) to authenticated;

-- Invoice data is finance-only even if a legacy FOR ALL policy grants access.
create policy show_invoices_action_scope on public.show_invoices as restrictive for all to authenticated
using(private.show_ops_has_action(business_id,'finance',array['invoices']))
with check(private.show_ops_has_action(business_id,'finance',array['invoices']));
create policy show_invoice_lines_action_scope on public.show_invoice_lines as restrictive for all to authenticated
using(private.show_ops_has_action(business_id,'finance',array['invoices']))
with check(private.show_ops_has_action(business_id,'finance',array['invoices']));

-- Keep catalogue reads used to price bookings. Mutations need the matching tab.
-- Some legacy catalogue tables are absent from the repository baseline; only
-- attach policies where they exist, as the existing island migration does.
do $$ declare t text; pages text[]; op text; predicate text; begin
  foreach t in array array['show_products','show_ticket_types','show_extras','show_suppliers','show_supplier_rates','show_rate_prices','show_hotels','show_bus_stops'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    pages := case
      when t in ('show_products','show_ticket_types','show_extras') then array['shows']
      when t in ('show_suppliers','show_supplier_rates') then array['partners']
      when t='show_rate_prices' then array['shows','partners']
      else array['hotels'] end;
    predicate := format('private.show_ops_has_action(business_id,''admin'',%L::text[])',pages);
    foreach op in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        t||'_action_'||op,t,op,case op
          when 'insert' then 'with check('||predicate||')'
          when 'update' then 'using('||predicate||') with check('||predicate||')'
          else 'using('||predicate||')' end);
    end loop;
  end loop;
end $$;

-- Manual receipts: office + bookings. Door receipts: booker + door/lists,
-- cash/card only. Import/Stripe receipts belong to trusted payment integrations.
-- The payment worker owns validation, locking, opening imports and summaries.
create policy show_booking_payments_action_insert on public.show_booking_payments as restrictive for insert to authenticated
with check(
  (method in ('cash','card','transfer','other') and private.show_ops_has_action(business_id,'office',array['bookings']))
  or (method in ('cash','card') and private.show_ops_has_action(business_id,'booker',array['door','lists']))
);
create policy show_booking_payments_action_update on public.show_booking_payments as restrictive for update to authenticated
using(false) with check(false);
create policy show_booking_payments_action_delete on public.show_booking_payments as restrictive for delete to authenticated
using(false);

-- Preserve the existing seller INSERT path, never grant seller raw row reads
-- or updates. Membership/supplier/capacity/island policies still apply.
create policy show_bookings_action_insert on public.show_bookings as restrictive for insert to authenticated
with check(
  (private.show_ops_has_action(business_id,'booker',array['bookings'])
    or (not public.show_ops_can_access(business_id) and supplier_id=public.show_ops_seller_supplier_id(business_id)))
  and (invoice_id is null or private.show_ops_has_action(business_id,'finance',array['invoices']))
);
create policy show_bookings_action_update on public.show_bookings as restrictive for update to authenticated
using(
  private.show_ops_has_action(business_id,'booker',array['bookings','door','lists','buses'])
  or private.show_ops_has_action(business_id,'finance',array['invoices'])
  or private.show_ops_has_action(business_id,'admin',array['shows'])
)
with check(
  private.show_ops_has_action(business_id,'booker',array['bookings','door','lists','buses'])
  or private.show_ops_has_action(business_id,'finance',array['invoices'])
  or private.show_ops_has_action(business_id,'admin',array['shows'])
);
-- Staff cancel bookings; there is no hard-delete UI or audited receipt reversal.
-- This also prevents deleting a booking to cascade-delete its immutable ledger.
create policy show_bookings_action_delete on public.show_bookings as restrictive for delete to authenticated using(false);

create or replace function private.show_ops_guard_booking_action_columns()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  before_row jsonb := to_jsonb(old);
  after_row jsonb := to_jsonb(new);
  columns_allowed text[] := array['updated_at','updated_by'];
begin
  -- Trusted service work and migration sessions remain possible. Do not bypass
  -- based on CURRENT_USER alone: seller RPCs also execute as a definer owner.
  if (select auth.uid()) is null or current_setting('role',true)='service_role' then return new; end if;

  -- Only payment-trigger summary propagation may skip the column permissions.
  -- Trigger depth alone is insufficient: no guest, price, invoice, island or
  -- payment-method changes can ride along with this exemption.
  if pg_trigger_depth()>1
    and (after_row-array['balance_remaining','payment_status','updated_at','updated_by'])
      =(before_row-array['balance_remaining','payment_status','updated_at','updated_by'])
    and (private.show_ops_has_action(old.business_id,'office',array['bookings'])
      or private.show_ops_has_action(old.business_id,'booker',array['door','lists'])) then
    return new;
  end if;

  -- The existing seller photo RPC checks ownership/path/storage. Preserve its
  -- narrow update without opening any raw seller UPDATE policy.
  if not public.show_ops_can_access(old.business_id)
    and old.supplier_id=public.show_ops_seller_supplier_id(old.business_id)
    and old.created_by=(select auth.uid())
    and (after_row-array['no_show_proof_path','updated_at','updated_by'])
      =(before_row-array['no_show_proof_path','updated_at','updated_by']) then
    return new;
  end if;

  if new.invoice_id is distinct from old.invoice_id
    and not private.show_ops_has_action(old.business_id,'finance',array['invoices']) then
    raise exception using errcode='42501',message='Invoice changes require finance and invoices access';
  end if;
  if (after_row->'cancelled_at' is distinct from before_row->'cancelled_at'
      or after_row->'cancelled_by' is distinct from before_row->'cancelled_by'
      or after_row->'cancel_reason' is distinct from before_row->'cancel_reason')
    and not private.show_ops_has_action(old.business_id,'office',array['bookings']) then
    raise exception using errcode='42501',message='Cancellation requires office and bookings access';
  end if;
  if private.show_ops_has_action(old.business_id,'booker',array['bookings']) then return new; end if;

  if private.show_ops_has_action(old.business_id,'booker',array['door','lists']) then
    columns_allowed := columns_allowed || array['arrived_at','arrived_pax','door_pay_method','no_show','list_checked_by',
      'no_show_charge','no_show_decided_at','no_show_decided_by','no_show_proof_path'];
  end if;
  if private.show_ops_has_action(old.business_id,'booker',array['lists','buses']) then
    columns_allowed := columns_allowed || array['pickup_stop_id','pickup_stop_name','pickup_time','transport_required'];
  end if;
  if private.show_ops_has_action(old.business_id,'finance',array['invoices']) then
    columns_allowed := columns_allowed || array['invoice_id'];
  end if;
  if private.show_ops_has_action(old.business_id,'admin',array['shows'])
    and old.invoice_id is null and old.cancelled_at is null then
    columns_allowed := columns_allowed || array['show_name','ticket_type_name','pricing_snapshot','island','total_cost',
      'deposit_amount','nett_total','adult_nett_total','child_nett_total','infant_nett_total','extras_snapshot',
      'billing_mode','balance_remaining','payment_status'];
  end if;
  if (after_row-columns_allowed) is distinct from (before_row-columns_allowed) then
    raise exception using errcode='42501',message='Booking changes exceed your permitted pages';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_booking_action_columns() from public;
create trigger show_ops_action_columns before update on public.show_bookings
for each row execute function private.show_ops_guard_booking_action_columns();

commit;
