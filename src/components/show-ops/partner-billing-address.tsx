import { COUNTRY_OPTIONS } from "@/lib/show-ops/partner-billing";

export type PartnerBillingValues = {
  legal_name?: string | null;
  tax_id?: string | null;
  invoice_address?: string | null;
  invoice_postal_code?: string | null;
  invoice_city?: string | null;
  invoice_province?: string | null;
  invoice_country_code?: string | null;
  payment_terms_days?: number | null;
  is_person?: boolean | null;
};

const field = "mt-1 w-full rounded-lg border px-2 py-1.5 text-sm";
const label = "text-xs font-medium text-slate-600";

/**
 * The partner's invoicing details, laid out the way a full invoice and Holded's
 * contact need them. Used by both the new-partner and the edit-partner forms.
 * No hooks, so it renders in server and client components alike.
 */
export function PartnerBillingAddressFields({ prefix = "", values = {} }: { prefix?: string; values?: PartnerBillingValues }) {
  const country = values.invoice_country_code || "ES";
  return (
    <fieldset className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-3 sm:grid-cols-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">Invoicing details (needed to send invoices to Holded)</legend>
      <label className={`${label} sm:col-span-2`}>
        Legal name
        <input name={`${prefix}legal_name`} defaultValue={values.legal_name ?? ""} placeholder="As on their tax registration, e.g. TUI España Turismo SL" className={field} />
      </label>
      <label className={label}>
        NIF / CIF / tax ID
        <input
          name={`${prefix}tax_id`}
          defaultValue={values.tax_id ?? ""}
          placeholder="B12345674"
          autoComplete="off"
          spellCheck={false}
          className={`${field} font-mono uppercase`}
        />
      </label>
      <label className={`${label} sm:col-span-3`}>
        Street address
        <input name={`${prefix}invoice_address`} defaultValue={values.invoice_address ?? ""} placeholder="Calle Juan Carlos I, 12" className={field} />
      </label>
      <label className={label}>
        Postcode
        <input name={`${prefix}invoice_postal_code`} defaultValue={values.invoice_postal_code ?? ""} placeholder="35510" inputMode="text" className={field} />
      </label>
      <label className={label}>
        Town / city
        <input name={`${prefix}invoice_city`} defaultValue={values.invoice_city ?? ""} placeholder="Puerto del Carmen" className={field} />
      </label>
      <label className={label}>
        Province
        <input name={`${prefix}invoice_province`} defaultValue={values.invoice_province ?? ""} placeholder="Las Palmas" className={field} />
      </label>
      <label className={label}>
        Country
        <select name={`${prefix}invoice_country_code`} defaultValue={country} className={field}>
          {(COUNTRY_OPTIONS.some((c) => c.code === country) ? COUNTRY_OPTIONS : [{ code: country, name: country }, ...COUNTRY_OPTIONS]).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Days to pay invoices
        <input
          name={`${prefix}payment_terms_days`}
          type="number"
          min={0}
          max={365}
          step={1}
          defaultValue={values.payment_terms_days ?? ""}
          placeholder="Workspace default"
          className={field}
        />
      </label>
      <label className={label}>
        This partner is
        <select name={`${prefix}is_person`} defaultValue={values.is_person ? "1" : "0"} className={field}>
          <option value="0">A company</option>
          <option value="1">A person (autónomo)</option>
        </select>
      </label>
    </fieldset>
  );
}
