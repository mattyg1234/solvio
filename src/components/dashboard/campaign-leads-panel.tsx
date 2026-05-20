"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Phone, PhoneCall, Plus, Trash2, Upload } from "lucide-react";

import {
  addLeadAction,
  deleteLeadAction,
  dialLeadNowAction,
  uploadLeadsCsvAction,
} from "@/app/dashboard/campaigns/lead-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LeadRow = {
  id: string;
  phone: string;
  name: string | null;
  business_name: string | null;
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

  return (
    <section className="rounded-[24px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Leads</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Add one at a time or paste a CSV (columns: phone, name, business). UK numbers starting with 07… auto-convert
            to +44.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            Paste a CSV — first row can be header (phone, name, business) or just data. Max 2,000 rows per upload.
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder={`phone,name,business
+447700111222,Sarah Patel,The Riverside
07700333444,John Lee,Lee Cafe`}
            className="w-full rounded-xl border border-[#ebe7f7] bg-white px-3 py-2 font-mono text-[12px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
          <Button type="button" disabled={pending || !csvText.trim()} onClick={handleUpload} className="rounded-full font-semibold">
            {pending ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-1 inline h-4 w-4" aria-hidden />}
            Upload leads
          </Button>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[#f1eefc]">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[#64748b]">
                  No leads yet. Use the buttons above to add one or upload a CSV.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="border-b border-[#f8fafc]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#0f172a]">{l.name?.trim() || "—"}</p>
                    {l.business_name ? <p className="text-xs text-[#64748b]">{l.business_name}</p> : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-[#475569]">{l.phone}</td>
                  <td className="px-4 py-3 align-middle">{statusBadge(l.status)}</td>
                  <td className="px-4 py-3 text-[#475569]">{l.attempts}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {l.status === "queued" || l.status === "failed" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => handleDial(l.id)}
                          className="h-8 rounded-full px-3 text-[11px] font-semibold"
                        >
                          {pending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <>
                              <PhoneCall className="mr-1 h-3.5 w-3.5" aria-hidden />
                              Dial now
                            </>
                          )}
                        </Button>
                      ) : null}
                      <a
                        href={`tel:${l.phone}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 rounded-full px-2 text-[#5b21b6]")}
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
