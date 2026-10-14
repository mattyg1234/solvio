-- Show Ops customer inbox: WhatsApp and SMS conversations with guests, through
-- the company's own Twilio account (14 Oct 2026).
--
-- * Every message the Hub sends a guest (inbox replies, pick-up tickets) and
--   every reply that comes back lands in one conversation per guest number.
-- * Who sees what: owners, Superadmins (admin) and anyone ticked "Sees the whole
--   customer inbox" see every conversation. Everyone else on staff sees only the
--   conversations assigned to them, or one a teammate has sent them and they have
--   not answered yet (so they can open it before accepting).
-- * Sending a conversation to a teammate creates a handoff and posts a card in
--   their direct chat; accepting it makes them the owner of the conversation.
--
-- Additive, apart from two widenings: show_ops_integrations.provider gains
-- 'twilio', and a team-chat message may now also carry an inbox card. Partner
-- logins (role seller) never reach any of it.
--
-- The browser only ever reads these tables (RLS below). Every write goes through
-- the server after it has re-checked access, using the service role.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Settings: per-member "whole inbox" flag and the Twilio credential row
-- ---------------------------------------------------------------------------

alter table public.show_ops_members
  add column if not exists inbox_all boolean not null default false;

comment on column public.show_ops_members.inbox_all is
  'Sees every customer WhatsApp/SMS conversation, not only the ones assigned or sent to them. Owners and admins always do.';

alter table public.show_ops_integrations
  drop constraint if exists show_ops_integrations_provider_check;
alter table public.show_ops_integrations
  add constraint show_ops_integrations_provider_check check (provider in ('holded', 'twilio'));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.show_ops_inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms')),
  -- E.164, e.g. +34612345678. One conversation per guest number and channel.
  customer_phone text not null check (customer_phone ~ '^\+[1-9][0-9]{6,15}$'),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  booking_id uuid references public.show_bookings (id) on delete set null,
  assigned_to uuid references auth.users (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  last_message_at timestamptz,
  -- WhatsApp only allows free text within 24 hours of the guest's last message.
  last_inbound_at timestamptz,
  last_preview text not null default '' check (char_length(last_preview) <= 160),
  last_direction text check (last_direction in ('in', 'out', 'note', 'event')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint show_ops_inbox_conversations_number_uq unique (business_id, channel, customer_phone),
  constraint show_ops_inbox_conversations_id_business_key unique (id, business_id)
);

create index if not exists show_ops_inbox_conversations_recent_idx
  on public.show_ops_inbox_conversations (business_id, last_message_at desc nulls last);
create index if not exists show_ops_inbox_conversations_assigned_idx
  on public.show_ops_inbox_conversations (assigned_to, business_id);
create index if not exists show_ops_inbox_conversations_booking_idx
  on public.show_ops_inbox_conversations (booking_id) where booking_id is not null;

create table if not exists public.show_ops_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  business_id uuid not null,
  -- in = from the guest, out = to the guest, note = staff-only note,
  -- event = what happened (sent to Ruth, accepted, closed…).
  direction text not null check (direction in ('in', 'out', 'note', 'event')),
  body text not null default '' check (char_length(body) <= 4000),
  author_id uuid references auth.users (id) on delete set null,
  -- inbox = typed in the inbox, ticket = pick-up/booking ticket the Hub sent,
  -- template = WhatsApp template, webhook = arrived from Twilio, system = events.
  source text not null default 'inbox' check (source in ('inbox', 'ticket', 'template', 'webhook', 'system')),
  provider_sid text check (provider_sid is null or char_length(provider_sid) <= 64),
  status text not null default 'received' check (
    status in ('received', 'sending', 'queued', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'note')
  ),
  error text check (error is null or char_length(error) <= 500),
  -- [{"url": "...", "type": "image/jpeg"}] for guest photos/files (fetched through the Hub, never linked directly).
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, business_id)
    references public.show_ops_inbox_conversations (id, business_id) on delete cascade
);

create index if not exists show_ops_inbox_messages_conversation_idx
  on public.show_ops_inbox_messages (conversation_id, created_at desc);
create unique index if not exists show_ops_inbox_messages_provider_sid_uq
  on public.show_ops_inbox_messages (business_id, provider_sid) where provider_sid is not null;

create table if not exists public.show_ops_inbox_handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  business_id uuid not null,
  from_user uuid references auth.users (id) on delete set null,
  to_user uuid not null references auth.users (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  foreign key (conversation_id, business_id)
    references public.show_ops_inbox_conversations (id, business_id) on delete cascade
);

create index if not exists show_ops_inbox_handoffs_to_idx
  on public.show_ops_inbox_handoffs (to_user, status, business_id);
create index if not exists show_ops_inbox_handoffs_conversation_idx
  on public.show_ops_inbox_handoffs (conversation_id, created_at desc);

create table if not exists public.show_ops_inbox_reads (
  conversation_id uuid not null,
  business_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  foreign key (conversation_id, business_id)
    references public.show_ops_inbox_conversations (id, business_id) on delete cascade
);

comment on table public.show_ops_inbox_conversations is
  'Show Ops customer inbox: one WhatsApp or SMS conversation per guest number. Read via RLS; written only by the server.';

-- ---------------------------------------------------------------------------
-- Helpers (security definer, fixed search_path)
-- ---------------------------------------------------------------------------

-- Does p_user see every conversation of this business?
create or replace function private.show_ops_inbox_sees_all(p_business_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and (
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user_id)
    or exists (
      select 1 from public.show_ops_members m
      where m.business_id = p_business_id and m.user_id = p_user_id
        and (m.role = 'admin' or (m.inbox_all and m.role in ('booker', 'office', 'finance')))
    )
  );
$$;

-- Can the signed-in user read this conversation? Staff of its business, and
-- either they see the whole inbox, it is assigned to them, or a teammate has
-- sent it to them and they have not answered yet.
create or replace function private.show_ops_inbox_can_see(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.show_ops_inbox_conversations c
    where c.id = p_conversation_id
      and c.business_id = any (private.show_ops_current_staff_businesses())
      and (
        private.show_ops_inbox_sees_all(c.business_id, (select auth.uid()))
        or c.assigned_to = (select auth.uid())
        or exists (
          select 1 from public.show_ops_inbox_handoffs h
          where h.conversation_id = c.id and h.to_user = (select auth.uid()) and h.status = 'pending'
        )
      )
  );
$$;

revoke all on function private.show_ops_inbox_sees_all(uuid, uuid) from public;
revoke all on function private.show_ops_inbox_can_see(uuid) from public;
grant execute on function private.show_ops_inbox_sees_all(uuid, uuid) to authenticated;
grant execute on function private.show_ops_inbox_can_see(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: read-only for signed-in staff, nothing for anon
-- ---------------------------------------------------------------------------

alter table public.show_ops_inbox_conversations enable row level security;
alter table public.show_ops_inbox_messages enable row level security;
alter table public.show_ops_inbox_handoffs enable row level security;
alter table public.show_ops_inbox_reads enable row level security;

revoke all on public.show_ops_inbox_conversations from anon, authenticated;
revoke all on public.show_ops_inbox_messages from anon, authenticated;
revoke all on public.show_ops_inbox_handoffs from anon, authenticated;
revoke all on public.show_ops_inbox_reads from anon, authenticated;
grant select on public.show_ops_inbox_conversations to authenticated;
grant select on public.show_ops_inbox_messages to authenticated;
grant select on public.show_ops_inbox_handoffs to authenticated;
grant select on public.show_ops_inbox_reads to authenticated;

drop policy if exists show_ops_inbox_conversations_sel on public.show_ops_inbox_conversations;
create policy show_ops_inbox_conversations_sel on public.show_ops_inbox_conversations
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and private.show_ops_inbox_can_see(id)
  );

drop policy if exists show_ops_inbox_messages_sel on public.show_ops_inbox_messages;
create policy show_ops_inbox_messages_sel on public.show_ops_inbox_messages
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and private.show_ops_inbox_can_see(conversation_id)
  );

-- Handoffs: the two people involved, and anyone who can read the conversation.
drop policy if exists show_ops_inbox_handoffs_sel on public.show_ops_inbox_handoffs;
create policy show_ops_inbox_handoffs_sel on public.show_ops_inbox_handoffs
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and (
      to_user = (select auth.uid())
      or from_user = (select auth.uid())
      or private.show_ops_inbox_can_see(conversation_id)
    )
  );

drop policy if exists show_ops_inbox_reads_sel on public.show_ops_inbox_reads;
create policy show_ops_inbox_reads_sel on public.show_ops_inbox_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Team chat may carry an inbox card ("Matty sent you a WhatsApp chat")
-- ---------------------------------------------------------------------------

alter table public.show_ops_chat_messages
  drop constraint if exists show_ops_chat_messages_attachment_check;
alter table public.show_ops_chat_messages
  add constraint show_ops_chat_messages_attachment_check check (
    attachment is null or (
      jsonb_typeof(attachment) = 'object'
      and (
        (
          attachment ->> 'kind' = 'booking'
          and (attachment ->> 'booking_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and char_length(coalesce(attachment ->> 'ref', '')) between 1 and 60
        )
        or (
          attachment ->> 'kind' = 'inbox'
          and (attachment ->> 'conversation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and char_length(coalesce(attachment ->> 'label', '')) between 1 and 120
        )
      )
    )
  );

-- Same rules as before for bookings; an inbox card must point at a conversation
-- of the same business that the sender can read.
drop policy if exists show_ops_chat_messages_ins on public.show_ops_chat_messages;
create policy show_ops_chat_messages_ins on public.show_ops_chat_messages
  for insert to authenticated
  with check (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and author_id = (select auth.uid())
    and private.show_ops_chat_channel_access(channel_id)
    and private.show_ops_chat_mentions_ok(channel_id, mentions)
    and (
      attachment is null
      or (
        attachment ->> 'kind' = 'booking'
        and exists (
          select 1 from public.show_bookings b
          where b.id = case
              when (attachment ->> 'booking_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (attachment ->> 'booking_id')::uuid
            end
            and b.business_id = show_ops_chat_messages.business_id
            and b.booking_ref = attachment ->> 'ref'
        )
      )
      or (
        attachment ->> 'kind' = 'inbox'
        and exists (
          select 1 from public.show_ops_inbox_conversations c
          where c.id = case
              when (attachment ->> 'conversation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (attachment ->> 'conversation_id')::uuid
            end
            and c.business_id = show_ops_chat_messages.business_id
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: the inbox list with unread counts, in one call per poll
-- ---------------------------------------------------------------------------

-- Runs as the caller (security invoker): RLS above decides which rows come back.
create or replace function public.show_ops_inbox_list(p_business_id uuid)
returns table (
  id uuid,
  channel text,
  customer_phone text,
  customer_name text,
  booking_id uuid,
  assigned_to uuid,
  status text,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_preview text,
  last_direction text,
  unread integer,
  pending_handoff_id uuid,
  pending_handoff_from uuid,
  pending_handoff_note text
)
language sql stable security invoker set search_path = ''
as $$
  select
    c.id,
    c.channel,
    c.customer_phone,
    c.customer_name,
    c.booking_id,
    c.assigned_to,
    c.status,
    c.last_message_at,
    c.last_inbound_at,
    c.last_preview,
    c.last_direction,
    (
      select count(*)::integer from public.show_ops_inbox_messages m
      where m.conversation_id = c.id
        and m.direction = 'in'
        and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    ),
    h.id,
    h.from_user,
    h.note
  from public.show_ops_inbox_conversations c
  left join public.show_ops_inbox_reads r on r.conversation_id = c.id and r.user_id = (select auth.uid())
  left join lateral (
    select x.id, x.from_user, x.note
    from public.show_ops_inbox_handoffs x
    where x.conversation_id = c.id and x.to_user = (select auth.uid()) and x.status = 'pending'
    order by x.created_at desc
    limit 1
  ) h on true
  where c.business_id = p_business_id
  order by c.last_message_at desc nulls last
  limit 500;
$$;

revoke all on function public.show_ops_inbox_list(uuid) from public;
revoke all on function public.show_ops_inbox_list(uuid) from anon;
grant execute on function public.show_ops_inbox_list(uuid) to authenticated;

commit;
