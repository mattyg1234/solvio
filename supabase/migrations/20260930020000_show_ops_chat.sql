-- Show Ops team chat (Solvio Connect module, 30 Sept 2026).
--
-- A "Team" channel every staff member is in, one-to-one direct chats and named
-- group chats. A message can carry a booking ({kind:'booking', booking_id, ref})
-- so the office can ask about it ("Can you check the pickup for this one?").
--
-- Additive only. Nothing existing is altered; private.show_ops_has_action is
-- untouched. Partner logins (role seller) never reach chat: every policy goes
-- through private.show_ops_current_staff_businesses(), which lists only the
-- business owner and booker / office / finance / admin members.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.show_ops_chat_channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('team', 'direct', 'group')),
  name text not null default '' check (char_length(name) <= 80),
  -- Direct chats only: the two user ids, sorted, joined with ':'. One per pair.
  direct_key text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint show_ops_chat_channels_direct_key_check
    check ((kind = 'direct') = (direct_key is not null)),
  constraint show_ops_chat_channels_id_business_key unique (id, business_id)
);

create unique index if not exists show_ops_chat_channels_team_uq
  on public.show_ops_chat_channels (business_id) where kind = 'team';
create unique index if not exists show_ops_chat_channels_direct_uq
  on public.show_ops_chat_channels (business_id, direct_key) where kind = 'direct';

create table if not exists public.show_ops_chat_members (
  channel_id uuid not null,
  business_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  -- The composite key keeps a member row in the same business as its channel.
  foreign key (channel_id, business_id)
    references public.show_ops_chat_channels (id, business_id) on delete cascade
);

create index if not exists show_ops_chat_members_user_idx
  on public.show_ops_chat_members (user_id, business_id);

create table if not exists public.show_ops_chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  business_id uuid not null,
  author_id uuid references auth.users (id) on delete set null,
  text text not null default '' check (char_length(text) <= 4000),
  mentions uuid[] not null default '{}' check (cardinality(mentions) <= 50),
  attachment jsonb,
  created_at timestamptz not null default now(),
  foreign key (channel_id, business_id)
    references public.show_ops_chat_channels (id, business_id) on delete cascade,
  constraint show_ops_chat_messages_body_check
    check (btrim(text) <> '' or attachment is not null),
  -- Only booking attachments for now. The ref is kept so someone who cannot
  -- open the booking still sees "Booking <ref>".
  constraint show_ops_chat_messages_attachment_check check (
    attachment is null or (
      jsonb_typeof(attachment) = 'object'
      and attachment ->> 'kind' = 'booking'
      and (attachment ->> 'booking_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and char_length(coalesce(attachment ->> 'ref', '')) between 1 and 60
    )
  )
);

create index if not exists show_ops_chat_messages_channel_idx
  on public.show_ops_chat_messages (channel_id, created_at desc);
create index if not exists show_ops_chat_messages_business_idx
  on public.show_ops_chat_messages (business_id, created_at desc);

comment on table public.show_ops_chat_channels is
  'Show Ops team chat: team (everyone on staff), direct (two people) or group (named). Sellers never see chat.';
comment on column public.show_ops_chat_messages.attachment is
  '{"kind":"booking","booking_id":"<uuid>","ref":"<booking_ref>"}. Card details are read live, never stored; money is never shown.';

-- ---------------------------------------------------------------------------
-- Helpers (security definer, fixed search_path)
-- ---------------------------------------------------------------------------

-- Is p_user staff (owner, or a non-seller member) of this business?
create or replace function private.show_ops_chat_is_staff(p_business_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null and (
    exists (select 1 from public.businesses b where b.id = p_business_id and b.owner_id = p_user_id)
    or exists (
      select 1 from public.show_ops_members m
      where m.business_id = p_business_id and m.user_id = p_user_id
        and m.role in ('booker', 'office', 'finance', 'admin')
    )
  );
$$;

-- Can the signed-in user read and post in this channel? Staff of its business,
-- and either it is the Team channel or they are a member of it.
create or replace function private.show_ops_chat_channel_access(p_channel_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.show_ops_chat_channels c
    where c.id = p_channel_id
      and private.show_ops_chat_is_staff(c.business_id, (select auth.uid()))
      and (
        c.kind = 'team'
        or exists (
          select 1 from public.show_ops_chat_members m
          where m.channel_id = c.id and m.user_id = (select auth.uid())
        )
      )
  );
$$;

-- Who may add p_user_id to a channel: anyone joins the Team channel themselves;
-- the creator of a direct/group chat adds its people (a direct chat only the two
-- people in its key). Whoever is added must be staff of the same business.
create or replace function private.show_ops_chat_can_add_member(
  p_channel_id uuid, p_business_id uuid, p_user_id uuid
)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.show_ops_chat_is_staff(p_business_id, (select auth.uid()))
    and private.show_ops_chat_is_staff(p_business_id, p_user_id)
    and exists (
      select 1 from public.show_ops_chat_channels c
      where c.id = p_channel_id and c.business_id = p_business_id
        and (
          (c.kind = 'team' and p_user_id = (select auth.uid()))
          or (c.kind = 'group' and c.created_by = (select auth.uid()))
          or (
            c.kind = 'direct' and c.created_by = (select auth.uid())
            and p_user_id::text in (split_part(c.direct_key, ':', 1), split_part(c.direct_key, ':', 2))
          )
        )
    );
$$;

-- Every @mention must be someone who can read the channel.
create or replace function private.show_ops_chat_mentions_ok(p_channel_id uuid, p_mentions uuid[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(coalesce(p_mentions, '{}'::uuid[])) as mentioned(user_id)
    join public.show_ops_chat_channels c on c.id = p_channel_id
    where not private.show_ops_chat_is_staff(c.business_id, mentioned.user_id)
       or (
         c.kind <> 'team'
         and not exists (
           select 1 from public.show_ops_chat_members m
           where m.channel_id = c.id and m.user_id = mentioned.user_id
         )
       )
  );
$$;

revoke all on function private.show_ops_chat_is_staff(uuid, uuid) from public;
revoke all on function private.show_ops_chat_channel_access(uuid) from public;
revoke all on function private.show_ops_chat_can_add_member(uuid, uuid, uuid) from public;
revoke all on function private.show_ops_chat_mentions_ok(uuid, uuid[]) from public;
grant execute on function private.show_ops_chat_is_staff(uuid, uuid) to authenticated;
grant execute on function private.show_ops_chat_channel_access(uuid) to authenticated;
grant execute on function private.show_ops_chat_can_add_member(uuid, uuid, uuid) to authenticated;
grant execute on function private.show_ops_chat_mentions_ok(uuid, uuid[]) to authenticated;

-- A message is stamped by the database: its author is whoever is signed in and
-- its time is now, so nobody can backdate or post as someone else.
create or replace function private.show_ops_chat_stamp_message()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.author_id := (select auth.uid());
  end if;
  new.created_at := now();
  new.mentions := coalesce(array(select distinct x from unnest(new.mentions) x where x is not null), '{}'::uuid[]);
  return new;
end;
$$;
revoke all on function private.show_ops_chat_stamp_message() from public;

drop trigger if exists show_ops_chat_messages_stamp on public.show_ops_chat_messages;
create trigger show_ops_chat_messages_stamp
  before insert on public.show_ops_chat_messages
  for each row execute function private.show_ops_chat_stamp_message();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.show_ops_chat_channels enable row level security;
alter table public.show_ops_chat_members enable row level security;
alter table public.show_ops_chat_messages enable row level security;

revoke all on public.show_ops_chat_channels from anon;
revoke all on public.show_ops_chat_members from anon;
revoke all on public.show_ops_chat_messages from anon;
grant select, insert on public.show_ops_chat_channels to authenticated;
grant select, insert on public.show_ops_chat_members to authenticated;
grant select, insert on public.show_ops_chat_messages to authenticated;

-- Channels: read what you are in (the creator can read a new chat back before
-- its member rows exist). Create as yourself. No edits or deletes from the app.
drop policy if exists show_ops_chat_channels_sel on public.show_ops_chat_channels;
create policy show_ops_chat_channels_sel on public.show_ops_chat_channels
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and (created_by = (select auth.uid()) or private.show_ops_chat_channel_access(id))
  );

drop policy if exists show_ops_chat_channels_ins on public.show_ops_chat_channels;
create policy show_ops_chat_channels_ins on public.show_ops_chat_channels
  for insert to authenticated
  with check (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and created_by = (select auth.uid())
    and (
      kind <> 'direct'
      or (select auth.uid())::text in (split_part(direct_key, ':', 1), split_part(direct_key, ':', 2))
    )
  );

revoke update, delete, truncate on public.show_ops_chat_channels from authenticated;

-- Members: see who is in the chats you are in; join/add per the helper; each
-- person only moves their own read marker.
drop policy if exists show_ops_chat_members_sel on public.show_ops_chat_members;
create policy show_ops_chat_members_sel on public.show_ops_chat_members
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and (user_id = (select auth.uid()) or private.show_ops_chat_channel_access(channel_id))
  );

drop policy if exists show_ops_chat_members_ins on public.show_ops_chat_members;
create policy show_ops_chat_members_ins on public.show_ops_chat_members
  for insert to authenticated
  with check (private.show_ops_chat_can_add_member(channel_id, business_id, user_id));

drop policy if exists show_ops_chat_members_upd on public.show_ops_chat_members;
create policy show_ops_chat_members_upd on public.show_ops_chat_members
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
  )
  with check (
    user_id = (select auth.uid())
    and business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
  );

revoke update, delete, truncate on public.show_ops_chat_members from authenticated;
grant update (last_read_at) on public.show_ops_chat_members to authenticated;

-- Messages: read and post only in chats you can access, as yourself. A booking
-- attachment must be a booking the sender can see (show_bookings RLS applies,
-- islands included), in the same business, with its real reference.
drop policy if exists show_ops_chat_messages_sel on public.show_ops_chat_messages;
create policy show_ops_chat_messages_sel on public.show_ops_chat_messages
  for select to authenticated
  using (
    business_id = any ((select private.show_ops_current_staff_businesses())::uuid[])
    and private.show_ops_chat_channel_access(channel_id)
  );

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
      or exists (
        select 1 from public.show_bookings b
        where b.id = case
            when (attachment ->> 'booking_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (attachment ->> 'booking_id')::uuid
          end
          and b.business_id = show_ops_chat_messages.business_id
          and b.booking_ref = attachment ->> 'ref'
      )
    )
  );

revoke update, delete, truncate on public.show_ops_chat_messages from authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- The staff you can chat with: owner plus booker/office/finance/admin members.
-- profiles is own-row only under RLS, so names are resolved here, and only for
-- someone who is staff of this business themselves.
create or replace function public.show_ops_chat_people(p_business_id uuid)
returns table (user_id uuid, name text, role text)
language sql stable security definer set search_path = ''
as $$
  with staff as (
    select b.owner_id as user_id, 'owner'::text as role, null::text as display_name
    from public.businesses b
    where b.id = p_business_id
    union all
    select m.user_id, m.role, m.display_name
    from public.show_ops_members m
    where m.business_id = p_business_id and m.role in ('booker', 'office', 'finance', 'admin')
  ),
  ranked as (
    select distinct on (s.user_id) s.user_id, s.role, s.display_name
    from staff s
    order by s.user_id, (s.role = 'owner') desc
  )
  select
    r.user_id,
    coalesce(
      nullif(btrim(r.display_name), ''),
      nullif(btrim(p.full_name), ''),
      nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
      'Team member'
    ) as name,
    r.role
  from ranked r
  left join public.profiles p on p.id = r.user_id
  where private.show_ops_chat_is_staff(p_business_id, (select auth.uid()))
  order by 2;
$$;

revoke all on function public.show_ops_chat_people(uuid) from public;
revoke all on function public.show_ops_chat_people(uuid) from anon;
grant execute on function public.show_ops_chat_people(uuid) to authenticated;

-- One call per poll: makes sure the Team channel exists and the caller is in it,
-- then returns every channel they can read with unread counts. Runs as the
-- caller (security invoker), so all of the RLS above still applies.
create or replace function public.show_ops_chat_sync(p_business_id uuid)
returns table (
  channel_id uuid,
  unread integer,
  unread_mentions integer,
  last_message_at timestamptz,
  last_author_id uuid,
  last_text text,
  last_booking_ref text
)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  team_id uuid;
begin
  if me is null or not private.show_ops_chat_is_staff(p_business_id, me) then
    return;
  end if;

  insert into public.show_ops_chat_channels (business_id, kind, name, created_by)
  values (p_business_id, 'team', 'Team', me)
  on conflict (business_id) where kind = 'team' do nothing;

  select c.id into team_id
  from public.show_ops_chat_channels c
  where c.business_id = p_business_id and c.kind = 'team';

  if team_id is not null then
    insert into public.show_ops_chat_members (channel_id, business_id, user_id)
    values (team_id, p_business_id, me)
    on conflict on constraint show_ops_chat_members_pkey do nothing;
  end if;

  return query
  select
    c.id,
    (
      select count(*)::integer from public.show_ops_chat_messages x
      where x.channel_id = c.id
        and x.author_id is distinct from me
        and x.created_at > coalesce(m.last_read_at, m.joined_at, now())
    ),
    (
      select count(*)::integer from public.show_ops_chat_messages x
      where x.channel_id = c.id
        and x.author_id is distinct from me
        and x.created_at > coalesce(m.last_read_at, m.joined_at, now())
        and me = any (x.mentions)
    ),
    last_msg.created_at,
    last_msg.author_id,
    left(last_msg.text, 140),
    last_msg.attachment ->> 'ref'
  from public.show_ops_chat_channels c
  left join public.show_ops_chat_members m on m.channel_id = c.id and m.user_id = me
  left join lateral (
    select x.created_at, x.author_id, x.text, x.attachment
    from public.show_ops_chat_messages x
    where x.channel_id = c.id
    order by x.created_at desc
    limit 1
  ) last_msg on true
  where c.business_id = p_business_id
    and (c.kind = 'team' or m.user_id is not null);
end;
$$;

revoke all on function public.show_ops_chat_sync(uuid) from public;
revoke all on function public.show_ops_chat_sync(uuid) from anon;
grant execute on function public.show_ops_chat_sync(uuid) to authenticated;

commit;
