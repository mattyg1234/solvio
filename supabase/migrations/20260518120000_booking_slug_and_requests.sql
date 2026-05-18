/*
 * Public booking pages: each business gets a URL slug; guests submit requests captured in booking_requests.
 * Run in Supabase SQL Editor or: supabase db push
 */

-- ── Business slug (public booking URL segment) ───────────────────────────────

alter table public.businesses
  add column if not exists booking_slug text;

create unique index if not exists businesses_booking_slug_lower_idx
  on public.businesses (lower(booking_slug))
  where booking_slug is not null and length(trim(booking_slug)) > 0;

-- ── Booking requests (contacts captured from Solvio-hosted booking form) ─────

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_name text not null,
  email text not null,
  phone text,
  notes text,
  preferred_time text,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index if not exists booking_requests_business_created_idx
  on public.booking_requests (business_id, created_at desc);

alter table public.booking_requests enable row level security;

drop policy if exists "booking_requests_select_own_business" on public.booking_requests;

create policy "booking_requests_select_own_business"
on public.booking_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.businesses b
    where b.id = booking_requests.business_id
      and b.owner_id = (select auth.uid())
  )
);

-- No direct INSERT/UPDATE for clients; submissions go through submit_booking_request().

-- ── Default slug on new businesses ───────────────────────────────────────────

create or replace function public.businesses_set_default_booking_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
  slug_candidate text;
begin
  if new.booking_slug is not null and length(trim(new.booking_slug)) > 0 then
    return new;
  end if;

  base := lower(regexp_replace(trim(new.name), '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if length(base) < 2 then
    base := 'book';
  end if;

  slug_candidate := base || '-' || substring(replace(new.id::text, '-', ''), 1, 8);
  new.booking_slug := slug_candidate;
  return new;
end;
$$;

drop trigger if exists businesses_set_booking_slug on public.businesses;

create trigger businesses_set_booking_slug
before insert on public.businesses
for each row
execute function public.businesses_set_default_booking_slug();

-- ── Public read: business name for booking page ───────────────────────────────

create or replace function public.get_booking_page_by_slug(p_slug text)
returns table (
  business_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.name::text
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;
$$;

grant execute on function public.get_booking_page_by_slug(text) to anon, authenticated;

-- ── Public submit: create one request row ─────────────────────────────────────

create or replace function public.submit_booking_request(
  p_slug text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_preferred_time text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_id uuid;
begin
  select b.id
  into v_business_id
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;

  if v_business_id is null then
    raise exception 'Business not found';
  end if;

  if length(trim(coalesce(p_customer_name, ''))) < 1 then
    raise exception 'Name is required';
  end if;

  if length(trim(coalesce(p_email, ''))) < 3
     or position('@' in trim(p_email)) < 2 then
    raise exception 'Valid email is required';
  end if;

  insert into public.booking_requests (
    business_id,
    customer_name,
    email,
    phone,
    notes,
    preferred_time,
    source
  )
  values (
    v_business_id,
    trim(p_customer_name),
    trim(lower(p_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    nullif(trim(coalesce(p_preferred_time, '')), ''),
    'web'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_booking_request(text, text, text, text, text, text) to anon, authenticated;
