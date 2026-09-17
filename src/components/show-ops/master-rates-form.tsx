export type MasterRateRow = {
  id: string;
  name: string;
  rate_type: "sale" | "invoice";
  commission_percent: number | null;
  active: boolean;
};

export function MasterRatesForm({ rates }: { rates: MasterRateRow[] }) {
  const live = rates.filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name));
  const retired = rates.filter((r) => !r.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mt-4 space-y-6">
      <RateTable title="Live commission cards" rows={live} empty="No live rate cards." />
      {retired.length ? <RateTable title="Retired / not used" rows={retired} empty="" /> : null}
    </div>
  );
}

function RateTable({ title, rows, empty }: { title: string; rows: MasterRateRow[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Commission</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                <td className="px-3 py-2 capitalize text-slate-600">{r.rate_type === "sale" ? "Sale (pay now)" : "Invoice"}</td>
                <td className="px-3 py-2 tabular-nums text-slate-700">
                  {r.commission_percent == null ? "—" : `${Number(r.commission_percent)}%`}
                </td>
              </tr>
            ))}
            {!rows.length && empty ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                  {empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
