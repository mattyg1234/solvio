# MHT priority repairs: implementation record

8 September 2026. Local implementation and isolated testing only. No production migration, deployment, payment, email or booking change was performed.

## Delivered in this pass

| Audit area | Repair | Evidence |
| --- | --- | --- |
| B01: imported paid balances | Historical paid amounts become explicit `import` ledger entries, including zero openings. New receipts and balance updates commit together. Booking edits retain the paid basis and credits; concurrent collections cannot exceed the remainder. Ambiguous existing legacy ledgers stop for reconciliation. | 14 PostgreSQL payment tests, including simultaneous final payments, failed-summary rollback, repricing and compatibility with the pre-existing opening migration. |
| B02: partner overbooking | The actual partner form now uses a service-only booking transaction. It rechecks the token, partner, show, date, location, related records, closures and show/bus capacity under the existing seller locks. | 57 database scenarios plus their enclosing test; four actual action tests cover transaction routing, rejection, missing migration and reference retry. |
| B03 / DB3: staff permissions | Booking/payment pages and server actions enforce current role and page permissions. Restrictive database policies protect invoice/catalogue changes and receipts. Door/list-only staff retain limited attendance and payment operations without general booking editing. | 15 PostgreSQL permission tests, including integration with the payment migration; actual guard/page and server-action tests; existing navigation tests. |

The final focused run passed **158 tests**: 71 TypeScript/application tests, 58 capacity tests including the enclosing test, 14 payment tests and 15 permission tests. Full TypeScript checking and focused ESLint checks also passed. These are isolated fixtures and mocked application boundaries, not authenticated production browser acceptance or a complete replay of production's schema.

Additional safeguards in the touched payment paths: manual amounts must be finite and positive; staff cannot submit an imported/Stripe receipt through the manual form; the payment-link query now includes the booking island for currency selection. A recorded door payment can no longer be silently undone or relabelled without correcting its ledger. A full audited correction/refund interface is still separate work.

## Deployment dependency

The application and these three database migrations form one coordinated release:

1. `20260908221151_show_ops_partner_link_capacity.sql`
2. `20260908221214_show_ops_opening_paid_balance.sql`
3. `20260908221252_show_ops_staff_action_permissions.sql`

Apply the database changes before the corresponding application deployment. The partner action deliberately fails closed if its transaction is unavailable. Application-side payment-summary writes have been removed in favour of the atomic database trigger, so deploying only the application would be unsafe.

The existing later `20260909000000_show_ops_imported_paid_opening_balance.sql` remains intact. Tests confirm it does not duplicate the new opening entries. Before applying anything live, reconcile the target project's existing migration history and schema, inspect unresolved legacy ledgers, preserve a recoverable backup, and use a controlled rollout. Do not blindly push the whole migration directory: the audit found missing baseline definitions and divergent migration timestamps.

## Remaining audit work

This pass does not complete the full audit or change Joel's commercial scope. Still outstanding are the broader Stripe webhook/retry/cancellation issues, invoice/report correctness, backup/restore completeness, shared-platform security findings, historical-data decisions and acceptance/cutover work. Holded, GetYourGuide, accounts screens and the optional EUR 1,000 feature package have not been implemented by these repairs.

Manual partial-payment retries still need explicit submission identifiers to distinguish an accidental duplicate from a second intentional payment. The new lock prevents the combined payments exceeding the amount due; it does not solve every duplicate below that limit. Reference allocation and the broader permission/export review also remain separate audit items.

Imported opening entries preserve the recorded source amount; they do not independently verify that money reached a bank account. Any legacy booking already containing receipts without an opening entry needs source reconciliation rather than an inferred amount.

## Repeatable local checks

Run from the repository root. PostgreSQL tests create disposable local clusters and do not use application database credentials.

```sh
node --require ./tests/show-ops/register-typescript.cjs --test src/lib/show-ops/booking-paid.test.ts src/lib/show-ops/booking-paid-integrity.test.ts src/lib/show-ops/calc.test.ts src/lib/show-ops/permissions.test.ts src/lib/show-ops/actions-permission-integrity.test.ts src/lib/show-ops/partner-link-action.test.ts tests/show-ops/staff-action-permissions.test.cjs
PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH" node --test src/lib/show-ops/partner-link-capacity.pg.test.mjs
python3 tests/show-ops/payment-integrity.py
python3 tests/show-ops/staff-permissions.py
node node_modules/typescript/bin/tsc --noEmit --incremental false
```
