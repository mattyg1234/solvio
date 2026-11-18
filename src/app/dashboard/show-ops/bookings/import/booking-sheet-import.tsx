"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";

import { checkBookingSheetAction, importBookingSheetAction, type SheetCheckResult, type SheetImportResult } from "./actions";

type Checked = Extract<SheetCheckResult, { ok: true }>;
type Imported = Extract<SheetImportResult, { ok: true }>;

export function BookingSheetImport() {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [imported, setImported] = useState<Imported | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function form(f: File) {
    const fd = new FormData();
    fd.set("sheet", f);
    return fd;
  }

  function choose(f: File | null | undefined) {
    if (!f) return;
    setFile(f);
    setChecked(null);
    setImported(null);
    setError(null);
    start(async () => {
      const res = await checkBookingSheetAction(form(f));
      if (!res.ok) setError(res.message);
      else setChecked(res);
    });
  }

  function add() {
    if (!file) return;
    start(async () => {
      const res = await importBookingSheetAction(form(file));
      if (!res.ok) setError(res.message);
      else { setImported(res); setChecked(null); }
    });
  }

  const good = checked?.rows.filter((r) => r.ok) ?? [];
  const bad = checked?.rows.filter((r) => !r.ok) ?? [];

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center ${dragging ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
      >
        <Upload className="h-6 w-6 text-slate-600" />
        <p className="text-sm font-semibold text-black">{pending ? "Reading…" : "Drop the filled-in sheet here, or click to choose it"}</p>
        <p className="text-xs text-slate-600">Excel (.xlsx) or CSV{file ? ` · ${file.name}` : ""}</p>
        <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {checked && (
        <div className="space-y-4">
          {checked.fileProblems.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {checked.fileProblems.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-black">
              <strong>{good.length}</strong> ready to add{bad.length ? <>, <strong className="text-red-700">{bad.length}</strong> need fixing (fix them in the sheet and drop it again, or add them by hand)</> : null}.
            </p>
            <button
              type="button"
              disabled={pending || !good.length}
              onClick={add}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? "Adding…" : `Add ${good.length} booking${good.length === 1 ? "" : "s"}`}
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr><th className="p-2">Row</th><th className="p-2">Date</th><th className="p-2">Guest</th><th className="p-2">Partner</th><th className="p-2">Show</th><th className="p-2">Pax</th><th className="p-2">Check</th></tr>
              </thead>
              <tbody>
                {[...bad, ...good].map((r) => (
                  <tr key={r.row} className="border-t border-slate-100 align-top">
                    <td className="p-2 text-slate-600">{r.row}</td>
                    <td className="p-2 whitespace-nowrap">{r.summary.show_date ?? "?"}</td>
                    <td className="p-2 font-semibold text-black">{r.summary.guest_name || "?"}</td>
                    <td className="p-2">{r.summary.partner || "?"}</td>
                    <td className="p-2">{r.summary.show || "?"}</td>
                    <td className="p-2">{r.summary.pax}</td>
                    <td className="p-2">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ready</span>
                      ) : (
                        <ul className="space-y-0.5 text-red-700">
                          {r.problems.map((p, i) => (
                            <li key={i} className="flex gap-1"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><strong>{p.column}:</strong> {p.message}</span></li>
                          ))}
                        </ul>
                      )}
                      {r.notes.length > 0 && <ul className="mt-1 text-xs text-slate-600">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {imported && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-black"><FileSpreadsheet className="h-4 w-4" /> Added {imported.added.length} booking{imported.added.length === 1 ? "" : "s"}.</p>
          {imported.added.length > 0 && (
            <ul className="text-slate-700">{imported.added.map((a) => <li key={a.row}>Row {a.row}: {a.guest} → <strong>{a.ref}</strong></li>)}</ul>
          )}
          {imported.failed.length > 0 && (
            <div>
              <p className="font-semibold text-red-700">Not added (the Hub refused these when saving):</p>
              <ul className="text-red-700">{imported.failed.map((f) => <li key={f.row}>Row {f.row}: {f.guest}: {f.message}</li>)}</ul>
            </div>
          )}
          {imported.skipped > 0 && <p className="text-slate-700">{imported.skipped} row{imported.skipped === 1 ? "" : "s"} with problems were left out.</p>}
          <p className="text-slate-600">Guest tickets were not sent. Dropping the same sheet again is safe: rows already added show as “Already in the Hub”.</p>
        </div>
      )}
    </div>
  );
}
