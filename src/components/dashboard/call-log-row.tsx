"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type CallLogRowProps = {
  id: string;
  whenLabel: string;
  callerName: string | null;
  callerPhone: string | null;
  durationLabel: string;
  costLabel: string;
  outcomeBadge: React.ReactNode;
  summary: string | null;
  rawTranscript: string | null;
  venueName: string;
};

export function CallLogRow(props: CallLogRowProps) {
  const [open, setOpen] = useState(false);
  const hasTranscript = Boolean(props.rawTranscript?.trim());

  return (
    <>
      <tr
        className={cn(
          "border-b border-[#f8fafc] transition hover:bg-[#fafbff]",
          hasTranscript ? "cursor-pointer" : "",
        )}
        onClick={() => hasTranscript && setOpen((v) => !v)}
      >
        <td className="px-4 py-3 align-top text-[#475569]">
          <div className="flex items-center gap-2">
            {hasTranscript ? (
              open ? (
                <ChevronDown className="h-3.5 w-3.5 text-[#7c3aed]" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-[#94a3b8]" aria-hidden />
              )
            ) : (
              <span className="h-3.5 w-3.5" />
            )}
            <p className="font-medium text-[#0f172a]">{props.whenLabel}</p>
          </div>
        </td>
        <td className="px-4 py-3 align-top">
          {props.callerName?.trim() ? (
            <p className="font-medium text-[#0f172a]">{props.callerName}</p>
          ) : null}
          {props.callerPhone?.trim() ? (
            <p className="font-mono text-[12px] text-[#64748b]">{props.callerPhone}</p>
          ) : (
            <p className="text-[11px] text-[#94a3b8]">Unknown caller</p>
          )}
        </td>
        <td className="px-4 py-3 align-top font-mono text-[12px] text-[#475569]">{props.durationLabel}</td>
        <td className="px-4 py-3 align-top text-right font-mono text-[12px] text-[#475569]">{props.costLabel}</td>
        <td className="px-4 py-3 align-top">{props.outcomeBadge}</td>
        <td className="max-w-[320px] px-4 py-3 align-top text-[#475569]">
          <p className="line-clamp-2 text-[13px]">{props.summary || "—"}</p>
        </td>
        <td className="px-4 py-3 align-top text-xs text-[#64748b]">{props.venueName}</td>
      </tr>
      {open && hasTranscript ? (
        <tr className="border-b border-[#f1eefc] bg-[#faf7ff]/60">
          <td colSpan={7} className="px-6 py-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Full transcript
            </p>
            <pre className="max-h-[400px] overflow-auto whitespace-pre-wrap rounded-xl border border-[#ebe7f7] bg-white px-4 py-3 font-mono text-[12px] leading-relaxed text-[#0f172a]">
{props.rawTranscript}
            </pre>
          </td>
        </tr>
      ) : null}
    </>
  );
}
