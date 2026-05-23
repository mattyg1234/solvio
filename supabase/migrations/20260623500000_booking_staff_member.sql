-- Assign a named staff member to a confirmed venue calendar booking.
-- Nullable — existing bookings are unassigned until the merchant sets one via the week planner.

alter table public.venue_calendar_bookings
  add column if not exists staff_member text;

comment on column public.venue_calendar_bookings.staff_member is
  'Name of the staff member assigned to this booking (from business booking_flow_details.staff_members). Nullable = unassigned.';
