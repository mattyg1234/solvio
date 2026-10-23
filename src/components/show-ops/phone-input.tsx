"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { flagOf, joinPhone, PHONE_COUNTRIES, phoneCountry, splitPhone } from "@/lib/phone-country";
import { cn } from "@/lib/utils";

/**
 * Phone number with a country-code dropdown (Spain first). With `name` it posts
 * one value, "+34604189230", so server actions read it like the old plain field.
 * Pasting a full number with + switches the country by itself.
 */
export function PhoneInput({
  name,
  defaultValue = "",
  className,
  placeholder = "612 345 678",
  required,
  onChange,
}: {
  name?: string;
  defaultValue?: string | null;
  /** The field look; used for both the country box and the number. */
  className?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const [start] = useState(() => splitPhone(defaultValue));
  const [iso, setIso] = useState(start.iso);
  const [rest, setRest] = useState(start.rest);
  const country = phoneCountry(iso);

  const update = (nextIso: string, nextRest: string) => {
    setIso(nextIso);
    setRest(nextRest);
    onChange?.(joinPhone(nextIso, nextRest));
  };

  return (
    <span className="flex gap-1.5">
      <span className={cn(className, "relative flex w-auto shrink-0 items-center gap-1 tabular-nums focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100")}>
        <span aria-hidden>
          {flagOf(country.iso)} +{country.code}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        <select
          aria-label="Country code"
          value={iso}
          onChange={(e) => update(e.target.value, rest)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {flagOf(c.iso)} {c.name} +{c.code}
            </option>
          ))}
        </select>
      </span>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={rest}
        required={required}
        placeholder={placeholder}
        aria-label="Phone number"
        onChange={(e) => {
          const typed = e.target.value;
          // "+44 7700…" typed or pasted: move the code into the dropdown once a digit follows it.
          const full = /^\s*(\+|00)/.test(typed) ? splitPhone(typed, iso) : null;
          if (full && full.rest && /^\d+$/.test(full.rest)) update(full.iso, full.rest);
          else update(iso, typed);
        }}
        className={cn(className, "min-w-0 flex-1 tabular-nums")}
      />
      {name ? <input type="hidden" name={name} value={joinPhone(iso, rest)} /> : null}
    </span>
  );
}
