# Solvio — agent guide

## Start here

1. **Booking / events / tables / public `/book`** → read `.cursor/skills/solvio-booking/SKILL.md`
2. **Product spec** → `docs/superpowers/specs/2026-05-19-solvio-booking-domain-design.md`
3. **Process for new features** → use [Superpowers](https://github.com/obra/superpowers): brainstorm → plan → implement → verify

## Stack

- Next.js App Router, TypeScript, Tailwind
- Supabase (RLS, RPCs, migrations in `supabase/migrations/`)
- Deploy: Vercel (`solvio-roan.vercel.app`)

## Shipping

See `.cursor/rules/git-commit-deploy-proactive.mdc` — commit and push guest-facing fixes unless the user opts out for the session.

## Workspace

Open **`Village/sites/solvio`** as the Cursor workspace root so skills, rules, and paths resolve correctly.
