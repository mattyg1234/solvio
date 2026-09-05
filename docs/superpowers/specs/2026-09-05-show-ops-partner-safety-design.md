# Show Ops: Joel's outstanding operational safeguards

User authorised implementation on 5 September after reviewing the PDF comparison.

## First shipping slice

Only business owners and admin members may manage Shows, Partners, Hotels and permanent pickup points. Explicit page selections cannot grant these pages to junior roles. Booking staff retain read access to the catalogue needed to create bookings. Enforce writes in server actions and database policies; choose the correct permission for each master tab.

Partner booking saves must reject full show nights and buses, including simultaneous attempts to take the last seat. Count all uncancelled bookings in the business, not only the seller's own rows. Capacity follows the existing product/night model; bus capacity spans the island/night. Missing limits remain unset; an explicit zero has no seats. Staff retain their existing override workflow. Use database enforcement so direct API writes cannot bypass it.

## Subsequent slices

Partner cancellation requests are requests, not immediate cancellations. Office approval must preserve history and existing invoicing safeguards. The ambiguous wording of the 24-hour boundary must be made explicit before enabling it. Invoice/photo email attachments must reuse the current invoice data and existing outbound test gate. No live messages are sent during verification.

## Setup boundaries

Do not invent show start times, partner location tags, commercial rates, deposit rounding rules or reporting layouts. Keep those as named input dependencies. Accounts and third-party integrations remain outside this slice.

## Verification

Exercise role restrictions including saved allow-lists and direct writes; test capacity at zero, exactly full, cancellation, unrelated nights, staff overrides and concurrent last-seat attempts. Run Show Ops regression tests, type checking and relevant lint. Review before committing/pushing and verify deployment separately from source completion.
