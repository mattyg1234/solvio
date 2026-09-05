# Show Ops partner safety implementation plan

> Execute with subagent-driven-development; authorisation to implement and ship is present in the conversation and repository shipping rule.

**Goal:** Close Joel's senior-access and partner-overbooking gaps.

**Architecture:** Shared page permissions plus server action checks and database write policies; a private database trigger serialises capacity-changing bookings and checks limits for sellers. Existing booking catalogue reads and staff overrides stay available.

**Tech stack:** Next.js, TypeScript, Supabase Postgres.

- [x] Add failing role regression tests in `src/lib/show-ops/permissions.test.ts`: office/finance/booker cannot access shows/partners/hotels even through saved allow-lists; owner/admin retain access.
- [x] Update `nav.ts`, master tab gate, settings permissions presentation and all catalogue mutations. Test via compiled Node tests and type checking.
- [x] Generate migration with Supabase CLI. Add restrictive INSERT/UPDATE/DELETE policies to catalogue tables using a private owner/admin predicate; preserve SELECT.
- [x] Build a disposable Postgres-compatible test fixture and demonstrate overbooking and non-admin writes before migration.
- [x] Add private capacity trigger: lock business/island/night, aggregate uncancelled passengers, check product capacity and bus seats for sellers, reject full night, preserve staff override. Protect seller updates too.
- [x] Verify boundary, isolation and concurrency cases on a real Postgres engine; run existing Show Ops tests and lint/type checks.
- [x] Independent spec and code review passed; product-island regression fixed. Apply reviewed migration, commit only task files, push and verify production deployment.
- [x] Report delivered scope and dependencies, including cancellation cutoff ambiguity and required reporting/templates inputs.

## Verification evidence

- 116 Show Ops TypeScript tests pass.
- 20 tests pass against disposable local PostgreSQL 17, including direct RLS writes and simultaneous last-seat bookings. Pre-fix suite reproduced the failures; additional product-island-change regression also failed before its correction.
- Full TypeScript check passes; targeted lint passes for edited files.
- Full repository lint has three existing errors: unused `primaryStripeChargesEnabled` in dashboard/bookings/page.tsx, explicit `any` in show-ops/nights.ts, prefer-const in voice-booking-service.ts. These are outside this change.
- Independent spec and security/code review approved after the product-island-count fix.
- Supabase security advisor baseline: one existing error on `voice_call_usage_current_month`; no Show Ops error.

## Remaining work and inputs

Cancellation approvals and invoice/photo attachments are separate remaining slices. Resolve whether the partner cancellation cutoff means at least 24 hours before the show, using actual show start times. Show times, GC partner tags, nett rates, rounding rules, guest ticket example and sales/accounting sheets still require confirmed business inputs.

## Release

5 September 2026: migration `20260905155752` applied and recorded on Solvio `aasfahcrdcoqxwnlkdnv`; verified 15 restrictive catalogue write policies and the enabled capacity trigger. Post-change database advisors show no new security errors. App commit `4b86c55` pushed to main and deployed from its clean archive. Vercel deployment `dpl_BRsCW7Ktbj2ScKzkfn6RJHtDfXVj` is READY and serves `www.solviosystems.com`. This verifies the deployed version; authenticated browser acceptance testing with Joel's real staff accounts remains separate.
