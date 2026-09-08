begin;

-- Audit B01: preserve imported receipts and serialize every payment writer.
-- This builds on the existing 'import' ledger convention. It does not classify
-- imported amounts as new bank/cash receipts or infer ambiguous old ledgers.
create schema if not exists private;

alter table public.show_booking_payments drop constraint if exists show_booking_payments_method_check;
alter table public.show_booking_payments add constraint show_booking_payments_method_check
  check (method in ('cash','card','transfer','stripe','import','other'));

create unique index show_booking_payments_one_opening
  on public.show_booking_payments(booking_id) where method='import';

create or replace function private.show_ops_ensure_opening(b public.show_bookings)
returns numeric language plpgsql security definer set search_path='' as $$
declare v_count bigint; v_opening bigint; v_paid numeric; v_recorded numeric;
begin
  select count(*),count(*) filter(where method='import'),coalesce(sum(amount),0)
    into v_count,v_opening,v_paid from public.show_booking_payments where booking_id=b.id;
  if b.legacy_id is not null and b.billing_mode='deposit' then
    if v_count>0 and v_opening=0 then
      raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
    end if;
    if v_count=0 then
      v_recorded := round(b.total_cost-b.balance_remaining,2);
      if v_recorded<0 or v_recorded::text in ('NaN','Infinity','-Infinity') then
        raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
      end if;
      insert into public.show_booking_payments(business_id,booking_id,amount,method,paid_at,note)
        values(b.business_id,b.id,v_recorded,'import',b.created_at,
          'Opening balance imported from Lanzasoft (paid before Solvio)');
      v_paid := v_recorded;
    end if;
  end if;
  return v_paid;
end;
$$;
revoke all on function private.show_ops_ensure_opening(public.show_bookings) from public,authenticated;

create or replace function private.show_ops_guard_payment_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare b public.show_bookings%rowtype; v_paid numeric; v_external boolean;
begin
  select * into b from public.show_bookings where id=new.booking_id for update;
  if not found or b.business_id is distinct from new.business_id then
    raise exception 'SHOW_OPS_PAYMENT_BOOKING_MISMATCH';
  end if;
  if new.amount is null or new.amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'SHOW_OPS_INVALID_PAYMENT_AMOUNT';
  end if;
  if new.method='import' then
    -- A private nested trigger may materialize the existing opening basis.
    -- Browser clients may never manufacture or replace imported receipts.
    if current_setting('role',true) in ('authenticated','anon') and pg_trigger_depth()<2 then
      raise exception 'SHOW_OPS_IMPORT_SERVICE_ONLY';
    end if;
    if b.legacy_id is null or b.billing_mode<>'deposit' or new.amount<0
      or new.amount is distinct from round(b.total_cost-b.balance_remaining,2)
      or exists(select 1 from public.show_booking_payments where booking_id=b.id) then
      raise exception 'SHOW_OPS_OPENING_BALANCE_RECONCILIATION_REQUIRED';
    end if;
    return new;
  end if;
  if new.amount<=0 then raise exception 'SHOW_OPS_INVALID_PAYMENT_AMOUNT'; end if;
  -- A real provider receipt must remain recorded even if an old checkout link
  -- overpaid or a cancellation raced its arrival. Browser callers cannot use
  -- this exception to bypass the amount check.
  v_external := new.method='stripe' and current_setting('role',true) not in ('authenticated','anon');
  if b.billing_mode<>'deposit' or (b.cancelled_at is not null and not v_external) then
    raise exception 'SHOW_OPS_BOOKING_NOT_COLLECTIBLE';
  end if;
  v_paid := private.show_ops_ensure_opening(b);
  if not v_external and new.amount > greatest(0,b.total_cost-v_paid) then
    raise exception 'SHOW_OPS_PAYMENT_EXCEEDS_OUTSTANDING';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_payment_insert() from public,authenticated;
create trigger show_ops_payment_insert_guard before insert on public.show_booking_payments
  for each row execute function private.show_ops_guard_payment_insert();

create or replace function private.show_ops_refresh_payment_summary()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_paid numeric;
begin
  -- Import rows already describe the current summary. Skipping this update also
  -- permits a booking BEFORE UPDATE trigger to materialize its old paid basis.
  if new.method='import' then return new; end if;
  select coalesce(sum(amount),0) into v_paid from public.show_booking_payments where booking_id=new.booking_id;
  update public.show_bookings set
    balance_remaining=round(total_cost-v_paid,2),
    payment_status=case when total_cost-v_paid<=0 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end,
    updated_at=clock_timestamp()
    where id=new.booking_id and business_id=new.business_id;
  return new;
end;
$$;
revoke all on function private.show_ops_refresh_payment_summary() from public,authenticated;
create trigger show_ops_payment_summary after insert on public.show_booking_payments
  for each row execute function private.show_ops_refresh_payment_summary();

create or replace function private.show_ops_guard_booking_payment_summary()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_paid numeric;
begin
  if row(new.total_cost,new.balance_remaining,new.payment_status,new.billing_mode)
     is not distinct from row(old.total_cost,old.balance_remaining,old.payment_status,old.billing_mode) then
    return new;
  end if;
  if old.billing_mode='deposit' or new.billing_mode='deposit' then
    v_paid := private.show_ops_ensure_opening(old);
    if new.billing_mode='invoice' and v_paid<>0 then
      raise exception 'SHOW_OPS_PAID_BOOKING_CANNOT_CHANGE_BILLING_MODE';
    end if;
    if new.billing_mode='deposit' then
      new.balance_remaining := round(new.total_cost-v_paid,2);
      new.payment_status := case when new.balance_remaining<=0 then 'paid' when v_paid>0 then 'partial' else 'unpaid' end;
    else
      new.balance_remaining := 0;
      new.payment_status := 'n_a';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_booking_payment_summary() from public,authenticated;
create trigger show_ops_booking_payment_summary before update on public.show_bookings
  for each row execute function private.show_ops_guard_booking_payment_summary();

-- Snapshot only unambiguous imported rows without ANY existing ledger entry.
-- Include zero openings so later receipts cannot be confused with missing basis.
-- Any legacy rows with payments but no opening remain blocked for reconciliation.
insert into public.show_booking_payments(business_id,booking_id,amount,method,paid_at,note)
select b.business_id,b.id,round(b.total_cost-b.balance_remaining,2),'import',b.created_at,
  'Opening balance imported from Lanzasoft (paid before Solvio)'
from public.show_bookings b
where b.billing_mode='deposit' and b.legacy_id is not null
  and b.total_cost::text not in ('NaN','Infinity','-Infinity')
  and b.balance_remaining::text not in ('NaN','Infinity','-Infinity')
  and b.total_cost-b.balance_remaining>=0
  and not exists(select 1 from public.show_booking_payments p where p.booking_id=b.id);

commit;
