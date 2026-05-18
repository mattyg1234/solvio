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
