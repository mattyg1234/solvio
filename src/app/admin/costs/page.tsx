import { redirect } from "next/navigation";

import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Cost overview · Solvio admin" };

type TierCount = { tier: string; count: number; price: number };

// Tier prices reflected at /dashboard/pricing.
const TIER_PRICE_GBP: Record<string, number> = {
  trial: 0,
  booking: 50,
  pro: 150,
  business: 150,
  scale: 399,
  enterprise: 0,
};
const TIER_PRICE_EUR: Record<string, number> = TIER_PRICE_GBP;

function fmtUSD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtEUR(amount: number): string {
  // Tier prices are now denominated in GBP — keeping the helper name for ABI
  // stability across the rest of this file. Display currency switched to £.
  return `£${amount.toFixed(0)}`;
}

export default async function AdminCostsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSolvioAdminEmail(user.email ?? null)) redirect("/dashboard");

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  // Voice call costs (Vapi-reported total per call — includes LLM + TTS + STT + Vapi fee + Twilio per-min).
  const [
    { data: monthRows },
    { data: allRows },
    { data: tierRows },
    { data: bundleRows },
    { data: topBizRows },
    { data: llmMonthRows },
    { data: llmAllRows },
  ] = await Promise.all([
    supabase
      .from("voice_call_logs")
      .select("cost_cents, duration_seconds")
      .gte("started_at", monthStartIso),
    supabase.from("voice_call_logs").select("cost_cents, duration_seconds"),
    supabase.from("businesses").select("subscription_tier"),
    supabase.from("voice_outbound_credits").select("bundle_calls_purchased_total"),
    supabase
      .from("voice_call_logs")
      .select("business_id, cost_cents, duration_seconds")
      .gte("started_at", monthStartIso),
    supabase
      .from("solvio_llm_usage")
      .select("feature, total_tokens, cost_cents_estimated")
      .gte("created_at", monthStartIso),
    supabase.from("solvio_llm_usage").select("cost_cents_estimated"),
  ]);

  const monthVoiceCents = (monthRows ?? []).reduce((s, r) => s + Number(r.cost_cents ?? 0), 0);
  const monthVoiceMinutes = Math.round(
    (monthRows ?? []).reduce((s, r) => s + Number(r.duration_seconds ?? 0), 0) / 60,
  );
  const monthCallCount = monthRows?.length ?? 0;

  const allVoiceCents = (allRows ?? []).reduce((s, r) => s + Number(r.cost_cents ?? 0), 0);
  const allVoiceMinutes = Math.round(
    (allRows ?? []).reduce((s, r) => s + Number(r.duration_seconds ?? 0), 0) / 60,
  );
  const allCallCount = allRows?.length ?? 0;

  // Tier MRR estimate
  const tierCounts = new Map<string, number>();
  for (const row of tierRows ?? []) {
    const t = (row.subscription_tier as string | null)?.trim() || "trial";
    tierCounts.set(t, (tierCounts.get(t) ?? 0) + 1);
  }
  const tierBreakdown: TierCount[] = ["booking", "pro", "business", "scale", "enterprise", "trial"].map((tier) => ({
    tier,
    count: tierCounts.get(tier) ?? 0,
    price: TIER_PRICE_EUR[tier] ?? 0,
  }));
  const mrrEUR = tierBreakdown.reduce((s, t) => s + t.count * t.price, 0);

  // Bundle revenue estimate — count of all bundle calls sold × avg per-call price
  // (Real revenue lives in Stripe; this is a rough lifetime indicator).
  const totalBundleCallsSold = (bundleRows ?? []).reduce(
    (s, r) => s + Number(r.bundle_calls_purchased_total ?? 0),
    0,
  );
  // Blended avg from pricing page: 100→£1.50, 300→£1.25, 1000→£1, 5000→£0.80
  const ESTIMATED_AVG_PER_CALL_GBP = 1.0;
  const bundleRevenueGBP = totalBundleCallsSold * ESTIMATED_AVG_PER_CALL_GBP;

  // Top 5 venues by spend this month
  const venueSpend = new Map<string, { cents: number; minutes: number; calls: number }>();
  for (const row of topBizRows ?? []) {
    const bid = row.business_id as string;
    const entry = venueSpend.get(bid) ?? { cents: 0, minutes: 0, calls: 0 };
    entry.cents += Number(row.cost_cents ?? 0);
    entry.minutes += Number(row.duration_seconds ?? 0) / 60;
    entry.calls += 1;
    venueSpend.set(bid, entry);
  }
  const venueIds = [...venueSpend.entries()]
    .sort((a, b) => b[1].cents - a[1].cents)
    .slice(0, 5);
  const { data: venueNames } = venueIds.length
    ? await supabase
        .from("businesses")
        .select("id, name")
        .in("id", venueIds.map(([id]) => id))
    : { data: [] };
  const nameById = new Map((venueNames ?? []).map((b) => [b.id as string, b.name as string]));

  // OpenAI usage this month, grouped by feature
  const llmByFeature = new Map<string, { tokens: number; cents: number; calls: number }>();
  for (const row of llmMonthRows ?? []) {
    const f = (row.feature as string) ?? "other";
    const e = llmByFeature.get(f) ?? { tokens: 0, cents: 0, calls: 0 };
    e.tokens += Number(row.total_tokens ?? 0);
    e.cents += Number(row.cost_cents_estimated ?? 0);
    e.calls += 1;
    llmByFeature.set(f, e);
  }
  const monthLlmCents = (llmMonthRows ?? []).reduce((s, r) => s + Number(r.cost_cents_estimated ?? 0), 0);
  const monthLlmCalls = llmMonthRows?.length ?? 0;
  const lifetimeLlmCents = (llmAllRows ?? []).reduce((s, r) => s + Number(r.cost_cents_estimated ?? 0), 0);

  // Tier prices are already GBP; mrrEUR variable name is legacy but the value is in £.
  const mrrGBP = mrrEUR;
  const monthVoiceGBP = (monthVoiceCents / 100) * 0.79; // USD → GBP rough
  const monthLlmGBP = (monthLlmCents / 100) * 0.79;
  const grossMonthlyGBP = mrrGBP + (bundleRevenueGBP / 12); // amortise bundles over 12 mo as a soft indicator
  const netMonthlyGBP = grossMonthlyGBP - monthVoiceGBP - monthLlmGBP;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">Solvio admin</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Cost & revenue overview</h1>
        <p className="text-sm text-[#64748b]">
          Quick view of what&apos;s costing the most and rough margin. Voice-call costs come from Vapi end-of-call
          reports (LLM + TTS + STT + Vapi + Twilio bundled). Other provider bills (Stripe fees, ElevenLabs marketing
          TTS, OpenAI prompt-gen) settle on their own dashboards — links below.
        </p>
      </header>

      {/* Top-line stats this month */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#ebe7f7] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Voice cost this month</p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{fmtUSD(monthVoiceCents)}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            {monthCallCount} call{monthCallCount === 1 ? "" : "s"} · {monthVoiceMinutes} min
          </p>
        </div>
        <div className="rounded-2xl border border-[#ebe7f7] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Lifetime voice spend</p>
          <p className="mt-2 text-3xl font-semibold text-[#0f172a]">{fmtUSD(allVoiceCents)}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            {allCallCount} calls · {allVoiceMinutes} min total
          </p>
        </div>
        <div
          className={
            netMonthlyGBP >= 0
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm"
              : "rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm"
          }
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Rough net this month</p>
          <p className={`mt-2 text-3xl font-semibold ${netMonthlyGBP >= 0 ? "text-emerald-950" : "text-rose-950"}`}>
            £{netMonthlyGBP.toFixed(0)}
          </p>
          <p className="mt-1 text-xs text-[#475569]">
            Rev {fmtEUR(mrrEUR)} MRR · Voice {fmtUSD(monthVoiceCents)} · LLM {fmtUSD(monthLlmCents)}
          </p>
        </div>
      </section>

      {/* OpenAI usage */}
      <section className="rounded-2xl border border-[#ebe7f7] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-[#0f172a]">OpenAI usage this month</h2>
          <span className="text-xs text-[#64748b]">
            Total this month {fmtUSD(monthLlmCents)} · lifetime {fmtUSD(lifetimeLlmCents)} · {monthLlmCalls} calls
          </span>
        </div>
        {llmByFeature.size === 0 ? (
          <p className="mt-3 text-sm text-[#64748b]">No LLM calls logged yet this month.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              <tr>
                <th className="pb-2 text-left">Feature</th>
                <th className="pb-2 text-right">Calls</th>
                <th className="pb-2 text-right">Tokens</th>
                <th className="pb-2 text-right">Cost (est.)</th>
              </tr>
            </thead>
            <tbody>
              {[...llmByFeature.entries()]
                .sort((a, b) => b[1].cents - a[1].cents)
                .map(([feature, v]) => (
                  <tr key={feature} className="border-t border-[#f1eefc]">
                    <td className="py-2 text-[#0f172a]">{feature.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right font-mono text-[#475569]">{v.calls}</td>
                    <td className="py-2 text-right font-mono text-[#475569]">
                      {v.tokens.toLocaleString()}
                    </td>
                    <td className="py-2 text-right font-mono font-semibold text-[#0f172a]">{fmtUSD(v.cents)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Revenue breakdown */}
      <section className="rounded-2xl border border-[#ebe7f7] bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#0f172a]">Revenue (estimated MRR)</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <table className="w-full text-sm">
            <thead className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              <tr>
                <th className="pb-2 text-left">Tier</th>
                <th className="pb-2 text-right">Customers</th>
                <th className="pb-2 text-right">Price</th>
                <th className="pb-2 text-right">MRR</th>
              </tr>
            </thead>
            <tbody>
              {tierBreakdown.map((t) => (
                <tr key={t.tier} className="border-t border-[#f1eefc]">
                  <td className="py-2 capitalize text-[#0f172a]">{t.tier}</td>
                  <td className="py-2 text-right font-mono text-[#475569]">{t.count}</td>
                  <td className="py-2 text-right font-mono text-[#475569]">{t.price > 0 ? fmtEUR(t.price) : "—"}</td>
                  <td className="py-2 text-right font-mono font-semibold text-[#0f172a]">
                    {t.count > 0 && t.price > 0 ? fmtEUR(t.count * t.price) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[#ebe7f7]">
                <td className="py-2 font-semibold text-[#0f172a]" colSpan={3}>
                  Total MRR
                </td>
                <td className="py-2 text-right font-mono font-semibold text-[#0f172a]">{fmtEUR(mrrEUR)}</td>
              </tr>
            </tbody>
          </table>
          <div className="rounded-xl border border-[#ebe7f7] bg-[#fafbff] p-4 text-xs text-[#475569]">
            <p className="font-semibold text-[#0f172a]">Bundle calls (lifetime, all merchants)</p>
            <p className="mt-1">
              {totalBundleCallsSold.toLocaleString()} calls purchased · approx{" "}
              <span className="font-semibold">£{bundleRevenueGBP.toFixed(0)}</span> bundle revenue (rough blended
              average; check Stripe for exact figures).
            </p>
          </div>
        </div>
      </section>

      {/* Cost biggest spenders */}
      <section className="rounded-2xl border border-[#ebe7f7] bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#0f172a]">Top venues by voice spend this month</h2>
        {venueIds.length === 0 ? (
          <p className="mt-3 text-sm text-[#64748b]">No call costs recorded yet this month.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {venueIds.map(([id, v]) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f1eefc] bg-[#fafbff] px-4 py-3">
                <span className="font-medium text-[#0f172a]">{nameById.get(id) ?? id.slice(0, 8)}</span>
                <span className="font-mono text-[12px] text-[#64748b]">
                  {fmtUSD(v.cents)} · {Math.round(v.minutes)} min · {v.calls} call{v.calls === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Not-tracked-locally callouts */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p className="font-semibold">Things that bill outside Solvio (check each provider directly):</p>
        <ul className="mt-2 space-y-1">
          <li>
            <strong>OpenAI</strong> — prompt generation, brief extraction, Ask Solvio, call judging.
            <a className="ml-1 underline" href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">
              Usage dashboard →
            </a>
          </li>
          <li>
            <strong>ElevenLabs</strong> — homepage voice preview.
            <a className="ml-1 underline" href="https://elevenlabs.io/app/usage" target="_blank" rel="noreferrer">
              Usage →
            </a>
          </li>
          <li>
            <strong>Twilio</strong> — SMS + phone number carrying costs.
            <a className="ml-1 underline" href="https://console.twilio.com/us1/billing" target="_blank" rel="noreferrer">
              Billing →
            </a>
          </li>
          <li>
            <strong>Stripe</strong> — 1.5%+20p per booking deposit; you collect 5% on top via Connect platform fee.
            <a className="ml-1 underline" href="https://dashboard.stripe.com/dashboard" target="_blank" rel="noreferrer">
              Dashboard →
            </a>
          </li>
          <li>
            <strong>Vercel</strong> — hosting + serverless functions.
            <a className="ml-1 underline" href="https://vercel.com/mattyg1234s-projects/solvio/usage" target="_blank" rel="noreferrer">
              Usage →
            </a>
          </li>
          <li>
            <strong>Supabase</strong> — database + auth.
            <a className="ml-1 underline" href="https://supabase.com/dashboard/project/_/settings/billing" target="_blank" rel="noreferrer">
              Billing →
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
