"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

import { parseNumberInput, sanitizeNumberInput } from "@/lib/money-input";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: number | string;
  defaultValue?: number | string | null;
  onValueChange?: (n: number | "") => void;
};

function toText(v: number | string | null | undefined): string {
  if (v === "" || v == null) return "";
  return String(v);
}

/**
 * Number field that lets you delete a 0 and type a new value.
 * Native type=number + Number("") snaps empty back to 0 — this does not.
 */
export function NumberInput({
  value,
  defaultValue,
  onValueChange,
  onFocus,
  onBlur,
  min,
  max,
  className,
  ...rest
}: Props) {
  const controlled = value !== undefined;
  const [text, setText] = useState(() => toText(controlled ? value : defaultValue));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!controlled || focused) return;
    setText(toText(value));
  }, [controlled, value, focused]);

  function emit(next: string) {
    const clean = sanitizeNumberInput(next);
    setText(clean);
    onValueChange?.(parseNumberInput(clean));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      min={min}
      max={max}
      className={className}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseNumberInput(text);
        if (parsed !== "") {
          let n = parsed;
          const lo = min != null && min !== "" ? Number(min) : null;
          const hi = max != null && max !== "" ? Number(max) : null;
          if (lo != null && Number.isFinite(lo) && n < lo) n = lo;
          if (hi != null && Number.isFinite(hi) && n > hi) n = hi;
          setText(String(n));
          onValueChange?.(n);
        }
        onBlur?.(e);
      }}
      onChange={(e) => emit(e.target.value)}
    />
  );
}
