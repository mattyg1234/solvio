"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import {
  applyMasterProductsBulkAction,
  repriceUninvoicedBoundAction,
  saveMasterProductOneAction,
  saveMasterProductsAllAction,
} from "@/app/dashboard/show-ops/actions";
import { NumberInput } from "@/components/ui/number-input";
import { SHOW_OPS_WEEKDAYS } from "@/lib/show-ops/nights";

function stopEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter") return;
  const el = e.target;
  if (el instanceof HTMLButtonElement || el instanceof HTMLTextAreaElement) return;
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
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
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
    if (transport === "1" || transport === "0") setCheckbox(form, `${p}transport_available`, transport === "1");
    if (active === "1" || active === "0") setCheckbox(form, `${p}active`, active === "1");
  }
}

export function MasterShowsForm({
  products,
  islands,
  highlightId,
}: {
  products: MasterShowRow[];
  islands: string[];
  highlightId?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const allOn = products.length > 0 && ticked.size === products.length;

  return (
    <form
      ref={formRef}
      className="mt-4 space-y-3"
      onKeyDown={stopEnterSubmit}
    >
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
              onChange={(e) => setTicked(e.target.checked ? new Set(products.map((p) => p.id)) : new Set())}
            />
            Tick all
          </label>
          <span className="text-xs text-slate-500">
            {ticked.size || "None"} selected · Tick all then Apply to edit every show on this list
          </span>
          <button
            type="submit"
            formAction={saveMasterProductsAllAction}
            className="ml-auto rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
          >
            Save all shows
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">
            Set island
            <select name="bulk_island" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              {islands.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
          <Field label="Set adult €" name="bulk_adult_price" type="number" step="0.01" />
          <Field label="Set child €" name="bulk_child_price" type="number" step="0.01" />
          <Field label="Set capacity" name="bulk_capacity" type="number" />
          <label className="text-xs font-medium text-slate-600">
            Transport
            <select name="bulk_transport" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Active
            <select name="bulk_active" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
              <option value="">Keep</option>
              <option value="1">Active</option>
              <option value="0">Off</option>
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
            Apply to ticked
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
              Tick to include in bulk edit
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Show name" name={`${prefix}name`} required defaultValue={p.name} />
              <label className="text-xs font-medium text-slate-600">
                Island
                <select
                  name={`${prefix}island`}
                  defaultValue={p.island}
                  className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
                >
                  {islands.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Ticket type" name={`${prefix}ticket_type`} defaultValue={p.ticket_type} />
              <Field
                label="Adult € with transport"
                name={`${prefix}adult_price`}
                type="number"
                step="0.01"
                defaultValue={p.adult_price}
              />
              <Field
                label="Child € with transport"
                name={`${prefix}child_price`}
                type="number"
                step="0.01"
                defaultValue={p.child_price}
              />
              <Field
                label="Infant € with transport"
                name={`${prefix}infant_price`}
                type="number"
                step="0.01"
                defaultValue={p.infant_price}
              />
              <Field
                label="Adult € no transport"
                name={`${prefix}adult_price_no_transport`}
                type="number"
                step="0.01"
                defaultValue={p.adult_price_no_transport}
              />
              <Field
                label="Child € no transport"
                name={`${prefix}child_price_no_transport`}
                type="number"
                step="0.01"
                defaultValue={p.child_price_no_transport}
              />
              <Field
                label="Infant € no transport"
                name={`${prefix}infant_price_no_transport`}
                type="number"
                step="0.01"
                defaultValue={p.infant_price_no_transport}
              />
              <Field label="Adult nett €" name={`${prefix}adult_nett`} type="number" step="0.01" defaultValue={p.adult_nett} />
              <Field label="Child nett €" name={`${prefix}child_nett`} type="number" step="0.01" defaultValue={p.child_nett} />
              <Field label="Capacity" name={`${prefix}capacity`} type="number" defaultValue={p.capacity} />
              <Field label="Show starts" name={`${prefix}show_time`} type="time" defaultValue={p.show_time ? String(p.show_time).slice(0, 5) : ""} />
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input type="checkbox" name={`${prefix}transport_available`} value="1" defaultChecked={p.transport_available} />{" "}
                Transport available
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name={`${prefix}active`} value="1" defaultChecked={p.active !== false} /> Active
              </label>
              <div className="sm:col-span-3">
                <p className="text-xs font-medium text-slate-600">Runs on</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {SHOW_OPS_WEEKDAYS.map((d) => (
                    <label
                      key={d.n}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200"
                    >
                      <input
                        type="checkbox"
                        name={`${prefix}run_weekday`}
                        value={d.n}
                        defaultChecked={Boolean(p.run_weekdays?.includes(d.n))}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                formAction={saveMasterProductOneAction.bind(null, p.id)}
                className="self-end rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white"
              >
                Save this show
              </button>
            </div>
            <button
              type="submit"
              formAction={repriceUninvoicedBoundAction.bind(null, p.id)}
              className="mt-2 text-xs font-medium text-teal-800 underline"
            >
              Reprice uninvoiced bookings from this show’s prices
            </button>
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
