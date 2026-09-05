# Seller ticket-photo attachments

Explicit user requirement: send photographs of seller paper tickets with the outgoing invoice, included at no new charge. Original images are attached alongside the basic invoice PDF. Existing capture stores one replaceable photo per booking on Door, lists or booking detail.

Staff review shows the invoice and original images for its seller, with every missing-photo booking listed. Sending requires review and deliberate acknowledgement of missing images. The server reloads all evidence and compares invoice/line/photo content with the preview fingerprint; changed evidence blocks sending. Failed downloads/invalid images do not silently disappear. Tenant, seller, booking and storage paths are validated before downloads. Basic PDF download remains independent of photo failures.

Limits:50 ticket images,5MiB per image,18MiB combined invoice+images; JPEG/PNG/WebP/HEIC/HEIF originals. Provider payload uses embedded bytes, not public URLs. [Resend attachment documentation](https://resend.com/docs/dashboard/emails/attachments) permits up to40MB after Base64 encoding; application bounds retain headroom. Actual recipient limits and viewing capabilities still need acceptance testing.

Checks:130 Show Ops/notification tests pass, full TypeScript and targeted lint pass. Independent security/edge-case review approved. Mocked transport verifies original attachment bytes and recipient/CC gates. No real emails sent. No database migration required. Authenticated operational acceptance and actual delivery are not claimed by unit checks or a READY deployment.
