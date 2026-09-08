# Solvio / MHT: deployment handoff to Claude

## User's objective and current authorization

Matty wants the three priority audit repairs taken forward to a controlled release using Claude. The current handoff transfers the completed local implementation and evidence. This initial session is read-only; no production release has been started or approved in this handoff. Prepare the release against the actual current target, then obtain Matty's explicit go-ahead for production database changes and deployment.

## Exact workspace and production identity

- Workspace: `/Users/mattygale/Village/sites/solvio`
- Vercel project: `solvio`
- Production website: `https://www.solviosystems.com`
- Supabase project: `aasfahcrdcoqxwnlkdnv`
- This is Solvio/MHT, not Tipsi. The Supabase project is shared with other applications.

## Completed work

The detailed evidence and repeatable checks are in `docs/reviews/2026-09-08-mht-priority-repairs.md`. Read that brief first; no repeat of the entire audit is needed.

1. B01: imported opening amounts remain in the payment ledger after subsequent receipts; payment insertion and summary updates are atomic; concurrent collections cannot exceed outstanding; stale edits preserve paid amounts and credits.
2. B02: `createPartnerLinkBookingAction` now calls `show_ops_create_partner_link_booking`. The service-only transaction checks partner token, tenant, active show, allowed date/location, references, closures and capacity using the authenticated seller's lock keys.
3. B03 / DB3: current role and page permissions are enforced on booking/payment pages and actions. Restrictive RLS and column guards protect invoices, catalogue changes, receipts and limited door/list operations.

## Coordinated database/application release

New migrations, in order:

1. `supabase/migrations/20260908221151_show_ops_partner_link_capacity.sql`
2. `supabase/migrations/20260908221214_show_ops_opening_paid_balance.sql`
3. `supabase/migrations/20260908221252_show_ops_staff_action_permissions.sql`

The database changes must precede the matching application deployment. The partner form fails closed without its new RPC. Application-side payment summary writes were removed because the new database trigger commits the receipt and summary atomically. An application-only deployment would be unsafe.

The pre-existing `20260909000000_show_ops_imported_paid_opening_balance.sql` is unchanged. Tests exercised its compatibility and lack of duplicate opening entries. Do not blanket-apply the repository's migration directory: the audit found missing baseline definitions, differing deployed timestamps and unrelated unapplied work, including Holded.

Before release, confirm the production identity and deployed dependencies, reconcile migration history, check for ambiguous legacy ledgers, preserve recoverability, and select only the intended changes. Test the real authorized booking/payment/role paths after release without unsolicited customer messages or real charges.

## Changed application files

- `src/app/dashboard/show-ops/actions.ts`
- `src/app/dashboard/show-ops/bookings/new/page.tsx`
- `src/app/dashboard/show-ops/bookings/[id]/page.tsx`
- `src/app/dashboard/show-ops/payments/page.tsx`
- `src/lib/show-ops/access.ts`
- `src/lib/show-ops/nav.ts`
- `src/lib/show-ops/booking-paid.ts`
- `src/lib/show-ops/apply-payment.ts`

New tests are listed in the repair record's commands. The TypeScript loader is `tests/show-ops/register-typescript.cjs`.

## Verified results and limits

158 focused tests passed: 71 TypeScript/application tests, 58 capacity tests including the enclosing test, 14 payment tests and 15 database permission tests. Full TypeScript checking and focused ESLint passed. Combined payment/permission tests verified nested opening imports, door payments, balance updates and rollback under the new policies.

These were disposable local PostgreSQL databases and mocked application boundaries. They do not prove current production schema compatibility, a full baseline replay, deployment or logged-in live-browser acceptance.

No commits, pushes, production writes or deployments were performed for this repair batch. Existing user changes were preserved, including `src/components/dashboard/staff-week-planner.tsx`, and pre-existing untracked `.agents/`, `.codex/`, `output/`, `tmp/`, review notes and Python cache files. Recheck status for subsequent changes; do not indiscriminately stage the working tree or revert anything.

## Scope boundaries

This is deployment of three existing repairs, not a new full audit or implementation of every remaining feature. Remaining audit work includes broader Stripe retry/cancellation handling, manual partial-payment idempotency, audited reversals/refunds, reference allocation, wider export/permission review, invoice/report correctness, complete backups/restoration, shared-platform security and acceptance/cutover.

Imported amounts are recorded historical balances, not independently verified bank receipts. Existing legacy ledgers without an opening marker require reconciliation, not guessed adjustments. Holded, GetYourGuide, accounts UI and the optional EUR 1,000 extras package remain separate. These baseline repairs do not change Joel's agreed price.
