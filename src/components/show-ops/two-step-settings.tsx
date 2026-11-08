"use client";

import { useCallback, useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string | null; status: string; created_at: string };

/**
 * Settings → Two-step login (Joel, 8 Nov 2026). Each person switches it on for
 * their own login: scan the QR with an authenticator app, type the code once.
 * From then on the Hub asks for a code after the password.
 */
export function TwoStepSettings({ onDone, required = false }: { onDone?: () => void; required?: boolean } = {}) {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(((data?.all ?? []) as Factor[]).filter((f) => f.status === "verified"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Clear half-finished attempts so a new QR can be made.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of (list?.all ?? []) as Factor[]) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Hub ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) throw error ?? new Error("No QR");
      setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setMsg({ ok: false, text: "Could not start. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrol) return;
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: code.trim() });
      if (error) {
        setMsg({ ok: false, text: "That code didn't work. Try the newest code from the app." });
        return;
      }
      setEnrol(null);
      setCode("");
      setMsg({ ok: true, text: "Two-step login is on. Next time you sign in, the Hub will ask for a code." });
      if (onDone) {
        onDone();
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(id: string) {
    if (!confirm_("Turn off two-step login for your account?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) {
        setMsg({ ok: false, text: "Could not turn it off. Sign out and back in with your code, then try again." });
        return;
      }
      setMsg({ ok: true, text: "Two-step login is off." });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const on = Boolean(factors?.length);
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p>
        Status:{" "}
        {factors == null ? (
          <span className="text-slate-400">checking…</span>
        ) : on ? (
          <span className="font-semibold text-emerald-700">On</span>
        ) : (
          <span className="font-semibold text-slate-700">Off</span>
        )}
      </p>
      {msg ? <p className={msg.ok ? "text-emerald-700" : "text-rose-700"}>{msg.text}</p> : null}

      {on && !required
        ? factors!.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={busy}
              onClick={() => turnOff(f.id)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 disabled:opacity-60"
            >
              Turn off two-step login
            </button>
          ))
        : null}

      {!on && !enrol ? (
        <button
          type="button"
          disabled={busy || factors == null}
          onClick={start}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Turn on two-step login
        </button>
      ) : null}

      {enrol ? (
        <form onSubmit={confirm} className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p>1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns the QR as an SVG data URL */}
          <img src={enrol.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg bg-white p-2 ring-1 ring-slate-200" />
          <p className="text-xs text-slate-500">
            Can&apos;t scan? Type this key instead: <span className="select-all font-mono">{enrol.secret}</span>
          </p>
          <p>2. Type the 6-digit code the app shows.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            aria-label="6-digit code"
            className="block w-40 rounded-lg border border-slate-300 px-3 py-2 text-center font-mono text-lg tracking-[0.3em]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Confirm and turn on
            </button>
            <button type="button" onClick={() => setEnrol(null)} className="rounded-xl px-4 py-2 text-sm text-slate-600">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function confirm_(text: string) {
  return typeof window === "undefined" ? false : window.confirm(text);
}
