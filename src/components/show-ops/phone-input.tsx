"use client";

import { useId, useState } from "react";

import { countryForCode, flagOf, joinPhoneCode, PHONE_COUNTRIES, splitPhoneCode } from "@/lib/phone-country";
import { cn } from "@/lib/utils";

/**
 * Phone number with a typed country code: the "+" is already there, the desk
 * types the digits (34, 44, 371…) and the flag follows. A code not in our list
 * is still accepted and shows as "Other". With `name` it posts one value,
 * "+34604189230", so server actions read it like the old plain field. Pasting
 * a full number with + into the number box fills the code by itself.
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
  /** The field look; used for both the code box and the number. */
  className?: string;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  const listId = useId();
  const [start] = useState(() => splitPhoneCode(defaultValue));
  const [code, setCode] = useState(start.code);
  const [rest, setRest] = useState(start.rest);
  const country = countryForCode(code);

  const update = (nextCode: string, nextRest: string) => {
    setCode(nextCode);
    setRest(nextRest);
    onChange?.(joinPhoneCode(nextCode, nextRest));
  };

  return (
    <span className="flex gap-1.5">
      <span
        className={cn(
          className,
          "flex w-[7.5rem] shrink-0 items-center gap-1 tabular-nums focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100",
        )}
        title={country ? country.name : code ? "Other country" : "Type the country code"}
      >
        <span aria-hidden className="shrink-0 text-base leading-none">
          {country ? flagOf(country.iso) : "🌐"}
        </span>
        <span aria-hidden className="text-slate-500">+</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          list={listId}
          aria-label="Country code"
          value={code}
          maxLength={4}
          onChange={(e) => update(e.target.value.replace(/\D/g, "").slice(0, 4), rest)}
          className="w-full min-w-0 bg-transparent outline-none"
        />
        {code && !country ? (
          <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-500">Other</span>
        ) : null}
        <datalist id={listId}>
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.code}>
              {c.name}
            </option>
          ))}
        </datalist>
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
          // "+44 7700…" typed or pasted: move the code into the code box once a digit follows it.
          const full = /^\s*(\+|00)/.test(typed) ? splitPhoneCode(typed, code) : null;
          if (full && full.rest && /^\d+$/.test(full.rest)) update(full.code, full.rest);
          else update(code, typed);
        }}
        className={cn(className, "min-w-0 flex-1 tabular-nums")}
      />
      {name ? <input type="hidden" name={name} value={joinPhoneCode(code, rest)} /> : null}
    </span>
  );
}
