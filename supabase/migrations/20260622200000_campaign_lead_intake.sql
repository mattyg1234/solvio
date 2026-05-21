/*
 * Enrich campaign leads with structured intake captured during / after AI calls.
 * Fields are populated by the post-call LLM extraction webhook handler.
 */

alter table public.voice_outbound_leads
  add column if not exists email text,
  add column if not exists address_line1 text,
  add column if not exists city text,
  add column if not exists postcode text,
  add column if not exists country text,
  add column if not exists interest_level text
    check (interest_level in ('hot', 'warm', 'cold', 'not_interested')),
  add column if not exists intake_json jsonb not null default '{}'::jsonb,
  add column if not exists intake_notes text,
  add column if not exists extracted_at timestamptz;

comment on column public.voice_outbound_leads.interest_level is
  'Set by post-call AI extraction: hot = ready to book, warm = follow up, cold = maybe later, not_interested.';
comment on column public.voice_outbound_leads.intake_json is
  'Structured key/value pairs extracted from call transcript by LLM (any extra facts beyond the standard columns).';
comment on column public.voice_outbound_leads.intake_notes is
  'Short free-text summary of what was learned on this call, written by the post-call LLM.';
comment on column public.voice_outbound_leads.extracted_at is
  'When intake fields were last populated by the extraction job.';

create index if not exists voice_outbound_leads_interest_idx
  on public.voice_outbound_leads (business_id, interest_level)
  where interest_level is not null;
