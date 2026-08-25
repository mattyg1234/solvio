import Link from "next/link";
import type { ReactNode } from "react";

import { SHOW_OPS_PRIMARY } from "@/components/show-ops/ops-home-widgets";
import { cn } from "@/lib/utils";

export const SHOW_OPS_PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#7c3aed]/25 disabled:cursor-not-allowed disabled:opacity-60";

export const SHOW_OPS_GHOST_BTN =
  "inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 print:hidden";

export function ShowOpsNewBookingButton() {
  return (
    <Link href="/dashboard/show-ops/bookings/new" className={SHOW_OPS_PRIMARY_BTN}>
      + New booking
    </Link>
  );
}

export function ShowOpsPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow ? (
          <p className="text-sm font-semibold" style={{ color: SHOW_OPS_PRIMARY }}>
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ShowOpsPill({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-semibold",
        on ? "text-white shadow-sm shadow-[#7c3aed]/20" : "bg-white text-slate-700 ring-1 ring-slate-200",
      )}
      style={on ? { backgroundColor: SHOW_OPS_PRIMARY } : undefined}
    >
      {children}
    </Link>
  );
}
