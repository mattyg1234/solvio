# Basic invoice PDF delivery

Included completion of the agreed MHT core build; no extra package acceptance inferred.

Implemented: issued, non-voided invoice PDF generated from stored monetary/legal fields, staff download and attachment on existing invoice email action. Uses invoice currency, manual descriptions and tenant-scoped complete line loads. Staff finance/page guards apply. CC recipients obey the same outbound test allowlist as primary recipients. No real emails sent during development.

Verification: 124 Show Ops/notification tests pass, full TypeScript check and targeted ESLint pass. Independent security/edge-case review approved. GBP sample and pagination rendered and visually inspected. No database migration required.

Limits: standard PDF font supports Latin/Spanish and rejects unsupported characters explicitly. Show dates follow linked booking data, matching current print behavior; immutable date snapshots remain a separate improvement. Actual delivery and client template approval remain acceptance tasks. Photo packaging is preserved outside the repository and excluded from this release; cancellation and partner document access are separate proposed scope.
