import type { VerifactuPayload } from "@/lib/show-ops/invoice";

export type VerifactuSubmitResult =
  | { ok: true; skipped: true; status: "manual" }
  | { ok: true; skipped?: false; status: "recorded"; remoteId?: string }
  | { ok: false; status: "error"; error: string };

export function verifactuIsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SHOW_OPS_VERIFACTU_API_KEY?.trim());
}

/**
 * Ready for a Verifactu / AEAT adapter. Until SHOW_OPS_VERIFACTU_API_KEY is set,
 * invoices issue locally with status `manual` — no XML, no fake AEAT calls.
 */
export async function submitVerifactuInvoice(
  payload: VerifactuPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<VerifactuSubmitResult> {
  const key = env.SHOW_OPS_VERIFACTU_API_KEY?.trim();
  if (!key) {
    return { ok: true, skipped: true, status: "manual" };
  }
  const url = env.SHOW_OPS_VERIFACTU_API_URL?.trim();
  if (!url) {
    return {
      ok: false,
      status: "error",
      error: "SHOW_OPS_VERIFACTU_API_KEY is set but SHOW_OPS_VERIFACTU_API_URL is missing.",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: "error", error: `Verifactu API ${res.status}: ${text.slice(0, 400)}` };
    }
    let remoteId: string | undefined;
    try {
      const json = JSON.parse(text) as { id?: string; invoiceId?: string };
      remoteId = json.id || json.invoiceId;
    } catch {
      remoteId = undefined;
    }
    return { ok: true, status: "recorded", remoteId };
  } catch (err) {
    return { ok: false, status: "error", error: err instanceof Error ? err.message : "Verifactu request failed." };
  }
}
