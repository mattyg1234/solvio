# Solvio Show Ops — white-label, MHT-first

**Status:** Live for MHT (Finance tier) + multi-tenant customisation  
**Last updated:** 2026-08-11  
**Scope:** Multi-tenant show/tour/boat-party operations inside Solvio (not venue `/book`)  
**Tenant login:** `mht@solviosystems.com` → `/dashboard/show-ops`  
**Workspaces:** One Solvio login can own a business **and** be invited to another team (`show_ops_members` + workspace cookie switcher).

## Problem

Tour and show operators (design partner: MHT) re-key the same booking into office lists, bus lists, invoices, and commercial trackers. Solvio Show Ops is one booking brain: master data → bookings → generated lists, payments, invoices, and reports. The same binary is sold white-labelled to other businesses.

## Non-negotiables

1. **One codebase** — MHT customisation is `show_ops_config` + feature flags, never a fork.
2. **Tenant isolation** — every row has `business_id`; RLS via business ownership or `show_ops_members`.
3. **White-label** — logo, colours, custom domain per business; Solvio remains the vendor.
4. **Security & Plan B** — RLS, audit columns, nightly export, documented restore (RPO ≤ 24h v1).

## Product flag

- `businesses.show_ops_enabled` (boolean) and/or `platform_capabilities.show_ops`
- `businesses.show_ops_config` (jsonb) — islands, modules, dietary mode, report presets, feature flags
- `businesses.show_ops_billing_tier` — `starter | ops | finance`

Module gates in config `enabled_modules`: `bookings`, `lists`, `payments`, `invoices`, `commercial`.

## White-label fields (`businesses`)

| Column | Use |
|--------|-----|
| `show_ops_display_name` | UI product name |
| `show_ops_logo_url` | Sidebar / print headers |
| `show_ops_primary_color` / `show_ops_accent_color` | Theme CSS variables |
| `show_ops_custom_domain` | Host → business (middleware) |
| `logo_url` | Fallback if show-ops logo empty |

## Roles (`show_ops_members`)

`booker` | `office` | `finance` | `admin` (+ business owner always admin).

## Domain tables

Master: `show_suppliers`, `show_products`, `show_hotels`, `show_bus_stops`, `show_bus_orders`  
Ops: `show_bookings`, `show_booking_payments`, `show_invoices`, `show_invoice_lines`

Booking save: allocate `booking_ref`, stamp `created_by` / `updated_by` + timestamps. Auto fill pickup from hotel; deposit/invoice from supplier; totals from pax × ticket prices.

## Phases

0. Shell + branding + roles  
1. Master + bookings + Last 50 + weekly outlook  
2. Office / bus / dietary lists + daily sales  
3. Payments + invoice pack + overdue  
4. Commercial tracker + bus cost-per-head  
5. CSV import + custom domain + billing tiers  
**A (2026-08-12).** Ops home + Stripe guest pay-links — see `docs/superpowers/specs/2026-08-12-show-ops-nervous-system.md` 

## MHT defaults (config seed)

Islands: e.g. `["Lanzarote", "Fuerteventura", "Tenerife", "UK Tour"]`  
Dietary: free text when yes  
Office list sort: supplier then guest surname  
Feature flag: `mht_tracker_v1` optional for sheet-shaped commercial tabs  

## Out of scope (v1)

Public website guest booking → Show Ops (later). Verifactu API integration (store invoice # / dates only).
