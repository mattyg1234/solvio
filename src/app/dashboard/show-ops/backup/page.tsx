import { requireShowOpsEnabled } from "@/lib/show-ops/access";

export default async function ShowOpsBackupPage() {
  await requireShowOpsEnabled();
  return (
    <div className="prose prose-slate max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Backups & Plan B</h2>
      <p>
        Show Ops is multi-tenant with row-level security. Your recovery targets for v1 are{" "}
        <strong>RPO ≤ 24h</strong> and restore within one business day.
      </p>
      <ol>
        <li>Supabase PITR / daily backups on the Solvio project.</li>
        <li>
          Download a tenant JSON snapshot anytime:{" "}
          <a href="/api/show-ops/export">/api/show-ops/export</a>
        </li>
        <li>Store that file offline or in encrypted cloud storage.</li>
        <li>If the primary region fails: restore DB from PITR or re-import export; re-point Vercel env + custom domain DNS.</li>
      </ol>
      <p className="text-sm text-slate-600">
        Full runbook: <code>docs/show-ops-backup-and-plan-b.md</code> in the Solvio repo.
      </p>
    </div>
  );
}
