# Show Ops Holded Invoice Lifecycle Design

Date: 8 September 2026

## Purpose

Connect MHT Show Ops to Holded so Solvio remains the operational source for bookings and partner invoice packs while Holded remains the accounting ledger, legal invoice issuer and Verifactu system. The feature is built and tested locally before any production database or application release.

## Scope

The work is delivered as two independently testable releases.

### Release 1: controlled invoice issue and status sync

1. An owner or administrator connects one Holded company using a server-side credential.
2. The connection check reads Holded contacts, invoice numbering series and sales taxes without creating records.
3. The settings page reports the connected tax regime. An MHT invoice that requires IGIC cannot be sent unless Holded returns an exact matching active sales tax key.
4. Finance issues a partner invoice pack in Solvio, then explicitly sends that pack to Holded as an unapproved draft.
5. A database claim prevents two simultaneous requests from creating duplicate Holded documents.
6. Solvio matches an existing Holded contact using the supplier's stored Holded identifier or exact tax identifier. It creates a client contact only when no exact match exists.
7. The draft contains the invoice date, due date, currency, partner identity, booking references, quantities, unit prices and exact Holded tax keys.
8. Solvio reads the created document back and compares its subtotal, tax and total with the issued Solvio pack. A mismatch is recorded as an error and cannot be shown as ready for approval.
9. Ruth or another authorised accounts user reviews and approves the draft in Holded. Solvio does not approve legal invoices automatically in Release 1.
10. A finance user refreshes one invoice or synchronises outstanding invoices. Solvio stores the Holded document number and state only after validating the response.
11. A document number alone does not prove Verifactu submission. Solvio distinguishes draft, approved, paid, corrected, failed and unknown states, and labels Verifactu as confirmed only when Holded exposes explicit evidence that can be mapped safely. Otherwise it displays "issued in Holded; Verifactu confirmation not available through this API".
12. Holded payment status may update the partner invoice receivable state in Solvio. It does not create or alter guest payment-ledger receipts.

### Release 2: corrections, credit notes and void handling

1. Issued legal invoices are immutable in Solvio.
2. Finance starts a correction from the original invoice, enters a required reason and previews the financial effect.
3. Solvio creates an unapproved Holded credit note linked by tags, notes and stored identifiers to the original invoice.
4. A database claim makes credit-note creation idempotent and prevents repeated clicks from creating duplicates.
5. Ruth reviews and approves the credit note in Holded.
6. Solvio synchronises the credit-note number, state and corrected balance while retaining the original invoice.
7. Voiding an unapproved Holded draft may cancel or delete only that draft after an explicit confirmation and a successful Holded response. Voiding an approved invoice always uses a credit note; it never deletes or rewrites the legal invoice.
8. Every connect, push, refresh, mismatch, correction request, credit-note creation and void action creates an append-only audit event with the business, invoice, actor, action, outcome, external identifier and safe error summary. Credentials and full third-party payloads are never logged.

## Authorisation and secret handling

- Only owner and admin roles can connect, replace, test, pause or disconnect Holded.
- Finance, admin and owner roles can push, refresh and request corrections.
- Integration credentials are encrypted with `SHOW_OPS_SECRETS_KEY` and are never returned to browser code or selectable through the public Data API by ordinary staff.
- Database policies restrict credential rows to owner/admin access and deny direct client-side insertion or mutation outside the approved server flow.
- Holded identifiers are treated as untrusted external values and validated before storage or use.

## Data ownership

- Solvio owns bookings, attendance, booking payment records, partner configuration and the pre-issue invoice pack.
- Holded owns the legal invoice number, approval, accounting payment status, credit note and Verifactu process.
- Solvio stores external identifiers and a synchronised summary. It does not attempt to reproduce a general ledger or tax filing engine.
- The original Solvio pack number remains an internal reference after Holded assigns the legal number.

## Failure behaviour

- Missing or invalid credentials fail before any invoice write.
- Missing IGIC configuration, missing tax identifiers, empty invoice lines or invalid monetary values fail before a Holded draft is created.
- A timeout after a create request leaves the invoice in a reconciliation-required state. A retry first searches for the unique Solvio reference before creating another document.
- A Holded total mismatch blocks approval readiness and records the compared totals.
- Synchronisation failures preserve the last known good state and display the failure time and safe explanation.
- Bulk synchronisation is paginated and reports individual failures instead of silently truncating at 200 documents.
- Disconnecting Holded does not remove invoice history or external identifiers.

## User interface

- Settings shows connection state, credential hint, last check, company tax regime, invoice series availability and any blocking configuration problem.
- Invoice detail shows the Solvio pack number, Holded legal number, Holded state, last sync, amount comparison and available next action.
- Invoice list supports paginated status synchronisation and visibly separates not sent, draft, mismatch, approved, paid, corrected and error states.
- Correction screens show the immutable original, required reason, credit amount and resulting balance before submission.
- Destructive or legally significant actions require explicit confirmation and clear wording.

## Testing and acceptance

### Automated tests

- Pure mapping tests cover contacts, adult, child, infant and manual lines, zero tax, IGIC, GBP, rounding and invalid amounts.
- Action tests cover role checks, exact tax matching, duplicate push claims, timeout reconciliation, response validation, total mismatch, paginated sync and safe errors.
- Disposable PostgreSQL tests cover credential policies, invoice claims, credit-note claims, append-only audit events and tenant isolation.
- Contract fixtures cover representative Holded draft, approved, paid, deleted and credit-note responses.

### Non-production API tests

- Read-only calls confirm the intended MHT Holded company, invoice series, active IGIC sales taxes and API permissions.
- A labelled test contact, draft invoice and draft credit note are created only after Matty approves the write test. They are reviewed in Holded and removed or retained according to the agreed test procedure.
- No customer email, payment collection, legal approval or Verifactu submission occurs during automated testing.

### Production acceptance

- Reconcile the linked Supabase migration history and take a recoverable backup before applying selected migrations.
- Apply database changes before the matching application deployment.
- Test one agreed MHT supplier and invoice with Ruth using non-customer data.
- Confirm the totals, tax key, legal number, approval state, payment state and credit-note path in both systems.
- Record separately what is locally tested, deployed and live-verified.

## Release boundaries

- GetYourGuide connectivity, custom P&L screens, expense capture, bank reconciliation, payroll and unrelated workflow extras are excluded.
- Release 1 can ship before Release 2 after its own acceptance passes.
- Neither release changes Joel's agreed base price or approves the proposed EUR 1,000 package. Commercial scope is confirmed separately in writing.
- The currently configured Holded credential is suitable for read-only development checks, but its account exposes IVA and no IGIC sales taxes. It cannot be used for MHT production invoicing until the correct company and tax configuration are confirmed.

