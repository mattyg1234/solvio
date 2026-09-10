import { gunzipSync } from "node:zlib";

import { SHOW_OPS_BACKUP_BUCKET, SHOW_OPS_BACKUP_TABLES, snapshotTimestamp } from "@/lib/show-ops/backup";
import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SnapshotSummary = { tables: number; rows: number; files: number; errors: Record<string, string> };

/** Opens the newest snapshot far enough to read its counts, manifest and errors. Never throws. */
async function summariseSnapshot(
  admin: ReturnType<typeof createSupabaseServiceRoleClient>,
  path: string,
): Promise<SnapshotSummary | null> {
  try {
    const { data, error } = await admin.storage.from(SHOW_OPS_BACKUP_BUCKET).download(path);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    const text = (path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
    const parsed = JSON.parse(text) as {
      counts?: Record<string, number>;
      files?: unknown[];
      errors?: Record<string, string>;
    };
    const counts = parsed.counts ?? {};
    return {
      tables: Object.keys(counts).length,
      rows: Object.values(counts).reduce((a, b) => a + Number(b || 0), 0),
      files: Array.isArray(parsed.files) ? parsed.files.length : 0,
      errors: parsed.errors ?? {},
    };
  } catch {
    return null;
  }
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function ShowOpsBackupPage() {
  const ctx = await requireGlobalShowOpsAdmin();

  // Snapshots are service-role only; the page reads them on the operator's behalf.
  const admin = createSupabaseServiceRoleClient();
  const { data: objects } = await admin.storage.from(SHOW_OPS_BACKUP_BUCKET).list(ctx.business.id, {
    limit: 12,
    sortBy: { column: "name", order: "desc" },
  });

  // Only timestamped snapshot files count; the `files/` folder holds mirrored receipts and photos.
  const snapshots = (objects ?? []).filter((o) => snapshotTimestamp(o.name));
  const latest = snapshots[0] ?? null;
  const latestAt = latest?.created_at ?? latest?.updated_at ?? null;
  const summary = latest ? await summariseSnapshot(admin, `${ctx.business.id}/${latest.name}`) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Backups &amp; Plan B</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          A complete copy of this workspace — every booking, partner, hotel, stop, payment, invoice, expense and
          integration, plus receipts, ticket photos and the logo — is written to private storage every six hours. If the system goes down, the mirror is at most six hours behind.
          Copies are kept for a day, then one a day for a month.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Last mirror</h3>
        {latest ? (
          <>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {latestAt ? ago(latestAt) : "—"}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {size(Number(latest.metadata?.size ?? 0))}
              </span>
            </p>
            <p className="text-xs text-slate-500">{latest.name.replace(/\.json(\.gz)?$/, "").replace(/-(\d{2})-(\d{2})-(\d{2})-\d{3}Z$/, " $1:$2:$3 UTC")}</p>
            {summary ? (
              <p className="mt-2 text-sm text-slate-600">
                {summary.tables} tables · {summary.rows.toLocaleString()} rows · {summary.files} files
                {summary.files ? " (receipts, photos and logo mirrored alongside)" : ""}
              </p>
            ) : null}
            {summary && Object.keys(summary.errors).length ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-700">
                {Object.entries(summary.errors).map(([k, v]) => (
                  <li key={k}>
                    Not backed up — {k}: {v}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-amber-700">
            No snapshot yet. The job runs every six hours — if this is still empty tomorrow, check that CRON_SECRET is
            set on the deployment.
          </p>
        )}

        {snapshots.length > 1 ? (
          <ul className="mt-4 space-y-1 text-xs text-slate-500">
            {snapshots.slice(1).map((o) => (
              <li key={o.name}>
                {o.created_at ? ago(o.created_at) : o.name} · {size(Number(o.metadata?.size ?? 0))}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h3 className="text-sm font-semibold text-slate-900">Take a copy now</h3>
        <p className="mt-1 text-sm text-slate-600">
          Downloads the same complete snapshot to this computer. Keep it offline or in encrypted cloud storage.
        </p>
        <a
          href="/api/show-ops/export"
          className="mt-3 inline-block rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
        >
          Download JSON backup
        </a>
        <p className="mt-3 text-xs text-slate-500">
          Tables included: {SHOW_OPS_BACKUP_TABLES.join(", ")}. Each file carries a row count per table, so a short or
          failed backup is obvious without opening it.
        </p>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 text-sm text-slate-600">
        <h3 className="text-sm font-semibold text-slate-900">If the system goes down</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Restore the database from Supabase point-in-time recovery — this is the fastest route back.</li>
          <li>If the project itself is gone, stand up a new one and re-import the newest snapshot above.</li>
          <li>Re-point the Vercel environment variables and the custom domain at the new project.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Full runbook: <code>docs/show-ops-backup-and-plan-b.md</code> in the Solvio repo.
        </p>
      </section>
    </div>
  );
}
