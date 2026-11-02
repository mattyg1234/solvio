-- Sent emails log: one row per email the Hub tries to send for a workspace
-- (guest tickets, payment links, partner links, invoices, lists, reports).
-- Written by the server with the service role; read on the Sent page by the
-- workspace's owner/admins and whole-inbox staff (checked in the app, also
-- with the service role). No browser access, so RLS is on with no policies.

create table if not exists public.show_ops_sent_emails (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_id uuid references public.show_bookings (id) on delete set null,
  kind text not null default 'other' check (char_length(kind) <= 40),
  to_addresses text[] not null default '{}',
  subject text not null default '' check (char_length(subject) <= 300),
  -- sent = handed to Resend, held = test mode kept it back, failed = not sent.
  status text not null check (status in ('sent', 'held', 'failed')),
  resend_id text check (resend_id is null or char_length(resend_id) <= 100),
  error text check (error is null or char_length(error) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists show_ops_sent_emails_business_idx
  on public.show_ops_sent_emails (business_id, created_at desc);
create index if not exists show_ops_sent_emails_booking_idx
  on public.show_ops_sent_emails (booking_id) where booking_id is not null;

alter table public.show_ops_sent_emails enable row level security;
revoke all on public.show_ops_sent_emails from anon, authenticated;
