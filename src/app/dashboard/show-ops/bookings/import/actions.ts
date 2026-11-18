"use server";

import { createBookingAction } from "@/app/dashboard/show-ops/actions";
import { requireShowOpsAction } from "@/lib/show-ops/access";
import {
  BOOKING_SHEET_MAX_ROWS,
  checkSheetRow,
  flagSheetDuplicates,
  readBookingSheet,
  type CheckedRow,
} from "@/lib/show-ops/booking-sheet";
import { loadExistingForDates, loadSheetLookups } from "@/lib/show-ops/booking-sheet-data";

export type SheetCheckResult =
  | { ok: false; message: string }
  | { ok: true; fileProblems: string[]; rows: Omit<CheckedRow, "form">[] };

export type SheetImportResult =
  | { ok: false; message: string }
  | { ok: true; added: Array<{ row: number; ref: string; guest: string }>; failed: Array<{ row: number; guest: string; message: string }>; skipped: number };

const MAX_FILE_BYTES = 3 * 1024 * 1024;

async function checkFile(formData: FormData) {
  const ctx = await requireShowOpsAction("booker", "bookings");
  const file = formData.get("sheet");
  if (!(file instanceof File) || !file.size) return { ok: false as const, message: "Choose the filled-in sheet first." };
  if (file.size > MAX_FILE_BYTES) return { ok: false as const, message: "That file is over 3 MB. Is it the right sheet?" };
  const read = await readBookingSheet(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!read.rows.length) {
    return { ok: false as const, message: read.problems[0] ?? "The sheet has no bookings in it." };
  }
  if (read.rows.length > BOOKING_SHEET_MAX_ROWS) {
    return { ok: false as const, message: `The sheet has ${read.rows.length} rows; upload at most ${BOOKING_SHEET_MAX_ROWS} at a time.` };
  }
  const lookups = await loadSheetLookups(ctx.supabase as never, ctx.business.id);
  const firstPass = read.rows.map((r) => checkSheetRow(r, lookups));
  const existing = await loadExistingForDates(ctx.supabase as never, ctx.business.id, firstPass.map((r) => r.form.show_date));
  const rows = flagSheetDuplicates(read.rows.map((r) => checkSheetRow(r, lookups, existing)));
  return { ok: true as const, fileProblems: read.problems, rows };
}

/** Step 1: read and check every row. Nothing is saved. */
export async function checkBookingSheetAction(formData: FormData): Promise<SheetCheckResult> {
  try {
    const checked = await checkFile(formData);
    if (!checked.ok) return checked;
    return { ok: true, fileProblems: checked.fileProblems, rows: checked.rows.map((r) => ({ row: r.row, ok: r.ok, problems: r.problems, notes: r.notes, summary: r.summary })) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not read the sheet." };
  }
}

/**
 * Step 2: the same file again, checked again from scratch (never trusting step 1),
 * then each good row is saved through the normal new-booking action: same prices,
 * rules and booking refs as typing it in. Rows with problems are left out.
 * Guest tickets are not sent.
 */
export async function importBookingSheetAction(formData: FormData): Promise<SheetImportResult> {
  try {
    const checked = await checkFile(formData);
    if (!checked.ok) return checked;
    const added: Array<{ row: number; ref: string; guest: string }> = [];
    const failed: Array<{ row: number; guest: string; message: string }> = [];
    let skipped = 0;
    for (const row of checked.rows) {
      if (!row.ok) { skipped += 1; continue; }
      const fd = new FormData();
      for (const [k, v] of Object.entries(row.form)) fd.set(k, v);
      const res = await createBookingAction(fd);
      if (res.ok) added.push({ row: row.row, ref: String(res.message ?? "").split(" ")[0], guest: row.summary.guest_name });
      else failed.push({ row: row.row, guest: row.summary.guest_name, message: res.message });
    }
    return { ok: true, added, failed, skipped };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not add the bookings." };
  }
}
