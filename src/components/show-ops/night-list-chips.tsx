import Link from "next/link";

import { NIGHT_LIST_CHIPS, type NightListView } from "@/lib/show-ops/lists";
import { cn } from "@/lib/utils";
import { SHOW_OPS_PRIMARY } from "@/components/show-ops/ops-home-widgets";

export function NightListChips({
  hrefFor,
  active,
}: {
  hrefFor: (id: NightListView) => string;
  active?: NightListView[];
}) {
  const on = new Set(active ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      {NIGHT_LIST_CHIPS.map((chip) => {
        const selected = on.has(chip.id);
        return (
          <Link
            key={chip.id}
            href={hrefFor(chip.id)}
            title={chip.hint}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition",
              selected
                ? "text-white shadow-sm shadow-[#7c3aed]/20 ring-transparent"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
            style={selected ? { backgroundColor: SHOW_OPS_PRIMARY } : undefined}
          >
            {chip.label}
          </Link>
        );
      })}
    </div>
  );
}

export function nightListsHref(input: {
  date: string;
  views: NightListView[];
  island?: string;
  show?: string;
  sort?: string;
  q?: string;
  timeFrom?: string;
  timeTo?: string;
  spacesOnly?: boolean;
}): string {
  const p = new URLSearchParams();
  p.set("date", input.date);
  p.set("views", input.views.join(","));
  if (input.island) p.set("island", input.island);
  if (input.show) p.set("show", input.show);
  if (input.sort) p.set("sort", input.sort);
  if (input.q) p.set("q", input.q);
  if (input.timeFrom) p.set("time_from", input.timeFrom);
  if (input.timeTo) p.set("time_to", input.timeTo);
  if (input.spacesOnly) p.set("spaces", "1");
  return `/dashboard/show-ops/lists?${p.toString()}`;
}
