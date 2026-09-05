import Link from "next/link";
import { redirect } from "next/navigation";

import { enableShowOpsAction } from "@/app/dashboard/show-ops/actions";
import { requireGlobalShowOpsAdmin } from "@/lib/show-ops/access";

export default async function ShowOpsSetupPage() {
  const ctx = await requireGlobalShowOpsAdmin();
  if (ctx.business.show_ops_enabled) redirect("/dashboard/show-ops");

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Enable Solvio Ops</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bookings, passenger / bus lists, deposits, supplier invoices and reports — white-labelled for your
          brand. Free while we work with design partners. Customise regions, ticket labels and booking
          questions after enable.
        </p>
      </div>

      <form action={enableShowOpsAction} className="space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Display name
          <input
            name="display_name"
            defaultValue={ctx.business.name}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Starting template</legend>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
            <input type="radio" name="seed_preset" value="generic" defaultChecked className="mt-1" />
            <span>
              <span className="font-medium text-slate-900">Generic operator</span>
              <span className="mt-0.5 block text-sm text-slate-600">
                Boat parties, tours, day trips — editable regions and a starter “special requests” question.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50">
            <input type="radio" name="seed_preset" value="mht" className="mt-1" />
            <span>
              <span className="font-medium text-slate-900">Canaries show desk (MHT-style)</span>
              <span className="mt-0.5 block text-sm text-slate-600">
                Lanzarote, Fuerteventura, Tenerife, UK Tour · island wording.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="block text-sm font-medium text-slate-700">
          Regions / areas (one per line — used if Generic)
          <textarea
            name="locations"
            rows={3}
            placeholder={"Tenerife South\nTenerife North"}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
        className="w-full rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Enable Ops
        </button>
      </form>

      <p className="text-center text-xs text-slate-500">
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
