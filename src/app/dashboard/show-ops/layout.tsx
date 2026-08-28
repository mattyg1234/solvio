import type { Metadata } from "next";

import { ShowOpsWorkspaceSwitcher } from "@/components/show-ops/workspace-switcher";
import { requireShowOpsContext } from "@/lib/show-ops/access";
import { SHOW_OPS_OUTBOUND_HELD, showOpsOutboundLive } from "@/lib/show-ops/outbound";

/**
 * Browser tab and bookmark name. Operators name their own system, so the
 * workspace name leads and Solvio sits behind it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await requireShowOpsContext();
  return {
    title: `${ctx.branding.displayName} · Solvio`,
    description: "Tour and show operations — bookings, lists, invoices.",
  };
}

export default async function ShowOpsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireShowOpsContext();
  const { branding } = ctx;

  return (
    <div
      className="space-y-2"
      style={
        {
          ["--show-ops-primary" as string]: branding.primaryColor,
          ["--show-ops-accent" as string]: branding.accentColor,
        } as React.CSSProperties
      }
    >
      {ctx.workspaces.length > 1 ? (
        <header className="mb-3 flex justify-end">
          <ShowOpsWorkspaceSwitcher workspaces={ctx.workspaces} activeBusinessId={ctx.business.id} />
        </header>
      ) : null}
      {!showOpsOutboundLive() ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          {SHOW_OPS_OUTBOUND_HELD} Closes, invoices, tickets and partner mail stay in the app only.
        </p>
      ) : null}
      {children}
    </div>
  );
}
