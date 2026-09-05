"use client";

import { useState } from "react";
import { setShowOpsMemberIslandsAction } from "@/app/dashboard/show-ops/actions";
import { SubmitOnce } from "./submit-once";

export function IslandScopeFields({
  islands,
  allowedIslands = null,
}: {
  islands: string[];
  allowedIslands?: string[] | null;
}) {
  const [mode, setMode] = useState<"all" | "selected">(
    allowedIslands === null ? "all" : "selected",
  );
  const [selected, setSelected] = useState<string[]>(allowedIslands ?? []);
  return (
    <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">
        Island access
      </legend>
      <label className="block text-xs font-medium text-slate-600">
        Scope
        <select
          name="islands_mode"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as "all" | "selected")
          }
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
        >
          <option value="all">All islands</option>
          <option value="selected">Selected islands only</option>
        </select>
      </label>
      {mode === "selected" ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {islands.map((island) => (
            <label
              key={island}
              className="inline-flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                name="allowed_island"
                value={island}
                checked={selected.includes(island)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, island]
                      : current.filter((value) => value !== island),
                  )
                }
              />
              {island}
            </label>
          ))}
        </div>
      ) : null}
      <p
        className={`text-xs ${mode === "selected" && !selected.length ? "text-amber-800" : "text-slate-500"}`}
      >
        {mode === "all"
          ? "Includes every current and future island in this workspace."
          : selected.length
            ? "Only these islands are accessible. New islands will need to be added here."
            : "No islands selected: this user will have no island access. This does not mean all islands."}
      </p>
    </fieldset>
  );
}

export function MemberIslandsForm({
  memberId,
  islands,
  allowedIslands,
  isSelf = false,
}: {
  memberId: string;
  islands: string[];
  allowedIslands: string[] | null;
  isSelf?: boolean;
}) {
  return (
    <details className="mt-2 w-full">
      <summary className="cursor-pointer text-xs text-slate-600 hover:underline">
        Islands:{" "}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
          {allowedIslands === null
            ? "All islands"
            : allowedIslands.length
              ? allowedIslands.join(", ")
              : "No islands"}
        </span>
      </summary>
      <form action={setShowOpsMemberIslandsAction} className="mt-2 space-y-2">
        <input type="hidden" name="member_id" value={memberId} />
        <IslandScopeFields islands={islands} allowedIslands={allowedIslands} />
        {isSelf ? (
          <p className="text-xs text-amber-800">
            Restricting your own islands also removes your access to global
            settings and permission management.
          </p>
        ) : null}
        <SubmitOnce className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          Save island access
        </SubmitOnce>
      </form>
    </details>
  );
}
