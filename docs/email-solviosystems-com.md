# solviosystems.com email (Twilio + work inbox)

DNS is on **Vercel** (not GoDaddy, not Cloudflare nameservers). Root MX records for **ImprovMX** forwarding were added via CLI.

## Your address

- **Work email:** `matty@solviosystems.com`
- **Forwards to:** `mattygale4@gmail.com` (set this in ImprovMX after signup)

Use `matty@solviosystems.com` on the Twilio UK regulatory bundle (Authorized Representative work email).

## One-time: activate forwarding (≈2 min)

1. Sign up at [improvmx.com](https://improvmx.com) (free).
2. Add domain **`solviosystems.com`**.
3. ImprovMX will detect MX records (already set on Vercel):
   - `mx1.improvmx.com` priority 10
   - `mx2.improvmx.com` priority 20
4. Create alias: `matty` → `mattygale4@gmail.com`.
5. Send a test to `matty@solviosystems.com` and confirm it arrives in Gmail.

DNS can take up to 24h; usually under an hour.

If ImprovMX still shows **Email forwarding needs setup**, click **CHECK NOW** on the banner (MX is on Vercel DNS: `mx1.improvmx.com` / `mx2.improvmx.com`).

**Twilio:** use `matty@solviosystems.com` (lowercase alias) as the authorized rep work email.

## Cloudflare note

**Cloudflare Email Routing** only works if the domain’s **nameservers** point to Cloudflare. This domain currently uses `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, so ImprovMX on Vercel DNS is the right setup unless you deliberately move DNS to Cloudflare.

## Resend (sending)

Existing records are unchanged:

- `send` MX → Amazon SES (Resend)
- `resend._domainkey` TXT

Root `@` MX is only for **receiving** forwarded mail via ImprovMX.

## Storing inbound mail in Supabase (later)

Requires an inbound webhook provider (Postmark, Mailgun, etc.) → API route → table. Not required for Twilio bundle approval.
