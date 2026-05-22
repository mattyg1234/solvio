/*
 * Owner / decision-maker qualification fields for outbound campaign leads.
 *
 * When the agent calls a business, it should establish whether it's speaking
 * to the owner / decision-maker.  If not, it must capture the owner's contact
 * details so we can ring back the right person.  These columns hold the
 * structured output of that qualification step.
 */

alter table public.voice_outbound_leads
  add column if not exists contact_role text
    check (contact_role in ('owner', 'manager', 'employee', 'gatekeeper', 'voicemail', 'unknown')),
  add column if not exists reached_decision_maker boolean,
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists owner_email text,
  add column if not exists owner_best_time text,
  add column if not exists objections text,
  add column if not exists callback_requested_at timestamptz;

comment on column public.voice_outbound_leads.contact_role is
  'Role of the person actually on the call: owner | manager | employee | gatekeeper | voicemail | unknown.';
comment on column public.voice_outbound_leads.reached_decision_maker is
  'True when the agent confirmed it was speaking with the owner / decision-maker.';
comment on column public.voice_outbound_leads.owner_name is
  'Name of the business owner / decision-maker, captured from the gatekeeper if not on the call.';
comment on column public.voice_outbound_leads.owner_phone is
  'Direct phone for the owner, when a gatekeeper provided one.';
comment on column public.voice_outbound_leads.owner_email is
  'Email for the owner, when provided.';
comment on column public.voice_outbound_leads.owner_best_time is
  'Best time-of-day / day-of-week to reach the owner (free text from the call).';
comment on column public.voice_outbound_leads.objections is
  'Short summary of objections raised on the call ("too expensive", "already have a system", etc.).';
comment on column public.voice_outbound_leads.callback_requested_at is
  'If the lead asked us to call back at a specific time, ISO timestamp goes here.';

create index if not exists voice_outbound_leads_decision_maker_idx
  on public.voice_outbound_leads (business_id, reached_decision_maker)
  where reached_decision_maker is not null;

notify pgrst, 'reload schema';
