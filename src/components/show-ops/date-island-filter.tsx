"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  basePath: string;
  date: string;
  island?: string;
  islands: string[];
  showName?: string;
  showNames?: string[];
  extra?: Record<string, string>;
  includeShow?: boolean;
  /** Bigger fields for door-staff phones. */
  touch?: boolean;
};

export function DateIslandFilter({
  basePath,
  date,
  island = "",
  islands,
  showName = "",
  showNames = [],
  extra = {},
  includeShow = false,
  touch = false,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function go(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
    }
    const d = String(fd.get("date") ?? "").trim();
    const i = String(fd.get("island") ?? "").trim();
    const s = String(fd.get("show_name") ?? "").trim();
    if (d) params.set("date", d);
    if (i) params.set("island", i);
    if (includeShow && s) params.set("show", s);
    start(() => router.push(`${basePath}?${params.toString()}`));
  }

  return (
    <form
      className={
        touch
          ? "grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 print:hidden"
          : "flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 print:hidden"
      }
      onChange={(e) => {
        if (touch) go(e.currentTarget);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
    >
      <label className={touch ? "text-sm font-medium text-slate-600" : "text-xs font-medium text-slate-600"}>
        Date
        <input
          name="date"
          type="date"
          defaultValue={date}
          className={
            touch
              ? "mt-1 block min-h-12 w-full rounded-xl border border-slate-200 px-3 text-base"
              : "mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          }
        />
      </label>
      <label className={touch ? "text-sm font-medium text-slate-600" : "text-xs font-medium text-slate-600"}>
        Island
        <select
          name="island"
          defaultValue={island}
          className={
            touch
              ? "mt-1 block min-h-12 w-full rounded-xl border border-slate-200 px-3 text-base"
              : "mt-1 block min-w-[10rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          }
        >
          <option value="">All islands</option>
          {islands.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      {includeShow ? (
        <label className={touch ? "text-sm font-medium text-slate-600" : "text-xs font-medium text-slate-600"}>
          Show
          <select
            name="show_name"
            defaultValue={showName}
            className={
              touch
                ? "mt-1 block min-h-12 w-full rounded-xl border border-slate-200 px-3 text-base"
                : "mt-1 block min-w-[12rem] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            }
          >
            <option value="">All shows</option>
            {showNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {touch && pending ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {touch ? null : (
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Loading…" : "Apply"}
        </button>
      )}
    </form>
  );
}
