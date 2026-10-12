/*
 * Email bookings (ported from Solvio Connect, 30 Sept 2026).
 *
 * MHT connects ONE bookings inbox (Gmail, read-only). The office ticks which senders to track
 * (GetYourGuide, the website shop's WooCommerce order emails, …); their booking emails are read
 * into a review queue. Nothing is ever turned into a booking on its own: Ruth opens each one in
 * the normal new-booking form, prefilled, and saves it herself. The saved booking is stamped with
 * channel + channel_ref (unique per business, see 20260909030000) so it is never created twice.
 *
 * Additive only. Access follows the Bookings page grant (private.show_ops_has_action, unchanged).
 * OAuth tokens and OAuth states live in tables with RLS on and NO policies: only the server
 * (service role, after its own permission check) can read or write them. Tokens are encrypted
 * with SHOW_OPS_SECRETS_KEY (src/lib/show-ops/secrets.ts) before they are stored.
 */

-- The business's bookings inbox. One per business.
create table if not exists public.show_email_booking_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null default 'gmail' check (provider in ('gmail', 'microsoft')),
  address text not null check (length(address) between 3 and 320),
  -- Tickable senders: [{key, name, domain, found, lastSeen, track, syncedAt?, examples?, other?, custom?, suggested?}]
  sellers jsonb not null default '[]'::jsonb check (jsonb_typeof(sellers) = 'array'),
  -- Emails in the last 90 days that were not bookings (counted by the scan, never stored).
  skipped integer not null default 0 check (skipped >= 0),
  -- Kept for parity with Solvio Connect; the Hub never auto-creates bookings (always false in the UI).
  auto_add boolean not null default false,
  last_scan_at timestamptz,
  last_sync_at timestamptz,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);
alter table public.show_email_booking_connections enable row level security;

drop policy if exists show_email_booking_connections_select on public.show_email_booking_connections;
create policy show_email_booking_connections_select on public.show_email_booking_connections
  for select to authenticated using (private.show_ops_has_action(business_id, 'booker', array['bookings']));
-- Refresh (any bookings desk member) records sync progress on the row.
drop policy if exists show_email_booking_connections_update on public.show_email_booking_connections;
create policy show_email_booking_connections_update on public.show_email_booking_connections
  for update to authenticated
  using (private.show_ops_has_action(business_id, 'booker', array['bookings']))
  with check (private.show_ops_has_action(business_id, 'booker', array['bookings']));
-- Connecting and disconnecting the inbox: Reservation (ops) and above with the Bookings page.
drop policy if exists show_email_booking_connections_insert on public.show_email_booking_connections;
create policy show_email_booking_connections_insert on public.show_email_booking_connections
  for insert to authenticated with check (private.show_ops_has_action(business_id, 'office', array['bookings']));
drop policy if exists show_email_booking_connections_delete on public.show_email_booking_connections;
create policy show_email_booking_connections_delete on public.show_email_booking_connections
  for delete to authenticated using (private.show_ops_has_action(business_id, 'office', array['bookings']));

-- Encrypted OAuth tokens. Server only: RLS on, no policies, no grants to signed-in users.
create table if not exists public.show_email_booking_tokens (
  connection_id uuid primary key references public.show_email_booking_connections (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.show_email_booking_tokens enable row level security;
revoke all on table public.show_email_booking_tokens from anon, authenticated;

-- One-time OAuth round-trip states (sha256 of the random state). Server only, like the tokens.
create table if not exists public.show_email_booking_oauth_states (
  state_hash text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null,
  provider text not null default 'gmail',
  created_at timestamptz not null default now()
);
alter table public.show_email_booking_oauth_states enable row level security;
revoke all on table public.show_email_booking_oauth_states from anon, authenticated;
create index if not exists show_email_booking_oauth_states_created_idx on public.show_email_booking_oauth_states (created_at);

-- Booking emails read from the inbox. Non-booking emails keep only their subject (body '').
create table if not exists public.show_email_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  connection_id uuid references public.show_email_booking_connections (id) on delete set null,
  provider text not null default 'gmail',
  provider_message_id text not null check (length(provider_message_id) between 1 and 255),
  from_name text not null default '',
  from_email text not null default '',
  subject text not null default '',
  received_at timestamptz not null,
  body text not null default '' check (length(body) <= 20000),
  seller_key text,
  seller_name text,
  kind text not null check (kind in ('new', 'change', 'cancel', 'question', 'not-booking')),
  extracted jsonb not null default '{}'::jsonb check (jsonb_typeof(extracted) = 'object'),
  -- The booking reference as read (normalised), for spotting a second copy of the same booking.
  reference text,
  confidence real not null default 0 check (confidence >= 0 and confidence <= 1),
  reader text check (reader is null or reader in ('template', 'ai', 'pattern')),
  status text not null default 'review' check (status in ('review', 'added', 'ignored')),
  booking_id uuid references public.show_bookings (id) on delete set null,
  system_note text,
  notes text check (notes is null or length(notes) <= 2000),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider, provider_message_id)
);
create index if not exists show_email_bookings_queue_idx
  on public.show_email_bookings (business_id, status, received_at desc);
create index if not exists show_email_bookings_reference_idx
  on public.show_email_bookings (business_id, reference) where reference is not null;
create index if not exists show_email_bookings_booking_idx
  on public.show_email_bookings (booking_id) where booking_id is not null;
alter table public.show_email_bookings enable row level security;

drop policy if exists show_email_bookings_select on public.show_email_bookings;
create policy show_email_bookings_select on public.show_email_bookings
  for select to authenticated using (private.show_ops_has_action(business_id, 'booker', array['bookings']));
drop policy if exists show_email_bookings_insert on public.show_email_bookings;
create policy show_email_bookings_insert on public.show_email_bookings
  for insert to authenticated with check (private.show_ops_has_action(business_id, 'booker', array['bookings']));
drop policy if exists show_email_bookings_update on public.show_email_bookings;
create policy show_email_bookings_update on public.show_email_bookings
  for update to authenticated
  using (private.show_ops_has_action(business_id, 'booker', array['bookings']))
  with check (private.show_ops_has_action(business_id, 'booker', array['bookings']));
drop policy if exists show_email_bookings_delete on public.show_email_bookings;
create policy show_email_bookings_delete on public.show_email_bookings
  for delete to authenticated using (private.show_ops_has_action(business_id, 'office', array['bookings']));

comment on table public.show_email_booking_connections is 'The business bookings inbox (Gmail, read-only) and the senders the office tracks.';
comment on table public.show_email_booking_tokens is 'Encrypted OAuth tokens for show_email_booking_connections. Service role only.';
comment on table public.show_email_booking_oauth_states is 'One-time OAuth states (sha256) for connecting the bookings inbox. Service role only.';
comment on table public.show_email_bookings is 'Booking emails awaiting review (review), turned into or linked to a booking (added), or skipped (ignored). Never auto-creates bookings.';
comment on column public.show_email_bookings.booking_id is 'The booking this email was added as or matched to.';
