import { removeSellerColleagueAction } from "@/app/dashboard/show-ops/actions";
import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

import { SellerColleagueInviteForm } from "./invite-form";

export default async function PartnerTeamPage() {
  const ctx = await requireShowOpsSellerContext();
  const admin = createSupabaseServiceRoleClient();
  const { data: members } = await admin
    .from("show_ops_members")
    .select("id,user_id,created_at")
    .eq("business_id", ctx.business.id)
    .eq("supplier_id", ctx.supplier.id)
    .eq("role", "seller")
    .order("created_at");

  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id,email,full_name").in("id", ids)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Your office logins</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add people at {ctx.supplier.name} — front desk, manager, whoever books. Type an email and Solvio sends
          their own login. They book at your contracted price. They cannot see other agencies or the MHT office.
        </p>
      </div>
      <SellerColleagueInviteForm />
      <ul className="divide-y text-sm">
        {(members ?? []).map((m) => {
          const p = byId.get(m.user_id);
          const mine = m.user_id === ctx.user.id;
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {p?.email || m.user_id.slice(0, 8)}
                {mine ? <span className="text-slate-500"> · you</span> : null}
              </span>
              {!mine ? (
                <form action={removeSellerColleagueAction}>
                  <input type="hidden" name="member_id" value={m.id} />
                  <button type="submit" className="text-xs text-rose-700 hover:underline">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
        {!members?.length ? <li className="py-2 text-slate-500">No logins yet.</li> : null}
      </ul>
    </div>
  );
}
