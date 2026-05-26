/** Dashboard + server queries — aligns with Postgres appointment tables. */

export type AppointmentWeekRow = {
  id: string;
  weekday: number;
  open_time: string;
  close_time: string;
  slot_minutes: number;
};

export type SlotExceptionRow = {
  id: string;
  exception_date: string;
  slot_start: string | null;
  kind: "removed" | "cancelled";
  reason: string | null;
};

/** Merchant-facing labels — DB still stores removed | cancelled. */
export function appointmentExceptionKindLabel(kind: SlotExceptionRow["kind"]): string {
  if (kind === "cancelled") return "Day off — closed";
  return "Closed (hidden online)";
}

export function appointmentExceptionKindOptionLabel(kind: SlotExceptionRow["kind"]): string {
  if (kind === "cancelled") return "Day off — closed (reason for AI & callers)";
  return "Closed — hidden on booking page";
}
