import { Crown } from "lucide-react";

import { removeSellerColleagueAction } from "@/app/dashboard/show-ops/actions";
import { requirePartnerAdmin } from "@/lib/show-ops/access";
import { SellerColleagueInviteForm } from "./invite-form";

type TeamMember = {
  member_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  partner_admin: boolean;
};

export default async function PartnerTeamPage() {
  const ctx = await requirePartnerAdmin();
  const { data, error } = await ctx.supabase.rpc("show_ops_partner_team", {
    p_business_id: ctx.business.id,
    p_supplier_id: ctx.supplier.id,
  });
  const members = (data ?? []) as TeamMember[];

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          Your organisation’s sellers
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Invite sellers to {ctx.supplier.name}. Each receives a private sign-in
          link and can see only their own bookings and results. As an admin, you
          can see the organisation’s results and manage seller access.
        </p>
      </div>
      <SellerColleagueInviteForm />
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          We could not load your team. Please try again.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {members.map((member) => {
            const mine = member.user_id === ctx.user.id;
            return (
              <li
                key={member.member_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 break-all font-medium text-slate-900">
                    {member.full_name || member.email || "Seller"}
                    {mine ? (
                      <span className="font-normal text-slate-500">· you</span>
                    ) : null}
                    {member.partner_admin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        <Crown aria-hidden="true" className="h-3.5 w-3.5" />{" "}
                        Admin
                      </span>
                    ) : null}
                  </p>
                  {member.full_name && member.email ? (
                    <p className="mt-1 break-all text-xs text-slate-500">
                      {member.email}
                    </p>
                  ) : null}
                </div>
                {!mine && !member.partner_admin ? (
                  <form action={removeSellerColleagueAction}>
                    <input
                      type="hidden"
                      name="member_id"
                      value={member.member_id}
                    />
                    <button
                      type="submit"
                      className="rounded-lg px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      aria-label={`Remove access for ${member.full_name || member.email || "seller"}`}
                    >
                      Remove access
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
          {!members.length ? (
            <li className="py-3 text-slate-500">No seller logins found.</li>
          ) : null}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Removing a seller ends their access and keeps their booking history.
        Contact the office to change organisation administrators.
      </p>
    </div>
  );
}
