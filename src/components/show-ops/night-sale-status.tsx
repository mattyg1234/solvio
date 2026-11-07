import { toggleNightSaleStatusAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "@/components/show-ops/submit-once";
import {
  SALE_STATUS_FIELDS,
  SALE_STATUS_HINT,
  SALE_STATUS_LABEL,
  saleStatusStamp,
  type NightSaleStatus,
} from "@/lib/show-ops/sale-status";

/**
 * Transport / Partial stop sale / Full stop sale for one show night on one island
 * (Joel, 6 Nov 2026 — replaces the RES HAND OVER FORM email). A cross means
 * closed / done; blank means nothing done yet. Tapping a line flips it.
 */
export function NightSaleStatusMarks({
  date,
  island,
  status,
  next,
  editable,
  compact = false,
}: {
  date: string;
  island: string;
  status: NightSaleStatus | null | undefined;
  next: string;
  editable: boolean;
  compact?: boolean;
}) {
  const stamp = saleStatusStamp(status);
  const size = compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return (
    <div className={compact ? "space-y-0.5" : "space-y-1"}>
      <div className="flex flex-wrap gap-1">
        {SALE_STATUS_FIELDS.map((f) => {
          const on = Boolean(status?.[f]);
          const label = `${on ? "✕ " : ""}${SALE_STATUS_LABEL[f]}`;
          const cls = `rounded-md font-semibold ring-1 ${size} ${
            on ? "bg-rose-600 text-white ring-rose-600" : "bg-white text-slate-500 ring-slate-200"
          }`;
          if (!editable) {
            return (
              <span key={f} className={cls} title={SALE_STATUS_HINT[f]}>
                {label}
              </span>
            );
          }
          return (
            <form key={f} action={toggleNightSaleStatusAction} title={`${SALE_STATUS_HINT[f]} — tap to ${on ? "clear" : "cross"}`}>
              <input type="hidden" name="show_date" value={date} />
              <input type="hidden" name="island" value={island} />
              <input type="hidden" name="field" value={f} />
              <input type="hidden" name="next" value={next} />
              <SubmitOnce className={`${cls} hover:ring-rose-400 disabled:opacity-60`}>{label}</SubmitOnce>
            </form>
          );
        })}
      </div>
      {stamp && !compact ? <p className="text-[11px] text-slate-500">Last changed by {stamp}</p> : null}
    </div>
  );
}

/** The key under the Outlook / calendar so everyone reads a cross the same way. */
export function NightSaleStatusKey() {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      <span className="font-semibold text-slate-700">✕ = closed / done, blank = nothing done yet.</span>{" "}
      {SALE_STATUS_FIELDS.map((f, i) => (
        <span key={f}>
          {i ? " · " : ""}
          <span className="font-medium text-slate-700">{SALE_STATUS_LABEL[f]}</span>: {SALE_STATUS_HINT[f]}
        </span>
      ))}
    </p>
  );
}
