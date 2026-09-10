/*
 * Expenses → Holded: claim lock for the draft-purchase push.
 *
 * The first cut of show_expenses had "no lifecycle guard": a double click, two
 * staff at once, or a failure after Holded had already created the purchase
 * (timeout, 5xx after create, network drop, local update failing) could leave a
 * duplicate purchase in Holded or a purchase Solvio does not know about.
 *
 * Lifecycle (mirrors the invoice path in spirit, without private-schema functions):
 *   not_sent / error ──claim (conditional update)──▶ creating
 *   creating ──Holded created + Solvio recorded it──▶ draft        (token cleared)
 *   creating ──Holded rejected it (4xx, nothing created)──▶ error  (token cleared)
 *   creating ──Holded answer unknown, or Solvio could not record──▶ unknown (token kept)
 *   unknown / stale creating ──Reconcile: found by "Solvio expense <id>" in notes──▶ draft
 *   unknown / stale creating ──Reconcile: nothing in Holded──▶ not_sent (token cleared)
 *
 * The claim is a single conditional UPDATE on (purchase id is null, token is
 * null, status in not_sent/error); zero rows means somebody else holds it.
 */

alter table public.show_expenses
  add column if not exists holded_claim_token uuid,
  add column if not exists holded_claimed_at timestamptz;

alter table public.show_expenses drop constraint if exists show_expenses_holded_status_check;
alter table public.show_expenses
  add constraint show_expenses_holded_status_check
  check (holded_status in ('not_sent', 'creating', 'draft', 'error', 'unknown'));

comment on column public.show_expenses.holded_status is
  'not_sent → creating (claimed) → draft (purchase recorded) | error (Holded rejected, retry allowed) | unknown (Holded outcome not confirmed; Reconcile before retrying).';
comment on column public.show_expenses.holded_claim_token is
  'Set while a send to Holded is in flight or unconfirmed; the completing update is guarded by this token. Null once the outcome is known.';
comment on column public.show_expenses.holded_claimed_at is
  'When the current claim was taken; a claim older than 10 minutes still in creating is treated as stalled and offered Reconcile.';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260910120000', 'show_ops_expenses_holded_claim') on conflict do nothing;
