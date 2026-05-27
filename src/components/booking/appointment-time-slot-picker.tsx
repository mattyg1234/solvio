"use client";

import type { AppointmentSlotDisplay } from "@/lib/booking-appointment-slots";
import { cn } from "@/lib/utils";

type AppointmentTimeSlotPickerProps = {
  slots: AppointmentSlotDisplay[];
  value: string;
  onChange: (value: string) => void;
  slotMinutes: number;
  serviceDurationMinutes?: number | null;
};

const STATUS_HINT: Record<AppointmentSlotDisplay["status"], string> = {
  available: "Available",
  booked: "Booked",
  break: "Break",
  blocked: "Closed",
};

export function AppointmentTimeSlotPicker({
  slots,
  value,
  onChange,
  slotMinutes,
  serviceDurationMinutes,
}: AppointmentTimeSlotPickerProps) {
  const availableCount = slots.filter((s) => s.status === "available").length;
  const duration =
    typeof serviceDurationMinutes === "number" && serviceDurationMinutes > 0 ? serviceDurationMinutes : slotMinutes;

  if (slots.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        role="listbox"
        aria-label="Available appointment times"
      >
        {slots.map((slot) => {
          const disabled = slot.status !== "available";
          const selected = value === slot.value;
          return (
            <button
              key={slot.value}
              type="button"
              role="option"
              aria-selected={selected}
              aria-disabled={disabled}
              disabled={disabled}
              title={STATUS_HINT[slot.status]}
              onClick={() => onChange(slot.value)}
              className={cn(
                "relative min-h-[44px] rounded-xl border-2 px-2 py-2.5 text-center text-[12px] font-semibold tabular-nums transition-all sm:min-h-[52px] sm:text-[13px]",
                disabled &&
                  "cursor-not-allowed border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8] line-through decoration-rose-400/90 decoration-2",
                slot.status === "booked" && disabled && "bg-rose-50/80 text-rose-400",
                !disabled &&
                  selected &&
                  "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6] shadow-md shadow-[#ede9fe]/80 ring-2 ring-[#ddd6fe]/60",
                !disabled &&
                  !selected &&
                  "border-[#dcd6fc] bg-white text-[#475569] hover:border-[#a78bfa] hover:bg-[#fafbff] active:scale-[0.98]",
              )}
            >
              {slot.shortLabel}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#64748b]">
        <span>
          <span className="font-semibold text-[#475569]">{availableCount}</span> of{" "}
          <span className="font-semibold text-[#475569]">{slots.length}</span> start times · {duration} min appointments
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border-2 border-[#7c3aed] bg-[#f5f3ff]" aria-hidden />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5 line-through decoration-rose-400/90">
          <span className="h-2.5 w-2.5 rounded-sm border border-[#e2e8f0] bg-[#f8fafc]" aria-hidden />
          Booked
        </span>
      </div>
    </div>
  );
}
