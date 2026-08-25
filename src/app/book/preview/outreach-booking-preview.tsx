"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, Scissors, UtensilsCrossed } from "lucide-react";

import {
  outreachPreviewCopy,
  outreachPreviewWhatsAppFinishMessage,
  type OutreachPreviewLang,
  type OutreachPreviewMode,
} from "@/lib/outreach-booking-preview-copy";
import { cn } from "@/lib/utils";

const PARTY_SIZES = [2, 3, 4, 5, 6, 7, 8];

type Props = {
  lang: OutreachPreviewLang;
  mode: OutreachPreviewMode;
  businessName: string;
  whatsappDigits: string | null;
  logoUrl: string | null;
};

function FormSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-[#ebe7f7] bg-white px-4 py-4 md:px-5 md:py-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ede9fe] text-sm font-bold text-[#5b21b6]">
          {step}
        </span>
        <h2 className="text-[15px] font-semibold text-[#0f172a]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ymdToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildFakeSlots(dateYmd: string, tableMode: boolean): { value: string; label: string; booked: boolean }[] {
  const seed = dateYmd.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const slots: { value: string; label: string; booked: boolean }[] = [];
  const hours = tableMode
    ? [12, 13, 14, 18, 19, 20, 21, 22]
    : Array.from({ length: 10 }, (_, i) => i + 10);
  for (const h of hours) {
    for (const m of tableMode ? [0, 30] : [0, 30]) {
      if (!tableMode && h === 19 && m === 30) continue;
      const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const booked = (seed + h * 3 + m) % 7 === 0;
      slots.push({ value: `${dateYmd}T${label}`, label, booked });
    }
  }
  return slots;
}

export function OutreachBookingPreview({
  lang,
  mode = "table",
  businessName,
  whatsappDigits,
  logoUrl,
}: Props) {
  const isTable = mode !== "appointment";
  const copy = outreachPreviewCopy(lang, businessName, mode);
  const [serviceId, setServiceId] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [dateYmd, setDateYmd] = useState("");
  const [slotValue, setSlotValue] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<"form" | "submitting" | "done">("form");

  const service = copy.defaultServices.find((s) => s.id === serviceId);
  const slots = useMemo(() => (dateYmd ? buildFakeSlots(dateYmd, isTable) : []), [dateYmd, isTable]);

  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const today = ymdToday();
  const monthPrefix = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-`;
  const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
  const firstDow = new Date(cursor.year, cursor.month - 1, 1).getDay();

  const readyForDetails = isTable
    ? Boolean(partySize && dateYmd && slotValue)
    : Boolean(serviceId && dateYmd && slotValue);

  const canSubmit =
    readyForDetails && name.trim().length >= 2 && email.includes("@") && phone.trim().length >= 6;

  const whatsappFinishHref = useMemo(() => {
    if (!whatsappDigits) return null;
    const text = outreachPreviewWhatsAppFinishMessage(lang, businessName, mode);
    return `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(text)}`;
  }, [whatsappDigits, lang, businessName, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPhase("submitting");
    await new Promise((r) => setTimeout(r, 1400));
    setPhase("done");
  }

  if (phase === "submitting") {
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-[#ebe7f7] bg-white p-8 text-center md:p-10">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#7c3aed]" aria-hidden />
        <h2 className="mt-6 text-xl font-semibold text-[#0f172a]">{copy.submitting}</h2>
      </div>
    );
  }

  if (phase === "done") {
    const slot = slots.find((s) => s.value === slotValue);
    return (
      <div className="mx-auto max-w-lg rounded-[28px] border border-[#ebe7f7] bg-white p-8 text-center shadow-[0_28px_90px_-58px_rgba(124,58,237,0.28)] md:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ecfdf5] text-emerald-600 ring-1 ring-emerald-100">
          <CalendarCheck className="h-8 w-8" aria-hidden />
        </span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight text-[#0f172a]">{copy.successTitle}</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-[#64748b]">{copy.successBody(businessName)}</p>
        {slot ? (
          <p className="mt-4 rounded-xl bg-[#f8fafc] px-4 py-3 text-sm text-[#475569]">
            {isTable
              ? `${lang === "es" ? "Mesa para" : "Table for"} ${partySize} · ${dateYmd} · ${slot.label}`
              : service
                ? `${service.name} · ${dateYmd} · ${slot.label}`
                : `${dateYmd} · ${slot.label}`}
          </p>
        ) : null}
        <p className="mt-4 text-[14px] text-[#64748b]">
          {whatsappFinishHref ? copy.successNote : copy.successNoteNoChannel}
        </p>
        {whatsappFinishHref ? (
          <a
            href={whatsappFinishHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#25D366] px-5 text-[15px] font-semibold text-white shadow-md transition hover:bg-[#1da851]"
          >
            {copy.whatsappCta}
          </a>
        ) : null}
        <p className="mt-8 text-center text-sm text-[#94a3b8]">
          {copy.poweredBy}{" "}
          <Link href="/" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
            Solvio
          </Link>
        </p>
      </div>
    );
  }

  let step = 1;
  const HeaderIcon = isTable ? UtensilsCrossed : Scissors;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
      <header className="mb-2 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto mb-4 h-14 w-auto max-w-[200px] object-contain" />
        ) : (
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ede9fe] text-[#7c3aed]">
            <HeaderIcon className="h-6 w-6" aria-hidden />
          </span>
        )}
        <h1 className="text-xl font-semibold tracking-tight text-[#0f172a]">{businessName}</h1>
        <p className="mt-1 text-[15px] text-[#64748b]">{copy.heading}</p>
        <p className="mt-1 text-[13px] text-[#94a3b8]">{copy.hint}</p>
      </header>

      {isTable ? (
        <FormSection step={step++} title={copy.stepParty}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {PARTY_SIZES.map((n) => {
              const selected = partySize === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPartySize(String(n));
                    setSlotValue("");
                  }}
                  className={cn(
                    "min-h-[44px] rounded-xl border-2 text-[15px] font-semibold tabular-nums transition",
                    selected
                      ? "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6] ring-2 ring-[#ddd6fe]/60"
                      : "border-[#ebe7f7] bg-white text-[#334155] hover:border-[#c4b5fd]",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[#94a3b8]">{copy.pickParty}</p>
        </FormSection>
      ) : (
        <FormSection step={step++} title={copy.stepService}>
          <div className="grid gap-2">
            {copy.defaultServices.map((s) => {
              const selected = serviceId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setServiceId(s.id);
                    setSlotValue("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition",
                    selected
                      ? "border-[#7c3aed] bg-[#f5f3ff] ring-2 ring-[#ddd6fe]/60"
                      : "border-[#ebe7f7] bg-white hover:border-[#c4b5fd]",
                  )}
                >
                  <span>
                    <span className="block text-[15px] font-semibold text-[#0f172a]">{s.name}</span>
                    <span className="text-[12px] text-[#64748b]">
                      {s.durationLabel ?? copy.durationMin(s.duration)}
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold text-[#5b21b6]">{s.priceLabel}</span>
                </button>
              );
            })}
          </div>
          {!serviceId ? <p className="text-[12px] text-[#94a3b8]">{copy.pickService}</p> : null}
        </FormSection>
      )}

      {(isTable ? partySize : serviceId) ? (
        <FormSection step={step++} title={copy.stepDate}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="rounded-lg p-2 text-[#64748b] hover:bg-[#f1f5f9]"
              aria-label="Previous month"
              onClick={() =>
                setCursor((c) => {
                  if (c.month === 1) return { year: c.year - 1, month: 12 };
                  return { ...c, month: c.month - 1 };
                })
              }
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-[#0f172a]">
              {new Date(cursor.year, cursor.month - 1).toLocaleString(lang === "es" ? "es-ES" : "en-GB", {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              className="rounded-lg p-2 text-[#64748b] hover:bg-[#f1f5f9]"
              aria-label="Next month"
              onClick={() =>
                setCursor((c) => {
                  if (c.month === 12) return { year: c.year + 1, month: 1 };
                  return { ...c, month: c.month + 1 };
                })
              }
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[#94a3b8]">
            {(lang === "es" ? ["D", "L", "M", "X", "J", "V", "S"] : ["S", "M", "T", "W", "T", "F", "S"]).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDow }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dom = i + 1;
              const ymd = `${monthPrefix}${String(dom).padStart(2, "0")}`;
              const isPast = ymd < today;
              const isSun = new Date(cursor.year, cursor.month - 1, dom).getDay() === 0;
              const disabled = isPast || isSun;
              const selected = dateYmd === ymd;
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setDateYmd(ymd);
                    setSlotValue("");
                  }}
                  className={cn(
                    "min-h-[40px] rounded-lg text-[13px] font-semibold tabular-nums transition",
                    disabled && "cursor-not-allowed text-[#cbd5e1]",
                    !disabled && selected && "bg-[#7c3aed] text-white shadow-md",
                    !disabled && !selected && "text-[#334155] hover:bg-[#f5f3ff]",
                  )}
                >
                  {dom}
                </button>
              );
            })}
          </div>
          {!dateYmd ? <p className="text-[12px] text-[#94a3b8]">{copy.pickDate}</p> : null}
        </FormSection>
      ) : null}

      {(isTable ? partySize && dateYmd : serviceId && dateYmd) ? (
        <FormSection step={step++} title={copy.stepTime}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="listbox" aria-label={copy.stepTime}>
            {slots.map((slot) => {
              const disabled = slot.booked;
              const selected = slotValue === slot.value;
              return (
                <button
                  key={slot.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => setSlotValue(slot.value)}
                  className={cn(
                    "min-h-[44px] rounded-xl border-2 px-2 py-2.5 text-[12px] font-semibold tabular-nums sm:text-[13px]",
                    disabled &&
                      "cursor-not-allowed border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8] line-through decoration-rose-400/90 decoration-2",
                    !disabled &&
                      selected &&
                      "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6] shadow-md ring-2 ring-[#ddd6fe]/60",
                    !disabled &&
                      !selected &&
                      "border-[#dcd6fc] bg-white text-[#475569] hover:border-[#a78bfa]",
                  )}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-4 text-[11px] text-[#64748b]">
            <span>{copy.slotAvailable}</span>
            <span>{copy.slotBooked}</span>
          </div>
          {!slotValue ? <p className="text-[12px] text-[#94a3b8]">{copy.pickTime}</p> : null}
        </FormSection>
      ) : null}

      {readyForDetails ? (
        <FormSection step={step++} title={copy.stepDetails}>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-[#475569]">{copy.labelName}</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-[15px] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ddd6fe]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-[#475569]">{copy.labelEmail}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-[15px] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ddd6fe]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-[#475569]">{copy.labelPhone}</span>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={lang === "es" ? "600 000 000" : "7700 900123"}
              className="w-full rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-[15px] outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-[#ddd6fe]"
            />
          </label>
        </FormSection>
      ) : null}

      {canSubmit ? (
        <button
          type="submit"
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#7c3aed] text-[15px] font-semibold text-white shadow-lg shadow-[#7c3aed]/25 transition hover:bg-[#6d28d9] active:scale-[0.99]"
        >
          {copy.submit}
        </button>
      ) : null}

      <p className="text-center text-sm text-[#94a3b8]">
        {copy.poweredBy}{" "}
        <Link href="/" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
          Solvio
        </Link>
      </p>
    </form>
  );
}
