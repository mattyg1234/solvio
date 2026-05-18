"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { MarketingSiteVoice } from "@/components/home/marketing-site-voice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlatformCapabilityKey } from "@/lib/platform-capabilities";
import { cn } from "@/lib/utils";

import {
  completePlatformOnboarding,
  saveOnboardingBusinessProfile,
  saveOnboardingCapabilities,
} from "./actions";

export type MerchantProfileDraft = {
  phone?: string;
  address?: string;
  social?: string;
};

type PlatformOnboardingWizardProps = {
  businessId: string;
  initialName: string;
  initialTimeZone: string;
  initialLogoUrl: string | null;
  initialWebsiteUrl: string | null;
  merchantProfile: MerchantProfileDraft;
};

const STEP_LABELS = [
  "Business profile",
  "Booking setup",
  "AI receptionist",
  "Payments",
  "Go live",
] as const;

const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Madrid",
  "Atlantic/Canary",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

const CAP_DEFS: { key: PlatformCapabilityKey; label: string; hint: string }[] = [
  { key: "appointments", label: "Appointments", hint: "Salons, consultations, hourly slots." },
  { key: "events", label: "Events", hint: "Named nights, tickets, capacity." },
  { key: "tables", label: "Table bookings", hint: "Restaurants — floor layouts & reservations." },
  { key: "ai_receptionist", label: "AI receptionist", hint: "Voice persona + scripted coverage." },
  { key: "lead_generation", label: "Lead generation", hint: "Inbound requests & outbound prospect lists." },
];

export function PlatformOnboardingWizard(props: PlatformOnboardingWizardProps) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(props.initialName);
  const [timeZone, setTimeZone] = useState(props.initialTimeZone || "UTC");
  const [logoUrl, setLogoUrl] = useState(props.initialLogoUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(props.initialWebsiteUrl ?? "");
  const [phone, setPhone] = useState(props.merchantProfile.phone ?? "");
  const [address, setAddress] = useState(props.merchantProfile.address ?? "");
  const [social, setSocial] = useState(props.merchantProfile.social ?? "");

  const [caps, setCaps] = useState<Record<PlatformCapabilityKey, boolean>>({
    appointments: true,
    events: true,
    tables: true,
    ai_receptionist: true,
    lead_generation: false,
  });

  const persona = useMemo(
    () => [
      { id: "friendly", label: "Friendly", copy: "Warm, concise confirmations." },
      { id: "professional", label: "Professional", copy: "Direct, credible, polished." },
      { id: "luxury", label: "Luxury", copy: "Concierge pacing and elevated wording." },
      { id: "energetic", label: "Energetic", copy: "Upbeat pacing for nightlife & events." },
      { id: "sales", label: "Sales-focused", copy: "Suggestive upsells with guardrails." },
    ],
    [],
  );
  const [personaSel, setPersonaSel] = useState<string>("friendly");

  const aiBrief =
    caps.tables && caps.appointments
      ? `Our AI books restaurant tables AND ${name || "your business"} salon-style appointments — it captures allergens and confirms deposits.`
      : caps.tables
        ? `${name ? `${name}'s ` : ""}AI books tables, checks capacity, captures seating notes and deposits before service.`
        : caps.appointments
          ? `${name ? `${name}'s ` : ""}AI gathers availability windows, durations, addresses and sends confirmations automatically.`
          : `${name ? `${name}'s ` : ""}AI collects leads, qualifies urgency and pings your team inbox.`;

  async function persistProfileAdvance() {
    const picked = [...TIMEZONES].includes(timeZone as (typeof TIMEZONES)[number]) ? timeZone : "UTC";
    const fd = new FormData();
    fd.append("business_id", props.businessId);
    fd.append("name", name.trim());
    fd.append("time_zone", picked);
    fd.append("logo_url", logoUrl.trim());
    fd.append("website_url", websiteUrl.trim());
    fd.append("merchant_phone", phone.trim());
    fd.append("merchant_address", address.trim());
    fd.append("merchant_social", social.trim());
    const res = await saveOnboardingBusinessProfile(fd);
    if (!res.ok) throw new Error(res.message);
    const anyBooking = caps.appointments || caps.events || caps.tables;
    if (!anyBooking) {
      setErr("Pick at least one booking mode — appointments, events, or tables.");
      return;
    }
    const aiRes = await saveOnboardingCapabilities(caps);
    if (!aiRes.ok) throw new Error(aiRes.message);
    setStepIdx(1);
  }

  async function finishLaunch() {
    const aiRes = await saveOnboardingCapabilities(caps);
    if (!aiRes.ok) throw new Error(aiRes.message);
    const done = await completePlatformOnboarding();
    if (!done.ok) throw new Error(done.message);
    router.replace("/dashboard");
    router.refresh();
  }

  const progressPct = Math.round(((stepIdx + 1) / STEP_LABELS.length) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2 text-center md:text-left">
        <Badge className="rounded-full bg-[#ede9fe] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5b21b6] hover:bg-[#ede9fe]">
          Guided setup
        </Badge>
        <h2 className="text-[clamp(1.65rem,3.5vw,2.35rem)] font-semibold tracking-tight text-[#0f172a]">
          Let&apos;s set up your business
        </h2>
        <p className="text-[15px] leading-relaxed text-[#64748b]">
          We reveal the full dashboard only after this short path — tuned to what you actually run day to day.
        </p>
      </div>

      <div aria-hidden className="space-y-2">
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
          {STEP_LABELS.map((label, idx) => (
            <span
              key={label}
              className={cn(
                "rounded-full px-3 py-1 ring-1",
                idx <= stepIdx ? "bg-[#f5f3ff] text-[#5b21b6] ring-[#ebe7f7]" : "bg-transparent text-[#94a3b8] ring-[#ebe7f7]",
              )}
            >
              {idx + 1}. {label}
            </span>
          ))}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#f1eefc]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7c3aed] to-[#a78bfa] transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {err ? (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{err}</p>
      ) : null}

      {stepIdx === 0 ? (
        <Card className="rounded-[24px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-[#0f172a]">Business profile & modules</CardTitle>
            <CardDescription className="text-[14px] leading-relaxed">
              Basics first — then tick what applies. Only those areas surface in your sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pb-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="onb-name">
                Business name
                <input
                  id="onb-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none ring-[#a78bfa]/35 transition focus:border-[#c4b5fd] focus:ring-4"
                  autoComplete="organization"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="onb-tz">
                Time zone
                <select
                  id="onb-tz"
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-white px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="onb-logo">
                Logo URL{" "}
                <span className="font-normal text-[#94a3b8]">(optional)</span>
                <input
                  id="onb-logo"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="onb-www">
                Website{" "}
                <span className="font-normal text-[#94a3b8]">(optional)</span>
                <input
                  id="onb-www"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://…"
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="onb-phone">
                Phone number
                <input
                  id="onb-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a] sm:col-span-2" htmlFor="onb-addr">
                Address
                <input
                  id="onb-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                />
              </label>
              <label className="space-y-2 text-sm font-semibold text-[#0f172a] sm:col-span-2" htmlFor="onb-soc">
                Social & links{" "}
                <span className="font-normal text-[#94a3b8]">(one per line is fine)</span>
                <textarea
                  id="onb-soc"
                  value={social}
                  onChange={(e) => setSocial(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-4 focus:ring-[#7c3aed]/25"
                />
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff]/80 px-4 py-4">
              <p className="text-sm font-semibold text-[#0f172a]">What does your business need?</p>
              <p className="text-xs leading-relaxed text-[#64748b]">You can tighten this anytime from Settings.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CAP_DEFS.map((c) => (
                  <label
                    key={c.key}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border border-[#ebe7f7] bg-white px-3 py-3 text-sm shadow-sm transition-colors has-[:checked]:border-[#a78bfa] has-[:checked]:bg-[#f5f3ff]",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold text-[#0f172a]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[#cbd5f5] text-[#7c3aed]"
                        checked={caps[c.key]}
                        onChange={() => setCaps((prev) => ({ ...prev, [c.key]: !prev[c.key] }))}
                      />
                      {c.label}
                    </span>
                    <span className="pl-6 text-[13px] text-[#64748b]">{c.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                className="h-11 rounded-full px-7 text-base font-semibold shadow-lg shadow-[#7c3aed]/25"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  startTransition(() => {
                    void persistProfileAdvance().catch((e: unknown) => {
                      setErr(e instanceof Error ? e.message : "Could not save.");
                    });
                  });
                }}
              >
                Continue
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stepIdx === 1 ? (
        <Card className="rounded-[24px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-[#0f172a]">Booking setup</CardTitle>
            <CardDescription>
              Wire hours, layouts and guest modes in one hub — progressive, not noisy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            <ul className="space-y-3 text-[15px] leading-relaxed text-[#475569]">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                Appointment grids, events, and tables all live beside your inbound inbox — nothing hidden.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                Toggle only the modules you turned on ({CAP_DEFS.filter((c) => caps[c.key]).map((c) => c.label).join(", ")
                  || "—"}).
              </li>
            </ul>
            <Link
              href="/dashboard/bookings"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#ebe7f7] px-6 text-sm font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
            >
              Open bookings workspace (new tab)
            </Link>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => setStepIdx(0)}>
                Back
              </Button>
              <Button type="button" className="h-11 rounded-full px-8 font-semibold shadow-lg shadow-[#7c3aed]/25" onClick={() => setStepIdx(2)}>
                Continue in wizard
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stepIdx === 2 ? (
        <Card className="rounded-[24px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-[#0f172a]">Build your AI employee</CardTitle>
            <CardDescription>Pick vibe + sanity-check the prompt before real telephony ships.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pb-8">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {persona.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersonaSel(p.id)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    personaSel === p.id
                      ? "border-[#a78bfa] bg-[#f5f3ff]"
                      : "border-[#ebe7f7] bg-[#fafbff] hover:bg-white",
                  )}
                >
                  <p className="text-sm font-semibold text-[#0f172a]">{p.label}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#64748b]">{p.copy}</p>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">AI brief (auto)</p>
              <p className="text-[15px] leading-relaxed text-[#0f172a]">{aiBrief}</p>
              <p className="text-[13px] text-[#64748b]">
                Persona:&nbsp;
                <span className="font-semibold capitalize text-[#5b21b6]">{personaSel}</span>. Escalates unknowns back to inbox.
              </p>
              <Link href="/dashboard/setup/voice" className="text-sm font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
                Open full receptionist composer →
              </Link>
            </div>

            {caps.ai_receptionist ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#0f172a]">Test your receptionist preview</p>
                <MarketingSiteVoice surface="onboarding" heroAutoPlay={false} />
              </div>
            ) : (
              <p className="text-sm text-[#64748b]">
                Toggle &quot;AI receptionist&quot; in step&nbsp;1 to unlock previews and Calls surfaces.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => setStepIdx(1)}>
                Back
              </Button>
              <Button type="button" className="h-11 rounded-full px-8 font-semibold shadow-lg shadow-[#7c3aed]/25" onClick={() => setStepIdx(3)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stepIdx === 3 ? (
        <Card className="rounded-[24px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-[#0f172a]">Payments</CardTitle>
            <CardDescription>Stripe routes deposits into your merchant account once connected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            <p className="text-[15px] leading-relaxed text-[#64748b]">
              Apple&nbsp;Pay & Google&nbsp;Pay ride on standard Stripe Checkout when you flip it on inside the Payments page.
              Deposits and cancellation penalties stay optional — switch them live without another migration.
            </p>
            <Link
              href="/dashboard/payments"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[#ebe7f7] px-6 text-sm font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
            >
              Open payments workspace (new tab)
            </Link>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => setStepIdx(2)}>
                Back
              </Button>
              <Button type="button" className="h-11 rounded-full px-8 font-semibold shadow-lg shadow-[#7c3aed]/25" onClick={() => setStepIdx(4)}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {stepIdx === 4 ? (
        <Card className="rounded-[24px] border border-[#ebe7f7] bg-white shadow-sm">
          <CardHeader className="space-y-1 text-center md:text-center">
            <CardTitle className="text-2xl text-[#0f172a]">Your AI business system is ready</CardTitle>
            <CardDescription>Ship the essentials now — deepen automations anytime.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pb-8">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/dashboard/bookings"
                className="flex flex-col rounded-2xl border border-[#ebe7f7] bg-[#fafbff] p-5 text-[15px] font-semibold text-[#0f172a] transition hover:bg-white hover:shadow-sm"
              >
                View bookings hub →
              </Link>
              <Link
                href="/dashboard/setup/voice"
                className="flex flex-col rounded-2xl border border-[#ebe7f7] bg-[#fafbff] p-5 text-[15px] font-semibold text-[#0f172a] transition hover:bg-white hover:shadow-sm"
              >
                Open AI receptionist →
              </Link>
              <Link
                href="/dashboard/calls"
                className={cn(
                  "flex flex-col rounded-2xl border border-[#ebe7f7] bg-[#fafbff] p-5 text-[15px] font-semibold text-[#0f172a] transition hover:bg-white hover:shadow-sm",
                  !caps.ai_receptionist && "opacity-50 pointer-events-none",
                )}
                aria-disabled={!caps.ai_receptionist}
              >
                Calls lab →
              </Link>
              <Link
                href="/dashboard"
                className="flex flex-col rounded-2xl border border-[#a78bfa]/40 bg-gradient-to-br from-[#faf5ff] to-white p-5 text-[15px] font-semibold text-[#5b21b6] hover:shadow-sm"
              >
                Open dashboard home →
              </Link>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full font-semibold" onClick={() => setStepIdx(3)}>
                Back
              </Button>
              <Button
                type="button"
                className="h-11 rounded-full px-10 text-base font-semibold shadow-xl shadow-[#7c3aed]/35"
                disabled={pending}
                onClick={() => {
                  setErr(null);
                  startTransition(() => {
                    void finishLaunch().catch((e: unknown) => setErr(e instanceof Error ? e.message : "Finish failed."));
                  });
                }}
              >
                Go live inside dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
