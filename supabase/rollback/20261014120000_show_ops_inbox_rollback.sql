-- Rollback for 20261014120000_show_ops_inbox.sql (customer inbox).
-- Drops the inbox tables and their data, restores the Holded-only provider
-- check and booking-only chat attachments. Snapshot taken before applying:
-- private.snap_20261014_inbox_integrations, private.snap_20261014_inbox_members.
-- Run only after removing any 'twilio' integration row and inbox chat cards.

begin;

delete from public.show_ops_integrations where provider = 'twilio';
delete from public.show_ops_chat_messages where attachment ->> 'kind' = 'inbox';

drop function if exists public.show_ops_inbox_list(uuid);
drop table if exists public.show_ops_inbox_reads;
drop table if exists public.show_ops_inbox_handoffs;
drop table if exists public.show_ops_inbox_messages;
drop table if exists public.show_ops_inbox_conversations;
drop function if exists private.show_ops_inbox_can_see(uuid);
drop function if exists private.show_ops_inbox_sees_all(uuid, uuid);

alter table public.show_ops_members drop column if exists inbox_all;

alter table public.show_ops_integrations drop constraint if exists show_ops_integrations_provider_check;
alter table public.show_ops_integrations add constraint show_ops_integrations_provider_check check (provider = 'holded');

alter table public.show_ops_chat_messages drop constraint if exists show_ops_chat_messages_attachment_check;
alter table public.show_ops_chat_messages add constraint show_ops_chat_messages_attachment_check check (
  attachment is null or (
    jsonb_typeof(attachment) = 'object'
    and attachment ->> 'kind' = 'booking'
    and (attachment ->> 'booking_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and char_length(coalesce(attachment ->> 'ref', '')) between 1 and 60
  )
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

commit;
