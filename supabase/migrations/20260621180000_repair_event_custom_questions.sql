-- Repair: RPC get_booking_public_context references business_events.custom_questions
-- but some deployments applied later RPC versions before this column existed → /book/[slug] 404.

alter table public.business_events
  add column if not exists custom_questions jsonb not null default '[]'::jsonb;

comment on column public.business_events.custom_questions is
  'Array of { label: string, required: boolean }. Shown on the public booking form when a guest picks this event.';
