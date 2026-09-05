"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import {
  applyMasterProductsBulkAction,
  deleteProductAction,
  repriceUninvoicedBoundAction,
  saveMasterProductOneAction,
  saveMasterProductsAllAction,
} from "@/app/dashboard/show-ops/actions";
import {
  TicketTypesEditor,
  type MasterTicketType,
} from "./ticket-types-editor";
import { NumberInput } from "@/components/ui/number-input";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import type { ShowOpsConfig } from "@/lib/show-ops/types";
import { SHOW_OPS_WEEKDAYS } from "@/lib/show-ops/nights";

function stopEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const el = e.target;
  if (el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement)
    return;
  e.preventDefault();
}

export type MasterShowRow = {
  id: string;
  name: string;
  island: string;
  ticket_type: string | null;
  adult_price: number;
  child_price: number;
  infant_price: number;
  adult_price_no_transport: number | null;
  child_price_no_transport: number | null;
  infant_price_no_transport: number | null;
  adult_nett: number | null;
  child_nett: number | null;
  capacity: number | null;
  show_time?: string | null;
  transport_available: boolean;
  active: boolean | null;
  run_weekdays?: number[] | null;
};

function setField(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name);
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    el.value = value;
  }
}

function setCheckbox(form: HTMLFormElement, name: string, on: boolean) {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement && el.type === "checkbox") el.checked = on;
}

function applyBulkToDom(form: HTMLFormElement, targetIds: string[]) {
  const fd = new FormData(form);
  const island = String(fd.get("bulk_island") ?? "").trim();
  const adult = String(fd.get("bulk_adult_price") ?? "").trim();
  const child = String(fd.get("bulk_child_price") ?? "").trim();
  const capacity = String(fd.get("bulk_capacity") ?? "").trim();
  const transport = String(fd.get("bulk_transport") ?? "");
  const active = String(fd.get("bulk_active") ?? "");

  for (const id of targetIds) {
    const p = `${id}::`;
    if (island) setField(form, `${p}island`, island);
    if (adult) setField(form, `${p}adult_price`, adult);
    if (child) setField(form, `${p}child_price`, child);
    if (capacity) setField(form, `${p}capacity`, capacity);
    if (transport === "1" || transport === "0")
      setField(form, `${p}transport_available`, transport);
    if (active === "1" || active === "0")
      setCheckbox(form, `${p}active`, active === "1");
  }
}

export function MasterShowsForm({
  products,
  islands,
  highlightId,
  config,
  ticketTypes,
  ticketTypesError = false,
}: {
  products: MasterShowRow[];
  islands: string[];
  highlightId?: string;
  config: ShowOpsConfig;
  ticketTypes: MasterTicketType[];
  ticketTypesError?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const allOn = products.length > 0 && ticked.size === products.length;

  return (
    <form ref={formRef} className="mt-4 space-y-3" onKeyDown={stopEnterSubmit}>
      <input type="hidden" name="tab" value="shows" />
      {[...ticked].map((id) => (
        <input key={id} type="hidden" name="ticked" value={id} />
      ))}
      <div className="sticky top-0 z-10 space-y-3 rounded-xl bg-white/95 p-3 ring-1 ring-slate-200 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={allOn}
              onChange={(e) =>
                setTicked(
                  e.target.checked
                    ? new Set(products.map((p) => p.id))
                    : new Set(),
                )
              }
            />
            Select all
          </label>
          <span className="text-xs text-slate-500">
            {ticked.size || "None"} selected · Select all then Apply to edit
            every show on this list
          </span>
          <button
            type="submit"
            formAction={saveMasterProductsAllAction}
            className="ml-auto rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
          >
            Save all shows
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Bulk prices use each show’s island currency; no currency conversion is
          applied. Blank fields keep the saved values. Applying saves
          immediately.
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            Set island
            <select
              name="bulk_island"
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">Keep</option>
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Set adult standard price"
            name="bulk_adult_price"
            type="number"
            step="0.01"
          />
          <Field
            label="Set child standard price"
            name="bulk_child_price"
            type="number"
            step="0.01"
          />
          <Field label="Set capacity" name="bulk_capacity" type="number" />
          <label className="text-xs font-medium text-slate-600">
            Transport
            <select
              name="bulk_transport"
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">Keep</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Active
            <select
              name="bulk_active"
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="">Keep</option>
              <option value="1">Active</option>
              <option value="0">Archived</option>
            </select>
          </label>
          <button
            type="submit"
            name="intent"
            value="bulk"
            formAction={applyMasterProductsBulkAction}
            disabled={!ticked.size}
            className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              const form = formRef.current;
              if (!form || !ticked.size) return;
              applyBulkToDom(form, [...ticked]);
            }}
          >
            Apply & save selected
          </button>
        </div>
      </div>

      {products.map((p) => {
        const prefix = `${p.id}::`;
        return (
          <div
            key={p.id}
            id={`created-${p.id}`}
            className={`rounded-xl p-3 ${
              highlightId === p.id
                ? "bg-violet-50 ring-2 ring-[var(--show-ops-primary,#7c3aed)]"
                : "bg-slate-50"
            }`}
          >
            <input type="hidden" name="product_ids" value={p.id} />
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                checked={ticked.has(p.id)}
                onChange={(e) => {
                  setTicked((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    return next;
                  });
                }}
              />
              Include in bulk edit
            </label>
            <details open={highlightId === p.id || products.length === 1}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 py-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {p.name}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    · {p.island}
                  </span>
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${p.active === false ? "bg-slate-200 text-slate-600" : "bg-emerald-50 text-emerald-800"}`}
                >
                  {p.active === false ? "Archived" : "Active"}
                </span>
                <span className="text-xs font-medium text-[var(--show-ops-primary,#7c3aed)]">
                  Edit details & prices
                </span>
              </summary>
              <div className="mt-4">
                <ShowProductFields
                  product={p}
                  prefix={prefix}
                  islands={islands}
                  config={config}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name={`${prefix}active`}
                    value="1"
                    defaultChecked={p.active !== false}
                  />{" "}
                  Active — untick and save to archive
                </label>
                <button
                  type="submit"
                  formAction={saveMasterProductOneAction.bind(null, p.id)}
                  className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Save this show
                </button>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                Saving changes the show setup and prices for new bookings. To
                retire a show, untick Active and save; its bookings stay on
                record. Delete is only available when no bookings are linked.
              </p>
              {ticketTypesError ? (
                <p role="alert" className="mt-4 text-sm text-rose-700">
                  Could not load ticket types. Please reload before editing
                  them.
                </p>
              ) : (
                <TicketTypesEditor
                  productId={p.id}
                  showName={p.name}
                  island={p.island}
                  config={config}
                  types={ticketTypes.filter((type) => type.product_id === p.id)}
                />
              )}
              <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-amber-950">
                  Existing bookings & deletion
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-amber-950">
                  Repricing is a separate action: save this show first. It uses
                  the last saved prices and current partner rates, and can
                  change existing totals and balances for past or future
                  bookings that are uncancelled and not invoiced. It does not
                  schedule a future price change.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    formAction={repriceUninvoicedBoundAction.bind(null, p.id)}
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Recalculate existing uncancelled, uninvoiced bookings for "${p.name}" using its last saved prices and current partner rates? This can change totals and balances, including past bookings. Save your price edits first. Invoiced bookings are excluded.`,
                        )
                      )
                        e.preventDefault();
                    }}
                    className="text-xs font-medium text-teal-800 underline"
                  >
                    Reprice existing uninvoiced bookings
                  </button>
                  <button
                    type="submit"
                    formAction={deleteProductAction.bind(null, p.id)}
                    onClick={(e) => {
                      if (
                        !confirm(
                          `Delete "${p.name}"? Only possible if it has no bookings.`,
                        )
                      )
                        e.preventDefault();
                    }}
                    className="text-xs font-medium text-rose-700 underline"
                  >
                    Delete unused show
                  </button>
                </div>
              </details>
            </details>
          </div>
        );
      })}
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      {type === "number" ? (
        <NumberInput
          name={name}
          required={required}
          defaultValue={defaultValue ?? ""}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue ?? undefined}
          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

/** Shared by Add show and the existing show editors so pricing guidance stays consistent. */
export function ShowProductFields({
  product,
  prefix = "",
  islands,
  config,
}: {
  product?: MasterShowRow;
  prefix?: string;
  islands: string[];
  config: ShowOpsConfig;
}) {
  const [island, setIsland] = useState(product?.island || islands[0] || "");
  const currency = showOpsCurrencyFor(config, island);
  const supplement = formatShowOpsMoney(config.transport_supplement, currency);
  const name = (field: string) => `${prefix}${field}`;
  return (
    <div className="space-y-5">
      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">
          1. Show details & schedule
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Show name"
            name={name("name")}
            required
            defaultValue={product?.name}
          />
          <label className="text-xs font-medium text-slate-600">
            Island / location
            <select
              name={name("island")}
              defaultValue={island}
              onChange={(e) => setIsland(e.target.value)}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Base ticket name"
            name={name("ticket_type")}
            defaultValue={product?.ticket_type ?? "standard"}
          />
          <p className="text-xs leading-relaxed text-slate-500 sm:col-span-3">
            This is the physical show and its base ticket. Add more ticket types
            or packages below after saving the show; they share this schedule
            and capacity.
          </p>
          <Field
            label="Capacity per show date"
            name={name("capacity")}
            type="number"
            defaultValue={product?.capacity}
          />
          <Field
            label="Show start time (local)"
            name={name("show_time")}
            type="time"
            defaultValue={
              product?.show_time ? String(product.show_time).slice(0, 5) : ""
            }
          />
          <label className="text-xs font-medium text-slate-600">
            Bus transport
            <select
              name={name("transport_available")}
              defaultValue={product?.transport_available === false ? "0" : "1"}
              className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            >
              <option value="1">Available for this show</option>
              <option value="0">Not available</option>
            </select>
          </label>
          <p className="text-xs leading-relaxed text-slate-500 sm:col-span-3">
            Capacity is the guest limit for this show on each date, including
            infants; blank means no show limit is set. Bus seat availability is
            managed separately. Start time appears on the booking screen and is
            separate from hotel pick-up times.
          </p>
          <div className="sm:col-span-3">
            <p className="text-xs font-medium text-slate-600">
              Regular run days
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SHOW_OPS_WEEKDAYS.map((day) => (
                <label
                  key={day.n}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                >
                  <input
                    type="checkbox"
                    name={name("run_weekday")}
                    value={day.n}
                    defaultChecked={Boolean(
                      product?.run_weekdays?.includes(day.n),
                    )}
                  />
                  {day.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Select the normal days to populate the booking calendar. With none
              selected, no regular future nights are generated; dates already
              booked remain visible.
            </p>
          </div>
        </div>
      </fieldset>
      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">
          2. Base ticket prices · {currency.toUpperCase()}
        </legend>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          All prices below use {currency.toUpperCase()}, the currency for the
          selected island. Changing island does not convert the amounts.
          Standard price is the show-only price when its without-bus field is
          blank.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Adult standard price"
            name={name("adult_price")}
            type="number"
            step="0.01"
            defaultValue={product?.adult_price ?? 0}
          />
          <Field
            label="Child standard price"
            name={name("child_price")}
            type="number"
            step="0.01"
            defaultValue={product?.child_price ?? 0}
          />
          <Field
            label="Infant standard price"
            name={name("infant_price")}
            type="number"
            step="0.01"
            defaultValue={product?.infant_price ?? 0}
          />
        </div>
        <div className="my-3 rounded-lg bg-sky-50 p-3 text-xs leading-relaxed text-sky-950">
          <strong>How bus pricing works</strong>
          <p className="mt-1">
            For each age band, leave the without-bus price blank to use the
            standard price for own-way or private-transfer guests. A bus booking
            then adds the configured supplement ({supplement}) per adult and
            child; infants have no supplement.
          </p>
          <p className="mt-1">
            If you enter a without-bus price, that age band uses the two amounts
            exactly: standard price with bus, without-bus price for own-way or
            private transfer. No supplement is added for that age band. A value
            of 0 is a free ticket, not a blank field.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Adult without bus (optional)"
            name={name("adult_price_no_transport")}
            type="number"
            step="0.01"
            defaultValue={product?.adult_price_no_transport}
          />
          <Field
            label="Child without bus (optional)"
            name={name("child_price_no_transport")}
            type="number"
            step="0.01"
            defaultValue={product?.child_price_no_transport}
          />
          <Field
            label="Infant without bus (optional)"
            name={name("infant_price_no_transport")}
            type="number"
            step="0.01"
            defaultValue={product?.infant_price_no_transport}
          />
        </div>
      </fieldset>
      <fieldset className="rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">
          3. Optional invoice nett fallback · {currency.toUpperCase()}
        </legend>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          For invoice partners, a partner nett percentage other than 100% takes
          priority over these fields. At 100%, the amounts below are used per
          adult and child. Leave them blank to use the calculated guest ticket
          price; 0 means zero nett. These are fixed nett amounts, not commission
          percentages.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Adult nett fallback (optional)"
            name={name("adult_nett")}
            type="number"
            step="0.01"
            defaultValue={product?.adult_nett}
          />
          <Field
            label="Child nett fallback (optional)"
            name={name("child_nett")}
            type="number"
            step="0.01"
            defaultValue={product?.child_nett}
          />
        </div>
      </fieldset>
    </div>
  );
}
