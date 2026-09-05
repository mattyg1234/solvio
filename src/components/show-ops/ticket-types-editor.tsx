"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveTicketTypeAction,
  archiveTicketTypeAction,
} from "@/app/dashboard/show-ops/ticket-type-actions";
import { NumberInput } from "@/components/ui/number-input";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import type { ShowOpsConfig } from "@/lib/show-ops/types";

export type MasterTicketType = Omit<
  import("@/lib/show-ops/ticket-types").ShowTicketType,
  "business_id"
>;
const PRICE_FIELDS = [
  "adult_price",
  "child_price",
  "infant_price",
  "adult_price_no_transport",
  "child_price_no_transport",
  "infant_price_no_transport",
  "adult_nett",
  "child_nett",
] as const;
type PriceField = (typeof PRICE_FIELDS)[number];

export function TicketTypesEditor({
  productId,
  showName,
  island,
  config,
  types,
}: {
  productId: string;
  showName: string;
  island: string;
  config: ShowOpsConfig;
  types: MasterTicketType[];
}) {
  return (
    <section
      className="mt-5 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4"
      aria-label={`Ticket types for ${showName}`}
    >
      <h4 className="font-semibold text-slate-900">Ticket types & packages</h4>
      <p className="text-sm leading-relaxed text-slate-600">
        Add named choices with their own prices, such as Standard, Gold or Show
        only. Every choice belongs to {showName} and uses the same show dates,
        start time and shared capacity. The base ticket above remains available.
      </p>
      {types.map((type) => (
        <details
          key={JSON.stringify(type)}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <summary className="cursor-pointer text-sm font-medium text-slate-900">
            {type.name}{" "}
            <span className="font-normal text-slate-500">
              · Adult{" "}
              {formatShowOpsMoney(
                type.adult_price,
                showOpsCurrencyFor(config, island),
              )}
              {!type.active ? " · Archived" : ""}
            </span>
          </summary>
          <TicketTypeFields
            productId={productId}
            island={island}
            config={config}
            existing={type}
          />
        </details>
      ))}
      <details className="rounded-xl border border-dashed border-violet-300 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
          + Add ticket type or package
        </summary>
        <TicketTypeFields
          productId={productId}
          island={island}
          config={config}
        />
      </details>
    </section>
  );
}

/** Controlled fields deliberately have no form names: this editor lives inside the show's bulk form. */
function TicketTypeFields({
  productId,
  island,
  config,
  existing,
}: {
  productId: string;
  island: string;
  config: ShowOpsConfig;
  existing?: MasterTicketType;
}) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [prices, setPrices] = useState<Record<PriceField, number | "">>(
    () =>
      Object.fromEntries(
        PRICE_FIELDS.map((field) => [field, existing?.[field] ?? ""]),
      ) as Record<PriceField, number | "">,
  );
  const [transport, setTransport] = useState(
    existing?.transport_available ?? true,
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const currency = showOpsCurrencyFor(config, island);

  async function submit(archive = false) {
    if (pending) return;
    setError("");
    setStatus("");
    if (
      !archive &&
      (!name.trim() ||
        ["adult_price", "child_price", "infant_price"].some(
          (field) => prices[field as PriceField] === "",
        ))
    ) {
      setError(
        "Enter a ticket type name and each standard price. Use 0 only when that ticket is free.",
      );
      return;
    }
    setPending(true);
    const data = new FormData();
    data.set("product_id", productId);
    if (existing) data.set("id", existing.id);
    data.set("name", name.trim());
    data.set("description", description.trim());
    data.set("transport_available", transport ? "1" : "0");
    data.set("active", active ? "1" : "0");
    for (const field of PRICE_FIELDS) data.set(field, String(prices[field]));
    try {
      if (archive) await archiveTicketTypeAction(data);
      else await saveTicketTypeAction(data);
      setStatus(
        archive
          ? "Ticket type archived. Its booking history is kept."
          : "Ticket type saved for new bookings.",
      );
      if (!existing && !archive) {
        setName("");
        setDescription("");
        setPrices(
          Object.fromEntries(
            PRICE_FIELDS.map((field) => [field, ""]),
          ) as Record<PriceField, number | "">,
        );
        setTransport(true);
        setActive(true);
      }
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save this ticket type. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  const moneyField = (field: PriceField, label: string) => (
    <label className="text-xs font-medium text-slate-600" key={field}>
      {label}
      <NumberInput
        value={prices[field]}
        min={0}
        onValueChange={(value) =>
          setPrices((current) => ({ ...current, [field]: value }))
        }
        disabled={pending}
        className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
      />
    </label>
  );

  return (
    <div
      className="mt-4 space-y-4"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.stopPropagation();
          void submit();
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Ticket type / package name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            placeholder="e.g. Gold"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Bus transport
          <select
            value={transport ? "1" : "0"}
            onChange={(event) => setTransport(event.target.value === "1")}
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            <option value="1">Available with this type</option>
            <option value="0">Not available with this type</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">
          What this ticket includes (optional)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={pending}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Prices in {currency.toUpperCase()}. Enter the complete ticket/package
        price, not an extra amount to add to the base ticket.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {moneyField("adult_price", "Adult standard price")}
        {moneyField("child_price", "Child standard price")}
        {moneyField("infant_price", "Infant standard price")}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        The same bus pricing rules as the base ticket apply to each age band:
        blank without-bus uses standard price plus the configured bus supplement
        for adults and children. An explicit without-bus price uses the two
        prices exactly, with no extra supplement.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {moneyField("adult_price_no_transport", "Adult without bus (optional)")}
        {moneyField("child_price_no_transport", "Child without bus (optional)")}
        {moneyField(
          "infant_price_no_transport",
          "Infant without bus (optional)",
        )}
      </div>
      <details className="rounded-lg bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">
          Optional invoice nett fallback
        </summary>
        <p className="my-3 text-xs text-slate-500">
          Partner nett percentages other than 100% take priority. At 100%, these
          fixed amounts apply; blank uses the calculated guest price.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {moneyField("adult_nett", "Adult nett fallback")}
          {moneyField("child_nett", "Child nett fallback")}
        </div>
      </details>
      {existing ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            disabled={pending}
          />
          Active for new bookings
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? "Saving…"
            : existing
              ? "Save ticket type"
              : "Add ticket type"}
        </button>
        {existing?.active ? (
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={pending}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Archive ticket type
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="text-sm text-emerald-800">
          {status}
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        Save island or show changes above first. Save each ticket type
        separately. Price edits apply to new bookings. Archive a retired type to
        keep its existing booking history.
      </p>
    </div>
  );
}
