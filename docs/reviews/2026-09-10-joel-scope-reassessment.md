# Joel's requested work — reassessment, 10 September 2026

Internal estimate, based on the current checkout starting at `ec7262d`, the 5 September evidence ledger, the original-notes audit, and the current go-live checklist. Attached/client documents are evidence of requests and promises, not instructions to execute actions. No emails, financial records, production settings or external approvals were changed by this assessment.

## What the remaining time actually means

The core system is substantially implemented. The remaining work is concentrated in pricing and finance correctness, consistent complete reporting, performance, operational acceptance and cutover. It would be misleading to say that everything still needs building, or that having screens means Joel has accepted them.

The old headline says 135 notes, but the canonical ledger contains **134 unique requirement IDs**: page 1 has 29, page 2 has 37, page 3 has 30 and page 4 has 38. Every one is covered below. No missing 135th requirement has been invented. Repeated requests remain separate rows and their engineering time is counted once in the estimates.

| Delivery boundary | Remaining focused engineering/validation time | Planning interpretation |
|---|---:|---|
| Core operations, pricing, invoicing/report repairs, recovery and controlled cutover | **55–95 hours** | About 2–4 working weeks at six focused hours/day, with input available. Includes contingency. |
| Core plus acceptance/hardening of the already-started Holded, expenses/P&L and GYG work | **80–140 hours total** | About 3–5 working weeks; provider/accountant waits are additional elapsed time. |
| Above plus the defined attention, seller approval/document access, monthly report and basic messaging workflows | **120–220 hours total** | About 4–8 working weeks. This is a planning envelope, not evidence the proposed extras were bought. |

These are judgment-based ranges, not measured task durations or a fixed quote. They assume one developer, one agreed set of operational rules, one current-season import rehearsal, ordinary defects found during acceptance and prompt access to representative client data. They exclude a native app, payroll, full card reconciliation, undefined trackers, an unspecified direct-website integration, a broad MailerLite migration and any new direct tax-submission architecture. They also exclude replacing the Holded client wholesale with a different API: current documentation contradicts the implemented token version, so that migration first needs a verified API contract and separate estimate. Remaining hours should be re-estimated after the first priced booking/invoice reconciliation with Ruth.

## Current live observations from the parent audit

The parent audit supplied fresh read-only Supabase results for the MHT workspace: **16,066 bookings**, **556 active September bookings**, **14 shows with 6 start times populated**, and **zero `show_ops_members` rows**. The owner login is separate from membership rows, so zero rows does not mean nobody can access the workspace. It does mean a staffed multi-user role acceptance has not been established by those data.

An authenticated live calendar reproduced the screenshot. The inspected September 2026 month is **not truncated by the ordinary 1,000-row database cap**; completeness repairs protect larger periods/nights and must not be sold as recovery of missing September 2026 bookings. A separate authenticated September 2025 check did reproduce truncation: the live calendar displayed 2,477 pax while a read-only database aggregate returned 1,310 bookings and 3,251 pax. The live Partners page showed **470 collapsed partner rows**, with lazy editor controls present. These checks update older count/deployment assumptions, but do not prove imported balances, rates or all workflows are correct.

The reviewed calendar edits are **validated and awaiting release verification**: narrower island queries, parallel selected-night loading, complete paged reads, grouped monthly aggregation and a closed-status display. Independent review caught an overlapping-closure action-target regression; the revised implementation preserves the exact-show target and explicitly labels island-wide reopening. A behavioral regression verifies the closed badge and submitted closure ID. The reviewed calendar diff has no remaining identified must-fix issue.

The parent benchmark compared equal aggregation outputs on 16,000 synthetic rows over 100 iterations: **7.99 ms before, 1.26 ms after**. This is a CPU aggregation benchmark, not a browser/network speed measurement. Paging adds requests, so real route timing remains necessary. The estimates remain unchanged because a current-month truncation repair was never counted as a separate work package; unresolved pricing, finance and acceptance remain the larger effort.

The parent also rendered Reports, Door, Buses, Outlook and Invoicing through read-only live visits. These are route smoke checks, not reconciliation, write-flow or staff acceptance. The parent reports 268 passing tests before the last added UI regression, that final regression passing separately, and passing typecheck/focused lint. A production build was blocked by access to `fonts.googleapis.com`; the Vercel connector returned 403 and the CLI check was inconclusive. Production deployment of these calendar changes remains unverified and was not performed by this audit.

The original €4,000 foundation and the proposed €1,000 package must remain commercially separate. Later checklists proposing a December launch with Accounts/Holded/GYG are not evidence of Joel accepting that altered scope. Earlier promises about partner documents, monthly reports, future prices, photos and exports must be reconciled before calling unfinished promised work a new paid extra. No price changes are proposed here.

## Material progress since the old audit

Current source and commit history establish the following implementation changes; this document does not independently prove they passed production acceptance:

- Partner invitations and booking links, atomic capacity enforcement, imported-payment preservation, atomic payment ledger and page/action grants were strengthened. Booking reference collision retry and date-specific, race-safe QR handling were added.
- Partner island filtering and lazy mounting of individual partner editors are present. Hotel/pickup screens have separate directory paths and the bus board gained pickup editing/order controls.
- Invoice PDF branding and original ticket-photo attachments exist. Sellers have an own-booking photo page. Pack-generation navigation now lands on a real invoice-list tab. These supersede several September 5 claims of absence.
- Holded draft creation, refresh/reconciliation and credit-note support exist. Expenses with receipts and a basic island/month P&L exist. These supersede the old claim that no accounts-related implementation exists, but do not implement Joel's complete accounting wish list.
- GYG now has availability, reservation, reservation cancellation, booking and booking cancellation routes plus mappings/push handling. The checklist records provider self-tests; provider approval, real products and commercial acceptance remain separate.
- Main Reports and CSV export completeness improved. This does not repair every other page that independently reads bookings/invoices.

## Work packages behind the estimate

| Package | Hours before contingency | Deliverable and dependency |
|---|---:|---|
| Speed and daily operational polish | 8–14 | Measure Joel's actual slow journeys, correct costly loaders and confirm mobile use; includes calendar/Outlook display and range consistency. Parent audit supplies current performance measurements. |
| Rates, deposits and price preservation | 12–20 | Agree partner-by-show exceptions, future-price policy and retained/remitted deposits; implement an explicit price-on-edit rule and reconcile representative cases. Needs Ruth's commercial examples. |
| Core invoice/report completeness and currency | 8–14 | Shared pack eligibility/preview, complete reads, visible errors, no mixed-currency packs/totals, correct report categories and accepted sample outputs. |
| Recovery and operational runbook | 8–12 | Inventory all required data/files, verify backup coverage and restore into an isolated target, confirm fallback and recovery responsibilities. |
| Staff, device acceptance and cutover rehearsal | 10–16 | Roles with actual test accounts, two-phone Door test, approved-recipient ticket/invoice delivery, UK example, paper output, source-to-hub balances and rehearsal. |
| Core subtotal | **46–76** | Approximately 20% uncertainty reserve gives the rounded **55–95 hour** core envelope. |
| Holded/expense/P&L and GYG acceptance/hardening | **25–45 additional** | Receipt/purchase lifecycle safety, correct P&L basis/currency/completeness, MHT-company settings, end-to-end GYG mapping and provider boundary tests. Requires Jesus/MHT/provider access. |
| Defined optional/promise-reconciliation work | **40–80 additional** | Personalised attention/escalation 8–16; seller approval + invoice access 10–20; agreed monthly reports/PDF or Sheets 10–20; basic internal messaging 8–16; scheduling/remaining small workflow decisions 4–8. Exact direct Sheets authentication and notification rules can widen the range. |

Do not add these rows to the scenario totals a second time. The optional range includes only a modest implementation of each named workflow. Two-way WhatsApp conversations/read acknowledgements, complex automations, MailerLite consent migration and an arbitrary direct-booking API require their own discovery.

## Current defects or limits that affect sign-off

1. **Pricing is still product price plus a supplier-wide percentage.** `src/lib/show-ops/calc.ts` does not consume the imported rate matrix. `prepareBooking` in `src/app/dashboard/show-ops/actions.ts` recomputes base booking money from current master prices during edits. Existing invoice snapshots do not by themselves preserve prices during edits. The former explanation that 100% falls back to product nett is obsolete: `unitNett` now returns 100% of gross. Agree and test the real commercial rule.
2. **Invoice preview and generation still diverge.** The preview in `invoices/page.tsx` lacks generation's `legacy_status != Invoiced` condition. `generateInvoicePackCore` reads matching bookings without paging and can choose workspace currency for a supplier spanning multiple islands/currencies. A later PDF or Holded safeguard cannot make an incorrectly assembled pack correct. The invoice list also has a 500-row cap; overdue reads need explicit completeness/error handling.
3. **Other summary readers retain September 5 defects.** At audit start, Dashboard, Outlook and daily digest have unpaged reads and discarded errors; Dashboard uses workspace currency and Outlook formats euros. Outlook uses `end = today + days` and an inclusive loop, creating 8/15 dates for the 7/14 choice. Parent is addressing the current performance slice; these observations must be refreshed against the final diff before claiming fixed.
4. **The P&L is an operational margin view, not an accepted accounts ledger.** `buildPnl` in `src/lib/show-ops/expenses.ts` groups month/island without currency; its UI formats totals with workspace currency. The booking loader silently ends at 20,000 rows or on a failed page; expenses are unpaged. Tax-exclusive wording also needs reconciliation against whether stored booking prices include tax. The UI explicitly excludes door cash, no-show write-offs, retained seller deposits and Holded ledger entries. Manual income, controlled adjustments, payables and accountant exports are not completed by this panel.
5. **Expense export lacks the invoice connector's safe lifecycle.** `pushExpenseToHoldedAction` checks for a saved purchase ID, creates the external draft and then stores the returned ID. It has no atomic claim or reconciliation of an uncertain create, and ignores the local update result. Concurrent requests or a failure after external creation can duplicate a purchase. The save action can also update an already-exported expense without checking its external state. These are review findings, not production mutation tests.
6. **Custom backup coverage remains incomplete.** `SHOW_OPS_BACKUP_TABLES` contains ten original tables, omitting newer history, rates, dated closures/orders, extras/ticket types, expenses, integrations/GYG data and original storage objects. Read pagination is present, but a complete database/storage recovery has not been established. Restore proof must include credentials/configuration handling without exposing secrets.
7. **Some planning documents conflict with implementation.** Thursday asks requests a Holded V2 token, but current `HoldedClient` explicitly rejects V2 tokens for its v1 paths. The checklist says v1. Confirm the actual supported contract before handing out onboarding instructions. Also, 11 September 2026 is Friday and 1 December 2026 is Tuesday; the weekday labels in those documents are wrong. The checklist's GYG 2–6-week review expectation is a historical planning claim, not a fresh provider commitment.

## Requirement-by-requirement reassessment

Legend: **B** = implementation present; **P** = partial, defect or acceptance remains; **D** = input/definition/demo dependency; **N** = requested workflow not established. B does not mean accepted live. Evidence keys refer to current source areas below. A repeated requirement shares the work package of its first occurrence.

Evidence: **A** = access.ts, nav.ts, settings/actions; **O** = dashboard/calendar/outlook; **M** = master catalogue and partner/pricing components; **BKG** = booking form, actions, history, calc; **PRT** = partner routes and partner-link helpers; **BUS** = buses/actions-bus/pickup directories; **DOOR** = Door/list/ticket scanner/arrival helpers; **REP** = Reports/report-data/daily-report and CSV routes; **INV** = invoices, invoice-pdf/delivery/photos; **COM** = outbound, guest-ticket and digest; **REC** = backup.ts/cron; **H** = Holded client/actions; **EXP** = expenses.ts/actions-expenses/expenses-panel; **GYG** = api/gyg and gyg helpers.

| ID | Joel's point | Current reassessment and next check |
|---|---|---|
| P1-01 | Very slow | P — O/M/BUS: specific optimisations exist; measure complete authenticated journeys and phone scrolling. |
| P1-02 | App/mobile | P — responsive web/manifest exist; key phone flows need acceptance; native app remains undefined. |
| P1-03 | Jesus/Verifactu introduction | D/P — H exists; obtain MHT company, approved IGIC/series/certificate and accountant decision. |
| P1-04 | Vince introduction | D — external ownership/contact and systems handover remain client inputs. |
| P1-05 | Email/SMS/WA/MailerLite/privacy/merge/web sales | P/D — COM gated ticket delivery exists; broad marketing/merge/web integration and consent process are not established. |
| P1-06 | GYG API | P — GYG implementation now exists; provider approval and real product acceptance remain. |
| P1-07 | Backup/server | P — REC paged exports exist; incomplete table/file coverage and restore proof remain. |
| P1-08 | Monthly reports to recipients/download | N/D — REP CSV and COM daily digest exist; selected monthly pack workflow absent. |
| P1-09 | Remove FUE from Dashboard | P — O uses configured islands; confirm MHT configuration rather than delete history. |
| P1-10 | Select month/year | B — O control present; boundary and data acceptance required. |
| P1-11 | Needs attention | P — O operational cards exist; personalised completion workflow absent. |
| P1-12 | Custom attention by user | N/D — A permissions do not implement per-user task routing. |
| P1-13 | Done/clear/escalate to seniors | N/D — agree ownership, persistence and recipients; no full workflow found. |
| P1-14 | Reservation user bus-full alert | P — capacity enforcement exists; targeted user notification needs definition. |
| P1-15 | Last seats alert Ruth/seniors | N/P — BUS occupancy exists; threshold/escalation workflow absent. |
| P1-16 | Supplier cancellation notification | N/D — PRT tells seller to contact office; approval request workflow absent. |
| P1-17 | User dashboard | P — A pages/roles exist; personalised dashboard content remains. |
| P1-18 | Team messages | N/D — no dedicated internal messaging workflow established. |
| P1-19 | Outlook below Calendar | B — O/A navigation present; demonstrate. |
| P1-20 | Remove FUE from Outlook | B — O static sections omit FUE; confirm desired configuration elsewhere. |
| P1-21 | Merge Tenerife/remove Puerto column | B — O grouping present; historical Puerto may remain under Other. |
| P1-22 | Explain money versus door amount | P — O uses booking value; labels and currency need correction/acceptance. |
| P1-23 | Two-bus count | B — BUS/O bus_count exists; demonstrate real multi-coach example. |
| P1-24 | Seven versus fourteen nights/shows | P — O defaults seven but inclusive range is eight/fifteen at audit start; clarify dates versus performances. |
| P1-25 | Hotel/resort grouping | B — O toggle exists; demonstrate same data under both groupings. |
| P1-26 | Seller-link walkthrough | B/D — PRT link/login paths exist; own-record and capacity acceptance required. |
| P1-27 | 24-hour cancellation request/approval | N/D — clarify cutoff meaning/timezone/approver, then implement scoped workflow. |
| P1-28 | Sellers see invoices | N — no partner invoice route established; reconcile earlier promise before classifying extra. |
| P1-29 | Sellers see ticket pictures | P — PRT own-booking upload/view exists; not a general invoice-photo archive. |
| P2-01 | Shows senior-only | B — A catalogue guards exist; actual Ruth/office permissions need acceptance. |
| P2-02 | Explain show options | D — M walkthrough using one priced operational example. |
| P2-03 | Delete show | B — M protects used records; demonstrate delete versus retire. |
| P2-04 | Price changes versus old bookings/invoices | P — BKG snapshots support invoicing but edit recalculates; agree preserve/requote policy. |
| P2-05 | Future scheduled price | N/D — date-effective tariff policy/workflow not established. |
| P2-06 | Explain netts | B/D — BKG supplier percentage of gross; 100% now means full gross, not old fallback. |
| P2-07 | Explain two price lines | D/P — M historical transport fields and current supplement rules need one clear demonstration. |
| P2-08 | Transport nights/resorts | P — M/BUS choices exist; complete actual operating schedule and stop data. |
| P2-09 | UK Tour GBP | P — per-booking/invoice currency exists; O/EXP aggregate defects and UK acceptance remain. |
| P2-10 | Ticket type | B/D — M/BKG ticket-type choices exist; confirm meaning and configured prices. |
| P2-11 | Partners senior-only | B — A permissions exist; verify actual users and direct-write denial. |
| P2-12 | Partner island sorting | B/P — M normalisation/filter and lazy editor exist; confirm intended sort versus filter and imported tags. |
| P2-13 | Partner delete | B — M refuses used partner deletion; Active must be unticked separately. |
| P2-14 | Invoice nett 100% | B/D — BKG explicit percentage; reconcile actual commercial terms. |
| P2-15 | Partner/show invoice rate setup | P — reference matrix not connected to pricing; requires Ruth's agreed exceptions and implementation. |
| P2-16 | Deposit/full collection | P — BKG settings exist; retained versus remitted deposit and rounding unresolved. |
| P2-17 | Explore booking link | B/D — PRT implemented; controlled walkthrough remains. |
| P2-18 | Cancellation and no overselling | P — database capacity added; cancellation approval absent. |
| P2-19 | Hotel/pickup senior-only | B — A catalogue guard exists; preserve booker read choices and test roles. |
| P2-20 | Hotel scrolling/buffering | P — BUS/M directory structure improved; Joel-device acceptance still required. |
| P2-21 | Hotel names/filters | B/P — BUS directories/search exist; actual hotel mappings/data need check. |
| P2-22 | Separate hotel and pickup | B — BUS/M separate controls present; demonstrate many hotels to one stop. |
| P2-23 | Guide note/image/map in print | P — BUS links/notes exist; verify actual paper output and supplied images. |
| P2-24 | Reorder stops only for one night | B/P — BUS dated/permanent paths exist; demonstrate persistence and other-night isolation. |
| P2-25 | Guide name | B — BUS field/output exists; save/read/print acceptance remains. |
| P2-26 | Stop-change SMS/WA maps/read/reply | N/P — COM basic ticket sending exists; change-trigger/read/reply workflow needs separate definition. |
| P2-27 | Ticket photo at arrival for invoicing | B/P — DOOR/INV originals and attachment path exist; whole/partial arrival and inbox acceptance remain. |
| P2-28 | Sales channel/partner categories | P/D — M/REP fields exist; Ruth must approve category mapping and totals. |
| P2-29 | Creator/time/edit history | B — BKG audit/stamps exist; two-account/timezone example required. |
| P2-30 | Cancel without removing | B — BKG soft cancellation exists; confirm financial/list exclusions. |
| P2-31 | Quick check-in versus Door | B/D — DOOR/list distinction exists; simplify training terminology. |
| P2-32 | Partial arrivals | B/P — DOOR party-count and QR handling exist; person-level adult/child attendance still distinct. |
| P2-33 | No cash/card for invoiced guests | B — DOOR controls distinguish billing; accept representative example. |
| P2-34 | Print all/layout | P — DOOR print controls exist; paper pagination/columns require acceptance. |
| P2-35 | Move Daily Sales | B — REP destination present. |
| P2-36 | Door versus office list | B/D — DOOR live arrivals versus paper list; explain and accept. |
| P2-37 | Comment/diet/balance colours | B/P — DOOR/BKG flags exist; test combinations and paper readability. |
| P3-01 | QR and guest ticket | B/P — DOOR/COM paths exist; real phone ticket/invalid/duplicate scan demonstration remains. |
| P3-02 | Door comments/diet | B — DOOR displays fields; confirm representative records. |
| P3-03 | Evening-only Door | P — date-based DOOR view exists; confirm operating schedule and wording. |
| P3-04 | Live Door demo | D — controlled two-phone acceptance still needed. |
| P3-05 | Timestamps | P — local formatting exists; check stored time versus both staff devices. |
| P3-06 | Door/quick-check confusion | B/D — shared terminology/training task, not another build. |
| P3-07 | App | P/D — mobile-web acceptance; native scope separate. |
| P3-08 | Photo on booking/invoice | B/P — DOOR/INV paths exist; upload/privacy/inbox acceptance needed. |
| P3-09 | TFS/ACE deposit rounding | N/D — BKG round2 is not the requested commercial rounding rule; obtain examples. |
| P3-10 | Type into selection fields | P — BKG searchable major choices exist; walk every remaining selector. |
| P3-11 | References | B/P — BKG collision retry/series rules added; imported prefixes/uniqueness need reconciliation. |
| P3-12 | Printable guest PDF template | P/D — guest ticket/QR exists; agreed downloadable template acceptance not established by invoice PDF. |
| P3-13 | Send to Guest on booking | B/P — BKG/COM both staff and partner creation paths wired; placement/provider receipt check remains. |
| P3-14 | Direct cash/card/UK reports | P — atomic BKG payment ledger exists; corrections and GBP reconciliation remain. |
| P3-15 | Missing stop/time | P — BKG validates transport stop; actual hotel/stop mappings need reproduction and repair if blank. |
| P3-16 | Private accommodation types/list label | B — BKG/private-pickup helpers support types; office/guest output acceptance remains. |
| P3-17 | Reports certain users | B — A grants exist; actual staff login tests remain. |
| P3-18 | Define remaining reports | D — Joel/Luke example sheets and calculation definitions needed. |
| P3-19 | PDF/Google Sheet export | P — REP complete CSV work exists; agreed formatted PDF/direct-Sheets flow absent. |
| P3-20 | Tickets/stats sheet explanation | D — obtain original workbook and map each measure. |
| P3-21 | Tour operator/direct split | P — REP current grouping exists; category/meaning reconciliation still needed. |
| P3-22 | Remove Cash Taken | P/D — confirm exact card/report and accepted replacement; preserve payment history. |
| P3-23 | Stats versus Reports | B/D — REP consolidated navigation/redirect exists; demonstrate. |
| P3-24 | Daily Sales destination | B — REP present; same task as P2-35. |
| P3-25 | Weekly/monthly/yearly mirrored sales | P — REP ranges and complete readers improved; workbook reconciliation still absent. |
| P3-26 | Check roles | B/D — A role/page editing added; actual staff matrix and acceptance required. |
| P3-27 | In-house email sample | B/P — COM sample/digest exists; allowlisted recipient delivery test required. |
| P3-28 | Verifactu details | P/D — H/invoice config exists; Jesus's real issuer/tax/series approval required. |
| P3-29 | Backup options | P — REC incomplete custom coverage; recent run and restore drill remain. |
| P3-30 | All operational data | D/P — imports exist; counts alone do not prove complete/reconciled current-season data. |
| P4-01 | Calm invoicing walkthrough | D — complete draft/issue/send/payment/overdue example including Holded authority. |
| P4-02 | Invoice confusion | D — short role-specific instructions and sample pack; shared with P4-01. |
| P4-03 | Ticket images/file or combined PDF | P — INV sends validated originals alongside invoice PDF; combined-image PDF not the implemented format. |
| P4-04 | Zero pack previews | P — INV generation navigation fixed; eligibility/rate/completeness mismatch still requires repair. |
| P4-05 | Invoice PDF/template/email | B/P — INV branding now exists; actual issuer data/layout/recipient receipt acceptance remains. |
| P4-06 | Verifactu | P/D — H draft/lifecycle exists; real MHT settings, provider/Jesus and door-sales decision remain. |
| P4-07 | Recipient opened invoice | N/D — stored send metadata is not opened/read confirmation; define achievable tracking. |
| P4-08 | Click overdue invoice | B/P — INV links present; complete reads and draft/paid exclusions need acceptance. |
| P4-09 | Overdue reminders to Ruth | P — COM daily digest includes overdue; recipients, completeness and schedule delivery still need acceptance. |
| P4-10 | Invoicing walkthrough | D — duplicate of P4-01; count once. |
| P4-11 | Accounts seniors-only | P — EXP uses finance+invoices permission; not automatically owner/admin-only; agree intended audience. |
| P4-12 | Outstanding invoices | B/P — INV receivables present; opening balances and correction flow need reconciliation. |
| P4-13 | P&L | P — EXP basic month/island margin exists; currency/basis/completeness and accountant acceptance remain. |
| P4-14 | Invoice income with adjustments | N/P — EXP uses booking nett, not controlled ledger postings/adjustments. |
| P4-15 | Manual income | N/D — no dedicated manual-income entry established; optional accounts definition needed. |
| P4-16 | Categories | P — EXP fixed expense categories exist; Jesus must approve mapping/customisation needs. |
| P4-17 | IGIC split | P — invoice/expense tax fields exist; consolidated accounting/tax basis not accepted. |
| P4-18 | Jesus-compliant sample | D — obtain approved sample and reconcile; code cannot establish approval. |
| P4-19 | Expenses | B/P — EXP entry exists; edit/export lifecycle safety and accountant acceptance remain. |
| P4-20 | Receipt files into P&L | B/P — EXP receipt storage/signed links and cost rows exist; final linked-output workflow needs acceptance. |
| P4-21 | Cash paid checkbox | N/D — EXP lacks the requested expense payment-method/status workflow. |
| P4-22 | Outstanding transfers/date/notify seniors | N/D — expense entry does not provide complete accounts payable/due/settlement notification flow. |
| P4-23 | Jesus-approved IGIC/tax | D — explicit accountant sign-off and actual MHT configuration required. |
| P4-24 | Download for Jesus | N/P — invoice/booking CSVs exist; agreed complete accounts export not established. |
| P4-25 | Payroll breakdown | N/D — separately define data/rules; outside narrow accounts envelope. |
| P4-26 | Card reconciliation | N/D — statements/matching exceptions and ownership undefined; separate estimate. |
| P4-27 | Golden Ticket tracker | N/D — obtain sheet/workflow; separate estimate. |
| P4-28 | UK in-resort tracker | N/D — obtain tracker; GBP booking support alone does not implement it. |
| P4-29 | Sales data for three islands | P/D — REP baseline exists; reconcile exact three-sheet periods/categories. |
| P4-30 | Suppliers | P — M catalogue/filter exists; terms and partner-by-show rates still need reconciliation. |
| P4-31 | Three-island and general P&L | P — EXP island/month rows exist; consolidated currency/tax/ledger issues remain. |
| P4-32 | Lanzasoft data | P/D — imports and protected payment ledger exist; freeze/export/insert-only cutover rehearsal needed. |
| P4-33 | Opening outstanding invoices | P/D — INV screen exists; actual opening debts/documents not established by this audit. |
| P4-34 | Outstanding outs | N/D — accounts-payable definition still missing. |
| P4-35 | Bus CPH | P/D — REP cost/head calculation exists; agree boarded/booked/infant/multi-bus denominator against sheet. |
| P4-36 | Golden Ticket sheets | N/D — duplicate discovery of P4-27; count once. |
| P4-37 | Harper tracker | D — meaning/users/output unknown; no honest implementation estimate yet. |
| P4-38 | Card reconcile | N/D — duplicate of P4-26; count once. |

## Inputs that determine the critical path

Ruth/Joel: one approved partner-by-show pricing sheet, three deposit examples including the island exception, whether editing should preserve the original price, treatment of imported overpayments, actual staff/page permissions, start times, one accepted monthly report and one invoice example, current-season cutover files and owner of the GYG supplier account.

Jesus: MHT's actual Holded company, accepted connector credential/version, issuer/series/IGIC and purchases setup, accountant sample and whether door sales need a separate tax-submission flow. None of this was satisfied merely by testing against Matty's test company.

Vince/provider: website/email/marketing ownership and integration contract, approved sender setup, GYG real product mapping/review. The existing checklist's provider timeline must be reconfirmed if used for a launch promise.

A practical release sequence is core pricing and complete finance totals first, then recovery and staff/device acceptance, then real-provider setup and cutover rehearsal. Finish those gates before claiming production readiness. Provider waiting can overlap core work; it should not be presented as engineering hours.

## Verification of this document

The reassessment inspected current implementations and relevant September 5–9 commit history. It did not execute financial writes, send messages, change production, test a restore or perform user acceptance. Requirement IDs were checked against the canonical ledger for exact unique coverage. Current-run performance edits and live read-only findings belong to the parent audit and should be read alongside this document.

## Final validation and release record

- 269 Show Ops application tests passed. This is not the PostgreSQL integration or full browser mutation suite.
- Full repository ESLint and TypeScript checking passed.
- Production build passed after granting network access to fetch the existing Google Fonts. The initial sandbox build failed only on those font requests.
- Two stale partner-action test mocks were repaired for the newer GetYourGuide push dependency. Two existing lint errors were corrected without behavior changes.
- Before release, Vercel CLI confirmed the Solvio production domain and deployment `dpl_623fWNv4aYetJjzggUGb9Xc4hQmU` Ready. The connector lacked this team scope; the existing CLI login worked.
- Live Holded metadata records connected / IGIC, checked 9 September. This does not independently verify the legal company identity, accountant approval or current upstream credentials.
- No production database migration, booking/payment mutation, partner email, external invoice/purchase creation or staff permission change was performed.
- If the proposed 1 December 2026 launch remains the target, it is Tuesday and 82 calendar days from this audit. This is a planning date from the checklist, not a newly confirmed client commitment.
