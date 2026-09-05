import type { Metadata } from "next";

import { ShowOpsWorkspaceSwitcher } from "@/components/show-ops/workspace-switcher";
import { getShowOpsRenderContext } from "@/lib/show-ops/access";
import { showOpsOutboundLive } from "@/lib/show-ops/outbound";

/**
 * Browser tab and bookmark name. Operators name their own system, so the
 * workspace name leads and Solvio sits behind it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getShowOpsRenderContext();
  return {
    title: `${ctx.branding.displayName} · Solvio`,
    description: "Tour and show operations — bookings, lists, invoices.",
  };
}

export default async function ShowOpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getShowOpsRenderContext();
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
      <p className="text-xs text-slate-500">
        Your access: {ctx.role} ·{" "}
        {ctx.allowedIslands === null
          ? "All islands"
          : ctx.allowedIslands.length
            ? ctx.allowedIslands.join(", ")
            : "No islands"}
      </p>
      {ctx.workspaces.length > 1 ? (
        <header className="mb-3 flex justify-end">
          <ShowOpsWorkspaceSwitcher
            workspaces={ctx.workspaces}
            activeBusinessId={ctx.business.id}
          />
        </header>
      ) : null}
      {!showOpsOutboundLive() ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          Show Ops is in test mode. Emails are only sent to approved test
          addresses; other recipients stay blocked.
        </p>
      ) : null}
      {children}
    </div>
  );
}
