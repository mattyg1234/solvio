/**
 * A booking edit form's values as one string, so "Send ticket to guest" can tell
 * whether the desk changed something on the form without pressing Update booking.
 * The send switches themselves are left out: ticking them is not an edit.
 */

export const BOOKING_EDIT_FORM_ID = "booking-edit-form";

const IGNORED = new Set(["send_update", "send_now", "send_now_updated"]);

export function formSnapshot(entries: Iterable<[string, FormDataEntryValue]>): string {
  const out: string[] = [];
  for (const [k, v] of entries) {
    if (IGNORED.has(k)) continue;
    out.push(`${k}=${typeof v === "string" ? v : `[file:${v.name}:${v.size}]`}`);
  }
  return out.join("\n");
}
