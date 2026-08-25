# Malditos Bastardos — outreach lead card

| Field | Value |
|-------|--------|
| **Demo site** | https://9-malditos-bastardos.vercel.app/ |
| **Booking embed** | `https://www.solviosystems.com/book/preview?lang=es&name=Malditos%20Bastardos&wa=34692256845` |
| **WhatsApp (citas)** | **+34 692 25 68 45** — `https://wa.me/34692256845` |
| **Tel. Barceló** | +34 911 63 10 41 |
| **Nova source** | `~/.openclaw/workspace/village/server/data/websites/9-malditos-bastardos/` |

## Workflow

1. Nova site (Spanish) → `#reserva` iframe → **book/preview** with `lang=es` + `name` + `wa`.
2. Guest tries fake booking → success → **Continuar por WhatsApp** to close (£100 + £50/mo).
3. No Supabase `outreach-*` rows.

## Pitch (ES)

```
Hola — Matty de Solvio. Hemos preparado una vista previa gratis para Malditos Bastardos: https://9-malditos-bastardos.vercel.app/

Baja a *Reserva Online* y prueba la reserva (demo en tu móvil). Si quieres activarla: 100 € setup + 50 €/mes — respóndeme por WhatsApp.

Sin compromiso.
```
