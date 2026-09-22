-- Joel (17 Sept): partners ask to cancel from their booking link, up to the day
-- before the show (the GetYourGuide rule). The office approves or declines from
-- Needs attention. An approved late cancellation can still be charged, so the
-- booking is off the lists but stays on the partner's invoice in full.
alter table public.show_bookings
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_request_reason text,
  add column if not exists cancel_request_status text,
  add column if not exists cancel_request_decided_at timestamptz,
  add column if not exists cancel_request_decided_by uuid,
  add column if not exists cancel_request_reply text,
  add column if not exists cancel_charge text;

alter table public.show_bookings drop constraint if exists show_bookings_cancel_request_status_check;
alter table public.show_bookings
  add constraint show_bookings_cancel_request_status_check
  check (cancel_request_status is null or cancel_request_status in ('pending', 'approved', 'denied'));

alter table public.show_bookings drop constraint if exists show_bookings_cancel_charge_check;
alter table public.show_bookings
  add constraint show_bookings_cancel_charge_check
  check (cancel_charge is null or cancel_charge in ('charge', 'write_off'));

-- Needs attention counts pending requests on every dashboard load.
create index if not exists show_bookings_cancel_requests_pending_idx
  on public.show_bookings (business_id, cancel_requested_at)
  where cancel_request_status = 'pending';

comment on column public.show_bookings.cancel_request_status is
  'pending = partner asked to cancel and the office has not decided; approved / denied = decided (see cancel_request_reply).';
comment on column public.show_bookings.cancel_charge is
  'Only on cancelled bookings: charge = still invoiced in full to the partner; write_off = not invoiced.';
