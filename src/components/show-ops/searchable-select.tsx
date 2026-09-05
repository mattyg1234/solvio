"use client";

import { normaliseDirectorySearch, matchesDirectorySearch } from "@/lib/show-ops/directory-search";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  value: string;
  /** Main line — what the operator reads back to the caller. */
  label: string;
  /** Second line: resort, pick-up time, whatever helps tell two similar names apart. */
  hint?: string;
  /** Extra text to match on that is not displayed (resort, stop name, aliases). */
  keywords?: string;
};

/**
 * Type-to-search picker for long master-data lists.
 *
 * A plain <select> is unusable at this size — Gran Canaria alone has 432 hotels
 * — and it can only be searched by the first letters of the name, so an
 * operator who knows the resort but not the exact hotel has to scroll. This
 * matches on every word in any order across the label, the hint and the hidden
 * keywords, so "puerto sol" finds "Sol Puerto Playa" and typing a resort lists
 * everything in it.
 *
 * Submits through a hidden input so it drops into the existing FormData flow.
 */
export function SearchableSelect({
  name,
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "—",
  disabled = false,
  required = false,
  ariaLabel,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const matches = useMemo(() => {
    const words = normaliseDirectorySearch(query).split(/\s+/).filter(Boolean);
    if (!words.length) return options.slice(0, 200);
    const scored: Array<{ o: SearchableOption; score: number }> = [];
    for (const o of options) {
      if (!matchesDirectorySearch(query, o.label, o.hint, o.keywords)) continue;
      // A hit at the start of the name beats one buried in the keywords.
      const label = normaliseDirectorySearch(o.label);
      const score = words.every((w) => label.startsWith(w)) ? 0 : label.includes(words[0]) ? 1 : 2;
      scored.push({ o, score });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 200).map((s) => s.o);
  }, [options, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Close when the operator clicks away, leaving the current choice intact.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (opt: SearchableOption | null) => {
    onChange(opt?.value ?? "");
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 ${
          disabled ? "opacity-60" : ""
        }`}
      >
        <span className={`min-w-0 truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? <span className="text-slate-400"> · {selected.hint}</span> : null}
            </>
          ) : (
            emptyLabel
          )}
        </span>
        <span aria-hidden className="shrink-0 text-slate-400">▾</span>
      </button>

      {required && !value ? (
        // Keeps native form validation working now the real control is a button.
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={ariaLabel ? `Search ${ariaLabel.toLowerCase()}` : "Search options"}
            placeholder={placeholder}
            className="w-full border-b border-slate-100 px-3 py-2.5 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (matches[active]) pick(matches[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {value ? (
              <li>
                <button
                  type="button"
                  onClick={() => pick(null)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
                >
                  Clear
                </button>
              </li>
            ) : null}
            {matches.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`block w-full px-3 py-2 text-left text-sm ${
                    i === active ? "bg-violet-50" : ""
                  } ${o.value === value ? "font-semibold text-violet-900" : "text-slate-800"}`}
                >
                  <span className="block truncate">{o.label}</span>
                  {o.hint ? <span className="block truncate text-xs text-slate-500">{o.hint}</span> : null}
                </button>
              </li>
            ))}
            {!matches.length ? (
              <li className="px-3 py-6 text-center text-sm text-slate-400">Nothing matches “{query}”.</li>
            ) : null}
          </ul>
          {matches.length >= 200 ? (
            <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
              Showing the first 200 — keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
