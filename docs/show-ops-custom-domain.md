# Show Ops custom domain (white-label)

1. Customer creates a CNAME: `ops.theirbrand.com` → `cname.vercel-dns.com` (or the target Vercel shows).
2. In Vercel project **solvio**, add the domain under Project → Settings → Domains.
3. In Show Ops → Settings, save **Custom domain** as `ops.theirbrand.com` (no scheme).
4. Middleware sets `x-solvio-custom-host` for non-Solvio hosts so future branding resolution can load the matching `businesses.show_ops_custom_domain` row.
5. TLS is automatic via Vercel.

Billing: custom domain is included from Ops tier upward in the commercial offer; Starter may use `solviosystems.com` only.
