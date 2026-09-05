"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveExtraAction,
  archiveExtraAction,
} from "@/app/dashboard/show-ops/extra-actions";
import { NumberInput } from "@/components/ui/number-input";
import { formatShowOpsMoney } from "@/lib/show-ops/calc";
import { showOpsCurrencyFor } from "@/lib/show-ops/config";
import type { ShowExtra } from "@/lib/show-ops/extras";
import type { ShowOpsConfig } from "@/lib/show-ops/types";

export type MasterExtra = Omit<ShowExtra, "business_id">;
const BASIS_LABELS = {
  per_booking: "Once per booking",
  per_person: "Per guest, including infants",
  quantity: "Chosen quantity (1–100)",
} as const;

export function ExtrasEditor({
  productId,
  showName,
  island,
  config,
  extras,
}: {
  productId: string;
  showName: string;
  island: string;
  config: ShowOpsConfig;
  extras: MasterExtra[];
}) {
  return (
    <section
      className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50/50 p-4"
      aria-label={`Optional extras for ${showName}`}
    >
      <h4 className="font-semibold text-slate-900">Optional extras</h4>
      <p className="text-sm text-slate-600">
        Create optional additions for any ticket type at {showName}. Guests can
        have a ticket without an extra; selected extras add to the booking
        price.
      </p>
      {extras.map((extra) => (
        <details
          key={JSON.stringify(extra)}
          className="rounded-xl border border-slate-200 bg-white p-3"
        >
          <summary className="cursor-pointer text-sm font-medium">
            {extra.name}{" "}
            <span className="font-normal text-slate-500">
              ·{" "}
              {formatShowOpsMoney(
                extra.unit_price,
                showOpsCurrencyFor(config, island),
              )}{" "}
              · {BASIS_LABELS[extra.charge_basis]}
              {!extra.active ? " · Archived" : ""}
            </span>
          </summary>
          <ExtraFields
            productId={productId}
            island={island}
            config={config}
            existing={extra}
          />
        </details>
      ))}
      <details className="rounded-xl border border-dashed border-sky-300 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--show-ops-primary,#7c3aed)]">
          + Add optional extra
        </summary>
        <ExtraFields productId={productId} island={island} config={config} />
      </details>
    </section>
  );
}

/** Unnamed fields keep this separate from the surrounding show bulk form. */
function ExtraFields({
  productId,
  island,
  config,
  existing,
}: {
  productId: string;
  island: string;
  config: ShowOpsConfig;
  existing?: MasterExtra;
}) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [price, setPrice] = useState<number | "">(existing?.unit_price ?? "");
  const [basis, setBasis] = useState<ShowExtra["charge_basis"]>(
    existing?.charge_basis ?? "per_booking",
  );
  const [commissionable, setCommissionable] = useState(
    existing?.commissionable ?? true,
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function submit(archive = false) {
    if (pending) return;
    setError("");
    setStatus("");
    if (!archive && (!name.trim() || price === "")) {
      setError(
        "Enter an extra name and its price. Use 0 only when it is free.",
      );
      return;
    }
    setPending(true);
    const data = new FormData();
    data.set("product_id", productId);
    if (existing) data.set("id", existing.id);
    data.set("name", name.trim());
    data.set("description", description.trim());
    data.set("unit_price", String(price));
    data.set("charge_basis", basis);
    data.set("commissionable", commissionable ? "1" : "0");
    data.set("active", active ? "1" : "0");
    try {
      if (archive) await archiveExtraAction(data);
      else await saveExtraAction(data);
      setStatus(
        archive
          ? "Extra archived. Existing bookings keep their recorded extra."
          : "Extra saved for new selections.",
      );
      if (!existing) {
        setName("");
        setDescription("");
        setPrice("");
        setBasis("per_booking");
        setCommissionable(true);
        setActive(true);
      }
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save this extra. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div
      className="mt-4 space-y-3"
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
          Extra name
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Unit price · {showOpsCurrencyFor(config, island).toUpperCase()}
          <NumberInput
            value={price}
            min={0}
            onValueChange={setPrice}
            disabled={pending}
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">
          Description (optional)
          <textarea
            value={description}
            maxLength={1000}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          How it is charged
          <select
            value={basis}
            onChange={(e) =>
              setBasis(e.target.value as ShowExtra["charge_basis"])
            }
            disabled={pending}
            className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
          >
            {Object.entries(BASIS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {basis === "per_person" ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          This charges for every adult, child and infant on the booking.
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={commissionable}
          onChange={(e) => setCommissionable(e.target.checked)}
          disabled={pending}
        />
        Apply partner commission to this extra
      </label>
      <p className="text-xs leading-relaxed text-slate-500">
        When selected, invoice partners pay their usual nett percentage of this
        extra. When unticked, they are invoiced the full extra price. This does
        not change the guest price.
      </p>
      {existing ? (
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={pending}
          />
          Active for new selections
        </label>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending}
          className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : existing ? "Save extra" : "Add extra"}
        </button>
        {existing?.active ? (
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={pending}
            className="rounded-xl px-3 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            Archive extra
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
        Save show or island changes above first, then save each extra
        separately. Archiving keeps extras already recorded on bookings.
      </p>
    </div>
  );
}
