import { sendShowOpsHtmlEmail } from "@/lib/notifications/show-ops-emails";
import { parseShowOpsConfig } from "@/lib/show-ops/config";
import {
  planBRecipients,
  PLAN_B_BUSINESS_SELECT,
  PLAN_B_MAX_ATTACHMENT_BYTES,
  buildPlanBPack,
  newestSnapshot,
  offsiteBackupEmails,
  type PlanBBusinessRow,
} from "@/lib/show-ops/plan-b-pack";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

export type PlanBRunResult = {
  business: string;
  pack?: { ok: boolean; to: number; attachments: number; bookings: number; errors: string[]; message?: string };
  offsite?: { ok: boolean; to: number; snapshot?: string; bytes?: number; message?: string };
};

/** Build and send one workspace's Plan B pack to `to` (defaults to its report addresses). */
export async function sendPlanBPack(admin: Admin, b: PlanBBusinessRow, opts: { to?: string[]; now?: Date } = {}) {
  const pack = await buildPlanBPack(admin, b, opts.now);
  const to = opts.to ?? pack.emails;
  if (!to.length) {
    return { ok: false, to: 0, attachments: 0, bookings: pack.upcomingBookings, errors: pack.errors, message: "No report email addresses in Settings." };
  }
  const result = await sendShowOpsHtmlEmail({
    to,
    subject: pack.subject,
    html: pack.html,
    text: pack.text,
    attachments: pack.attachments,
    log: { businessId: b.id, kind: "plan_b_pack" },
  });
  return {
    ok: result.ok,
    to: to.length,
    attachments: pack.attachments.length,
    bookings: pack.upcomingBookings,
    errors: pack.errors,
    message: result.ok ? undefined : result.message,
  };
}

/** Email the newest full snapshot to the off-site backup addresses. */
export async function sendOffsiteSnapshot(admin: Admin, b: PlanBBusinessRow, to: string[]) {
  const snap = await newestSnapshot(admin, b.id);
  if (!snap) return { ok: false, to: to.length, message: "No snapshot in the backup bucket yet." };
  if (snap.bytes.byteLength > PLAN_B_MAX_ATTACHMENT_BYTES) {
    return { ok: false, to: to.length, snapshot: snap.name, bytes: snap.bytes.byteLength, message: "Snapshot is too large to email." };
  }
  const name = b.show_ops_display_name || b.name;
  const result = await sendShowOpsHtmlEmail({
    to,
    subject: `${name} off-site backup ${snap.name.replace(/\.json(\.gz)?$/, "")}`,
    text: `Full backup of ${name} (every booking, partner, invoice, payment and setting), taken ${snap.name}. Keep it: it restores the Hub if the database is lost. Restore steps: docs/show-ops-backup-and-plan-b.md in the Solvio repo.`,
    html: `<p>Full backup of <strong>${name.replace(/[<>&]/g, "")}</strong> (every booking, partner, invoice, payment and setting), taken ${snap.name}.</p><p>Keep it: it restores the Hub if the database is lost. Restore steps: <code>docs/show-ops-backup-and-plan-b.md</code> in the Solvio repo.</p>`,
    attachments: [{ filename: `${b.id}-${snap.name}`, content: snap.bytes.toString("base64") }],
    log: { businessId: b.id, kind: "offsite_backup" },
  });
  return { ok: result.ok, to: to.length, snapshot: snap.name, bytes: snap.bytes.byteLength, message: result.ok ? undefined : result.message };
}

/** The cron: every Show Ops workspace gets its pack; the off-site copy goes when SHOW_OPS_OFFSITE_BACKUP_EMAILS is set. */
export async function runPlanBPacks(now = new Date()): Promise<{ results: PlanBRunResult[]; failed: number; error?: string }> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.from("businesses").select(PLAN_B_BUSINESS_SELECT).eq("show_ops_enabled", true);
  if (error) return { results: [], failed: 1, error: error.message };
  const offsite = offsiteBackupEmails();
  const results: PlanBRunResult[] = [];
  let failed = 0;
  for (const b of (data ?? []) as PlanBBusinessRow[]) {
    const entry: PlanBRunResult = { business: b.show_ops_display_name || b.name };
    if (planBRecipients(parseShowOpsConfig(b.show_ops_config)).length) {
      try {
        entry.pack = await sendPlanBPack(admin, b, { now });
      } catch (e) {
        entry.pack = { ok: false, to: 0, attachments: 0, bookings: 0, errors: [], message: e instanceof Error ? e.message : String(e) };
      }
      if (!entry.pack.ok) failed += 1;
    }
    if (offsite.length) {
      try {
        entry.offsite = await sendOffsiteSnapshot(admin, b, offsite);
      } catch (e) {
        entry.offsite = { ok: false, to: offsite.length, message: e instanceof Error ? e.message : String(e) };
      }
      if (!entry.offsite.ok) failed += 1;
    }
    if (entry.pack?.ok === false || entry.offsite?.ok === false) {
      console.error(`[show-ops-plan-b] ${entry.business}: ${JSON.stringify(entry)}`);
    }
    results.push(entry);
  }
  return { results, failed };
}
