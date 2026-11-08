import { importLastYearPaxAction } from "@/app/dashboard/show-ops/actions-last-year";
import { SubmitOnce } from "@/components/show-ops/submit-once";

/** Admin-only upload of last year's pax per night (Joel's night tracker) for year on year. */
export function LastYearImportForm({
  imported,
  skipped,
  error,
}: {
  imported?: string;
  skipped?: string;
  error?: string;
}) {
  return (
    <div id="last-year" className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-slate-200 print:hidden">
      <h3 className="font-semibold text-slate-900">Last year&apos;s figures</h3>
      <p className="mt-1 text-xs text-slate-500">
        For year on year. Upload a CSV with one line per show night: <span className="font-mono">date, island, pax</span>{" "}
        (e.g. <span className="font-mono">07/11/2025, ACE, 82</span>). ACE / TFS / LPA or island names both work. Uploading a
        night again replaces it.
      </p>
      {imported ? (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Saved {imported} night{imported === "1" ? "" : "s"}.
          {skipped && skipped !== "0" ? ` ${skipped} line${skipped === "1" ? "" : "s"} could not be read.` : ""}
        </p>
      ) : null}
      {error ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p> : null}
      <form action={importLastYearPaxAction} className="mt-3 space-y-2 text-sm">
        <input type="file" name="file" accept=".csv,text/csv,text/plain" className="block w-full text-xs" />
        <textarea
          name="text"
          rows={3}
          placeholder={"Or paste here:\n07/11/2025, ACE, 82\n07/11/2025, TFS, 105"}
          className="block w-full rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-xs"
        />
        <SubmitOnce className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
          Save last year&apos;s figures
        </SubmitOnce>
      </form>
    </div>
  );
}
