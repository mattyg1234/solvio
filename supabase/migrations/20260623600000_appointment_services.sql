-- Appointment services for salon/service-based businesses.
-- Services are configurable offerings (haircut, color, massage, etc.) with duration and price.

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.appointment_services is
  'Configurable appointment services (haircut, color, massage, etc.) with fixed duration and price.';
comment on column public.appointment_services.business_id is 'Owner business.';
comment on column public.appointment_services.duration_minutes is 'How long the service takes.';
comment on column public.appointment_services.price_cents is 'Cost in cents (0 = free).';
comment on column public.appointment_services.sort_order is 'Display order on public form.';

create index idx_appointment_services_business_id on public.appointment_services(business_id);

-- Add service_id to venue_calendar_bookings so we can track what service was booked.
alter table public.venue_calendar_bookings
  add column if not exists service_id uuid references public.appointment_services(id) on delete set null;

comment on column public.venue_calendar_bookings.service_id is
  'Selected service (for appointment bookings). Nullable if no service was selected.';

-- Extend staff_members to include color and role within the JSONB on businesses.booking_flow_details
-- (No schema change needed; we'll handle color/role in the JSONB structure via TypeScript)
