"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, ExternalLink, Loader2, Phone, PhoneCall, PhoneOff, Plus, Trash2, Upload } from "lucide-react";

import {
  addLeadAction,
  deleteLeadAction,
  dialLeadNowAction,
  exportLeadsCSVAction,
  getLeadCallTranscriptAction,
  getVapiCallUrlAction,
  stopCallNowAction,
  uploadLeadsCsvAction,
} from "@/app/dashboard/campaigns/lead-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LeadRow = {
  id: string;
  phone: string;
  name: string | null;
  business_name: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  postcode: string | null;
  interest_level: "hot" | "warm" | "cold" | "not_interested" | null;
  contact_role: "owner" | "manager" | "employee" | "gatekeeper" | "voicemail" | "unknown" | null;
  reached_decision_maker: boolean | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  owner_best_time: string | null;
  objections: string | null;
  intake_notes: string | null;
  status: string;
  attempts: number;
  last_attempted_at: string | null;
  source: string | null;
};

type CampaignLeadsPanelProps = {
  campaignId: string;
  leads: LeadRow[];
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
    dialing: { label: "Dialing", cls: "bg-sky-50 text-sky-900 ring-sky-100" },
    completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
    failed: { label: "Failed", cls: "bg-rose-50 text-rose-800 ring-rose-100" },
    skipped: { label: "Skipped", cls: "bg-amber-50 text-amber-900 ring-amber-100" },
    do_not_call: { label: "Do not call", cls: "bg-rose-100 text-rose-900 ring-rose-200" },
  };
  const e = map[status] ?? { label: status, cls: "bg-zinc-50 text-zinc-700 ring-zinc-200" };
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1", e.cls)}>
      {e.label}
    </span>
  );
}

function interestBadge(level: LeadRow["interest_level"]) {
  if (!level) return null;
  const map: Record<NonNullable<LeadRow["interest_level"]>, { label: string; cls: string }> = {
    hot: { label: "🔥 Hot", cls: "bg-orange-50 text-orange-800 ring-orange-200" },
    warm: { label: "☀️ Warm", cls: "bg-amber-50 text-amber-800 ring-amber-100" },
    cold: { label: "🧊 Cold", cls: "bg-sky-50 text-sky-800 ring-sky-100" },
    not_interested: { label: "✗ Not interested", cls: "bg-zinc-50 text-zinc-600 ring-zinc-200" },
  };
  const e = map[level];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", e.cls)}>
      {e.label}
    </span>
  );
}

function roleBadge(l: LeadRow) {
  if (l.reached_decision_maker) {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
        ✓ Owner
      </span>
    );
  }
  if (!l.contact_role || l.contact_role === "unknown") return null;
  const map: Record<NonNullable<LeadRow["contact_role"]>, { label: string; cls: string }> = {
    owner: { label: "Owner", cls: "bg-emerald-50 text-emerald-800 ring-emerald-100" },
    manager: { label: "Manager", cls: "bg-sky-50 text-sky-800 ring-sky-100" },
    employee: { label: "Employee", cls: "bg-zinc-50 text-zinc-700 ring-zinc-200" },
    gatekeeper: { label: "Gatekeeper", cls: "bg-amber-50 text-amber-900 ring-amber-100" },
    voicemail: { label: "Voicemail", cls: "bg-zinc-50 text-zinc-600 ring-zinc-200" },
    unknown: { label: "Unknown", cls: "bg-zinc-50 text-zinc-600 ring-zinc-200" },
  };
  const e = map[l.contact_role];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", e.cls)}>
      {e.label}
    </span>
  );
}

export function CampaignLeadsPanel({ campaignId, leads }: CampaignLeadsPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Manual add
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [bizName, setBizName] = useState("");

  // CSV upload
  const [csvText, setCsvText] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  // Notes expand + per-lead loaded transcript cache
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<
    Record<
      string,
      {
        transcript: string | null;
        summary: string | null;
        outcome: string | null;
        judgeVerdict: string | null;
        judgeReasoning: string | null;
        durationSeconds: number;
        loading: boolean;
      }
    >
  >({});

  function toggleExpand(leadId: string) {
    const isOpening = expandedId !== leadId;
    setExpandedId(isOpening ? leadId : null);
    if (isOpening && !transcripts[leadId]) {
      setTranscripts((t) => ({
        ...t,
        [leadId]: { transcript: null, summary: null, outcome: null, judgeVerdict: null, judgeReasoning: null, durationSeconds: 0, loading: true },
      }));
      void getLeadCallTranscriptAction({ leadId, campaignId }).then((res) => {
        if (!res.ok) {
          setTranscripts((t) => ({
            ...t,
            [leadId]: { transcript: null, summary: null, outcome: null, judgeVerdict: null, judgeReasoning: null, durationSeconds: 0, loading: false },
          }));
          return;
        }
        setTranscripts((t) => ({
          ...t,
          [leadId]: {
            transcript: res.transcript,
            summary: res.summary,
            outcome: res.outcome,
            judgeVerdict: res.judgeVerdict,
            judgeReasoning: res.judgeReasoning,
            durationSeconds: res.durationSeconds,
            loading: false,
          },
        }));
      });
    }
  }

  function run(fn: () => Promise<void>) {
    setError(null);
    setInfo(null);
    startTransition(() => void fn().catch((e) => setError(e instanceof Error ? e.message : "Failed.")));
  }

  function handleAdd() {
    run(async () => {
      const res = await addLeadAction({ campaignId, phone, name, businessName: bizName });
      if (!res.ok) setError(res.message);
      else {
        setPhone("");
        setName("");
        setBizName("");
        setShowAdd(false);
        router.refresh();
      }
    });
  }

  function handleUpload() {
    run(async () => {
      const res = await uploadLeadsCsvAction({ campaignId, csv: csvText });
      if (!res.ok) setError(res.message);
      else {
        setInfo(`Added ${res.added} leads, skipped ${res.skipped}.`);
        setCsvText("");
        setShowUpload(false);
        router.refresh();
      }
    });
  }

  function handleDial(leadId: string) {
    run(async () => {
      const res = await dialLeadNowAction({ leadId, campaignId });
      if (!res.ok) setError(res.message);
      else {
        setInfo(`Dialing — credit source: ${res.creditSource}. Webhook will update status on call end.`);
        router.refresh();
      }
    });
  }

  function handleDelete(leadId: string) {
    run(async () => {
      await deleteLeadAction(leadId, campaignId);
      router.refresh();
    });
  }

  function handleStop(leadId: string) {
    run(async () => {
      const res = await stopCallNowAction({ leadId, campaignId });
      if (!res.ok) setError(res.message);
      else router.refresh();
    });
  }

  function handleOpenVapi(leadId: string) {
    run(async () => {
      const res = await getVapiCallUrlAction({ leadId, campaignId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      if (!res.url) {
        setError("No call yet — dial first.");
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  function handleExport() {
    run(async () => {
      const res = await exportLeadsCSVAction(campaignId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      // Trigger browser download
      const blob = new Blob([res.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const hotLeads = leads.filter((l) => l.interest_level === "hot").length;
  const warmLeads = leads.filter((l) => l.interest_level === "warm").length;
  const ownerReached = leads.filter((l) => l.reached_decision_maker === true).length;
  const ownerContactCaptured = leads.filter(
    (l) => !l.reached_decision_maker && (l.owner_name || l.owner_phone || l.owner_email),
  ).length;

  return (
    <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Leads</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Add one at a time or paste a CSV. After each call, the AI automatically captures name, email, address and
            interest level from the conversation.
          </p>
          {(hotLeads > 0 || warmLeads > 0 || ownerReached > 0 || ownerContactCaptured > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {hotLeads > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200">
                  🔥 {hotLeads} hot {hotLeads === 1 ? "lead" : "leads"}
                </span>
              )}
              {warmLeads > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-100">
                  ☀️ {warmLeads} warm {warmLeads === 1 ? "lead" : "leads"}
                </span>
              )}
              {ownerReached > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  ✓ {ownerReached} owner{ownerReached === 1 ? "" : "s"} reached
                </span>
              )}
              {ownerContactCaptured > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-100">
                  📇 {ownerContactCaptured} owner contact{ownerContactCaptured === 1 ? "" : "s"} captured
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExport}
            disabled={pending || leads.length === 0}
            className="rounded-full font-semibold"
          >
            <Download className="mr-1.5 inline h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowAdd((v) => !v);
              setShowUpload(false);
            }}
            className="rounded-full font-semibold"
          >
            <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
            Add lead
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowUpload((v) => !v);
              setShowAdd(false);
            }}
            className="rounded-full font-semibold"
          >
            <Upload className="mr-1.5 inline h-4 w-4" aria-hidden />
            Upload CSV
          </Button>
        </div>
      </div>

      {info ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{info}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p> : null}

      {showAdd ? (
        <div className="mt-5 grid gap-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] p-4 md:grid-cols-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (+447700... or 07700...)"
            className="h-10 rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact name (optional)"
            className="h-10 rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
          <div className="flex gap-2">
            <input
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              placeholder="Business (optional)"
              className="h-10 flex-1 rounded-xl border border-[#ebe7f7] bg-white px-3 text-[14px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
            <Button type="button" disabled={pending || !phone.trim()} onClick={handleAdd} className="rounded-full font-semibold">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {showUpload ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-[#f1eefc] bg-[#fafbff] p-4">
          <p className="text-xs text-[#64748b]">
            Paste a CSV — columns: phone, name, business (or just a column of phone numbers). Max 2,000 rows per upload.
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder={`phone,name,business\n+447700111222,Sarah Patel,The Riverside\n07700333444,John Lee,Lee Cafe`}
            className="w-full rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
          <Button type="button" disabled={pending || !csvText.trim()} onClick={handleUpload} className="rounded-full font-semibold">
            {pending ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-1 inline h-4 w-4" aria-hidden />}
            Upload leads
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[#f1eefc]">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Intake</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#64748b]">
                  No leads yet. Use the buttons above to add one or upload a CSV.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <>
                  <tr key={l.id} className="border-b border-[#f8fafc]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-[#0f172a]">{l.name?.trim() || "—"}</p>
                        {roleBadge(l)}
                      </div>
                      {l.business_name ? <p className="text-xs text-[#64748b]">{l.business_name}</p> : null}
                      {l.email ? <p className="text-xs text-[#5b21b6]">{l.email}</p> : null}
                      {(l.city || l.postcode) ? (
                        <p className="text-xs text-[#64748b]">
                          {[l.city, l.postcode].filter(Boolean).join(", ")}
                        </p>
                      ) : null}
                      {(l.owner_name || l.owner_phone || l.owner_email) && !l.reached_decision_maker ? (
                        <div className="mt-1.5 rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700">Owner contact (call back)</p>
                          {l.owner_name ? <p className="text-xs font-semibold text-violet-900">{l.owner_name}</p> : null}
                          {l.owner_phone ? <p className="font-mono text-[11px] text-violet-800">{l.owner_phone}</p> : null}
                          {l.owner_email ? <p className="text-[11px] text-violet-800">{l.owner_email}</p> : null}
                          {l.owner_best_time ? <p className="text-[10px] italic text-violet-700">Best time: {l.owner_best_time}</p> : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#475569]">{l.phone}</td>
                    <td className="px-4 py-3 align-middle">{interestBadge(l.interest_level)}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {l.intake_notes || l.attempts > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(l.id)}
                          className="text-left text-xs text-[#5b21b6] hover:underline line-clamp-2"
                          title={expandedId === l.id ? "Click to collapse" : "Click to expand"}
                        >
                          {l.intake_notes || "View transcript"}
                        </button>
                      ) : (
                        <span className="text-xs text-[#94a3b8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">{statusBadge(l.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {l.status === "queued" || l.status === "failed" || l.status === "completed" ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleDial(l.id)}
                            variant={l.status === "completed" ? "outline" : "default"}
                            className="h-8 rounded-full px-3 text-[11px] font-semibold"
                          >
                            {pending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <>
                                <PhoneCall className="mr-1 h-3.5 w-3.5" aria-hidden />
                                {l.status === "completed" ? "Call again" : "Dial now"}
                              </>
                            )}
                          </Button>
                        ) : null}
                        {l.status === "dialing" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={pending}
                            onClick={() => handleStop(l.id)}
                            className="h-8 rounded-full px-3 text-[11px] font-semibold"
                          >
                            {pending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            ) : (
                              <>
                                <PhoneOff className="mr-1 h-3.5 w-3.5" aria-hidden />
                                Stop
                              </>
                            )}
                          </Button>
                        ) : null}
                        {l.attempts > 0 ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleOpenVapi(l.id)}
                            className="rounded-full p-1.5 text-[#5b21b6] hover:bg-violet-50"
                            aria-label="Open live call log in Vapi"
                            title={l.status === "dialing" ? "Watch live transcript in Vapi" : "Listen to recording / view transcript in Vapi"}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        ) : null}
                        <a
                          href={`tel:${l.phone}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 rounded-full px-2 text-[#5b21b6]")}
                          title="Dial from my phone"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                        </a>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleDelete(l.id)}
                          className="rounded-full p-1.5 text-rose-700 hover:bg-rose-50"
                          aria-label="Delete lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === l.id ? (
                    <tr key={`${l.id}-notes`} className="border-b border-[#f8fafc] bg-[#fafbff]">
                      <td colSpan={6} className="px-4 pb-3 pt-0 text-xs text-[#475569]">
                        <div className="space-y-3">
                          {l.intake_notes ? (
                            <div className="rounded-xl border border-[#ebe7f7] bg-white p-3">
                              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-[#94a3b8]">
                                AI call notes
                              </p>
                              <p>{l.intake_notes}</p>
                            </div>
                          ) : null}
                          {transcripts[l.id]?.loading ? (
                            <div className="rounded-xl border border-[#ebe7f7] bg-white p-3 text-[#94a3b8]">
                              <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                              Loading transcript…
                            </div>
                          ) : null}
                          {!transcripts[l.id]?.loading && (transcripts[l.id]?.judgeVerdict || transcripts[l.id]?.outcome) ? (
                            <div
                              className={cn(
                                "rounded-xl border p-3 text-[12px]",
                                transcripts[l.id]?.judgeVerdict === "success"
                                  ? "border-emerald-100 bg-emerald-50/60 text-emerald-900"
                                  : transcripts[l.id]?.judgeVerdict === "fail"
                                    ? "border-rose-100 bg-rose-50/60 text-rose-900"
                                    : transcripts[l.id]?.judgeVerdict === "voicemail"
                                      ? "border-amber-100 bg-amber-50/60 text-amber-900"
                                      : "border-[#ebe7f7] bg-white text-[#475569]",
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
                                  Call outcome
                                </span>
                                {transcripts[l.id]?.outcome ? (
                                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-current/20">
                                    {transcripts[l.id]?.outcome}
                                  </span>
                                ) : null}
                                {transcripts[l.id]?.judgeVerdict ? (
                                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-current/20">
                                    Judge: {transcripts[l.id]?.judgeVerdict}
                                  </span>
                                ) : null}
                                <span className="text-[10px] opacity-70">
                                  {transcripts[l.id]?.durationSeconds}s
                                </span>
                              </div>
                              {transcripts[l.id]?.judgeReasoning ? (
                                <p className="mt-1.5 text-[12px] leading-relaxed">
                                  {transcripts[l.id]?.judgeReasoning}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {!transcripts[l.id]?.loading && transcripts[l.id]?.transcript ? (
                            <div className="rounded-xl border border-[#ebe7f7] bg-white p-3">
                              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#94a3b8]">
                                Full chat transcript
                              </p>
                              <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-[#0f172a]">
                                {transcripts[l.id]?.transcript}
                              </pre>
                            </div>
                          ) : null}
                          {!transcripts[l.id]?.loading &&
                          !transcripts[l.id]?.transcript &&
                          !transcripts[l.id]?.judgeVerdict &&
                          !transcripts[l.id]?.outcome &&
                          l.attempts > 0 ? (
                            <div className="rounded-xl border border-[#ebe7f7] bg-white p-3 text-[#94a3b8]">
                              No call data captured. Either the dial failed before connecting, or the webhook never fired. Open in Vapi to check directly.
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
