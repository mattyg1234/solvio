"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { saveStaffMembers } from "@/app/dashboard/bookings/inventory-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  STAFF_SCHEDULE_WEEKDAYS,
  isStaffWorkingOnWeekday,
  newStaffMember,
  staffWeekdays,
  toggleStaffWeekday,
  type StaffMember,
} from "@/lib/staff-members";
import { cn } from "@/lib/utils";

type StaffWeekScheduleGridProps = {
  businessId: string;
  staffMembers: StaffMember[];
  /** Weekdays with appointment hours configured — used for hints only. */
  openWeekdays?: number[];
};

export function StaffWeekScheduleGrid({ businessId, staffMembers, openWeekdays = [] }: StaffWeekScheduleGridProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [staff, setStaff] = useState<StaffMember[]>(staffMembers);
  const [newStaffName, setNewStaffName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStaff(staffMembers);
  }, [staffMembers]);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await fn();
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save.");
        }
      })();
    });
  }

  function persist(next: StaffMember[]) {
    setStaff(next);
    run(async () => {
      await saveStaffMembers(businessId, next);
    });
  }

  function toggleDay(memberId: string, weekday: number) {
    const member = staff.find((s) => s.id === memberId);
    if (!member) return;
    const working = isStaffWorkingOnWeekday(member, weekday);
    const next = staff.map((s) => (s.id === memberId ? toggleStaffWeekday(s, weekday, !working) : s));
    persist(next);
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p> : null}

      <header>
        <h2 className="text-lg font-semibold text-[#0f172a]">Staff members</h2>
        <p className="mt-1 text-sm text-[#64748b]">
          Tap a day to mark who is working. Guests can pick a preferred team member on your booking page — only staff scheduled
          that day appear.
        </p>
      </header>

      {staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#ddd6fe] bg-[#fafbff] px-4 py-6 text-sm text-[#64748b]">
          Add your first team member below, then set their working days on the grid.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#f1eefc] bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[#ebe7f7] bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              <tr>
                <th className="sticky left-0 z-10 bg-[#fafbff] px-4 py-3">Staff</th>
                {STAFF_SCHEDULE_WEEKDAYS.map((d) => (
                  <th key={d.weekday} className="px-2 py-3 text-center">
                    <span className="hidden sm:inline">{d.short}</span>
                    <span className="sm:hidden">{d.short.slice(0, 1)}</span>
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <tr key={member.id} className="border-b border-[#f8fafc]">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold text-[#0f172a]">{member.name}</td>
                  {STAFF_SCHEDULE_WEEKDAYS.map((d) => {
                    const on = isStaffWorkingOnWeekday(member, d.weekday);
                    const salonClosed = openWeekdays.length > 0 && !openWeekdays.includes(d.weekday);
                    return (
                      <td key={d.weekday} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={pending}
                          aria-pressed={on}
                          aria-label={`${member.name} — ${d.label}${on ? ", working" : ", off"}${salonClosed ? ", salon closed this day" : ""}`}
                          title={salonClosed ? `${d.label}: no appointment hours set` : `${on ? "Working" : "Off"} — click to toggle`}
                          onClick={() => toggleDay(member.id, d.weekday)}
                          className={cn(
                            "mx-auto flex h-10 w-10 items-center justify-center rounded-xl border-2 text-xs font-bold transition-colors",
                            on
                              ? "border-[#7c3aed] bg-[#f5f3ff] text-[#5b21b6] hover:bg-[#ede9fe]"
                              : "border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8] hover:border-[#cbd5e1] hover:bg-white",
                            salonClosed && !on && "opacity-60",
                          )}
                        >
                          {on ? "✓" : "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={pending}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-rose-700")}
                      onClick={() => persist(staff.filter((s) => s.id !== member.id))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {staff.length > 0 ? (
        <p className="text-xs text-[#64748b]">
          {staff.map((m) => `${m.name}: ${staffWeekdays(m).map((wd) => STAFF_SCHEDULE_WEEKDAYS.find((d) => d.weekday === wd)?.short ?? wd).join(", ")}`).join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 p-5 sm:flex-row sm:items-end">
        <label className="block flex-1 space-y-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
          Add team member
          <input
            value={newStaffName}
            onChange={(e) => setNewStaffName(e.target.value)}
            placeholder="Sarah, Alex, front desk…"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-3 text-[15px] font-normal normal-case tracking-normal text-[#0f172a]"
          />
        </label>
        <Button
          type="button"
          disabled={pending || newStaffName.trim().length < 2}
          className="h-11 rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
          onClick={() => {
            const member = newStaffMember(newStaffName);
            persist([...staff, member]);
            setNewStaffName("");
          }}
        >
          {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-2 inline h-4 w-4" aria-hidden />}
          Add staff
        </Button>
      </div>
    </div>
  );
}
