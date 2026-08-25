-- FLOW 02: no-show decision (charge vs write-off), proof photo, invoice note.
-- Booked pax / capacity stay as history. Only the billed amount changes on write-off.

alter table public.show_suppliers
  add column if not exists no_show_policy text not null default 'charge';

alter table public.show_suppliers drop constraint if exists show_suppliers_no_show_policy_check;
alter table public.show_suppliers
  add constraint show_suppliers_no_show_policy_check
  check (no_show_policy in ('charge', 'write_off'));

alter table public.show_bookings
  add column if not exists no_show_charge text,
  add column if not exists no_show_decided_at timestamptz,
  add column if not exists no_show_decided_by uuid references auth.users (id) on delete set null,
  add column if not exists no_show_proof_path text;

alter table public.show_bookings drop constraint if exists show_bookings_no_show_charge_check;
alter table public.show_bookings
  add constraint show_bookings_no_show_charge_check
  check (no_show_charge is null or no_show_charge in ('charge', 'write_off'));

comment on column public.show_suppliers.no_show_policy is
  'Default when the office marks a no-show: charge the partner anyway, or write it off.';
comment on column public.show_bookings.no_show_charge is
  'Once-only commercial decision for missing pax. Does not change booked pax or capacity.';

alter table public.show_invoice_lines
  add column if not exists notes text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'show-ops-proofs',
  'show-ops-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists show_ops_proofs_select on storage.objects;
create policy show_ops_proofs_select
on storage.objects for select to authenticated
using (
  bucket_id = 'show-ops-proofs'
  and public.show_ops_can_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists show_ops_proofs_insert on storage.objects;
create policy show_ops_proofs_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'show-ops-proofs'
  and public.show_ops_can_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists show_ops_proofs_update on storage.objects;
create policy show_ops_proofs_update
on storage.objects for update to authenticated
using (
  bucket_id = 'show-ops-proofs'
  and public.show_ops_can_access((split_part(name, '/', 1))::uuid)
)
with check (
  bucket_id = 'show-ops-proofs'
  and public.show_ops_can_access((split_part(name, '/', 1))::uuid)
);

drop policy if exists show_ops_proofs_delete on storage.objects;
create policy show_ops_proofs_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'show-ops-proofs'
  and public.show_ops_can_access((split_part(name, '/', 1))::uuid)
);

create or replace function public.show_ops_sales_analytics(
  p_business uuid,
  p_year integer,
  p_island text default null,
  p_month text default null
)
returns jsonb
language sql
stable
as $function$
with b as (
  select
    show_date,
    island,
    adults,
    children,
    infants,
    total_cost,
    supplier_name,
    product_id,
    coalesce(no_show, false) as no_show,
    arrived_pax,
    no_show_charge,
    (adults + children + infants) as booked_pax,
    case
      when arrived_pax is not null then greatest(0, (adults + children + infants) - arrived_pax)
      when coalesce(no_show, false) then (adults + children + infants)
      else 0
    end as missing_pax,
    case
      when no_show_charge = 'write_off' then
        case
          when (adults + children + infants) > 0
            then total_cost * (coalesce(arrived_pax, 0)::numeric / (adults + children + infants))
          else 0
        end
      else total_cost
    end as billed_cost
  from show_bookings
  where business_id = p_business
    and cancelled_at is null
    and show_date >= make_date(p_year, 1, 1)
    and show_date < make_date(p_year + 1, 1, 1)
    and (p_island is null or p_island = '' or island = p_island)
),
mb as (
  select * from b
  where p_month is null or p_month = '' or to_char(show_date, 'YYYY-MM') = p_month
),
monthly as (
  select
    to_char(show_date, 'MM') as m,
    coalesce(sum(total_cost), 0) as gross,
    coalesce(sum(billed_cost), 0) as net,
    coalesce(sum(booked_pax), 0) as pax,
    coalesce(sum(missing_pax), 0) as noshow_pax
  from b
  group by 1
),
partners as (
  select supplier_name, coalesce(sum(billed_cost), 0) as revenue, coalesce(sum(booked_pax), 0) as pax
  from mb
  where supplier_name is not null
  group by 1
  order by 2 desc
  limit 6
),
daily as (
  select to_char(show_date, 'DD') as d, coalesce(sum(billed_cost), 0) as net
  from mb
  group by 1
),
islands as (
  select island, count(*) as bookings, coalesce(sum(booked_pax), 0) as pax
  from mb
  group by 1
  order by 2 desc
),
occ as (
  select sum(night_pax)::numeric as pax, sum(cap)::numeric as cap
  from (
    select b.show_date, b.product_id, sum(b.booked_pax) as night_pax, max(p.capacity) as cap
    from b
    join show_products p on p.id = b.product_id
    where p.capacity is not null and p.capacity > 1
    group by 1, 2
  ) x
)
select jsonb_build_object(
  'monthly', (select coalesce(jsonb_agg(jsonb_build_object('m', m, 'gross', gross, 'net', net, 'pax', pax) order by m), '[]'::jsonb) from monthly),
  'partners', (select coalesce(jsonb_agg(jsonb_build_object('name', supplier_name, 'revenue', revenue, 'pax', pax)), '[]'::jsonb) from partners),
  'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'net', net) order by d), '[]'::jsonb) from daily),
  'islands', (select coalesce(jsonb_agg(jsonb_build_object('island', island, 'bookings', bookings, 'pax', pax)), '[]'::jsonb) from islands),
  'avg_ticket', (select case when sum(pax) > 0 then round(sum(gross) / sum(pax), 2) end from monthly),
  'no_show_rate', (select case when sum(pax) > 0 then round(100.0 * sum(noshow_pax) / sum(pax), 1) end from monthly),
  'occupancy', (select case when cap > 0 then round(100.0 * pax / cap) end from occ)
)
$function$;
