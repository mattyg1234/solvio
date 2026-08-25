"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { switchShowOpsWorkspaceAction } from "@/app/dashboard/show-ops/actions";
import type { ShowOpsWorkspace } from "@/lib/show-ops/types";

export function ShowOpsWorkspaceSwitcher({
  workspaces,
  activeBusinessId,
}: {
  workspaces: ShowOpsWorkspace[];
  activeBusinessId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (workspaces.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="font-medium">Workspace</span>
      <select
        disabled={pending}
        value={activeBusinessId}
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await switchShowOpsWorkspaceAction(id);
            router.refresh();
          });
        }}
      >
        {workspaces.map((w) => (
          <option key={w.businessId} value={w.businessId}>
            {w.displayName}
            {w.isOwner ? " (yours)" : ` · ${w.role}`}
          </option>
        ))}
      </select>
    </label>
  );
}
