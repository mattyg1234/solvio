import Image from "next/image";
import Link from "next/link";
import { Crown } from "lucide-react";

import { requireShowOpsSellerContext } from "@/lib/show-ops/access";

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireShowOpsSellerContext();
  const { branding, supplier } = ctx;

  return (
    <div
      className="min-h-screen bg-slate-50 px-4 py-6"
      style={
        {
          ["--show-ops-primary" as string]: branding.primaryColor,
          ["--show-ops-accent" as string]: branding.accentColor,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              <span className="block h-10 w-10 overflow-hidden rounded-xl">
                <Image
                  src="/brand/icon-192.png"
                  alt=""
                  width={40}
                  height={40}
                />
              </span>
            )}
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {branding.displayName}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {supplier.name}
                {ctx.partnerAdmin ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                    <Crown aria-hidden="true" className="h-3.5 w-3.5" /> Admin
                  </span>
                ) : (
                  <span>· Seller</span>
                )}
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-medium">
            <Link
              href="/partner"
              className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200"
            >
              {ctx.partnerAdmin ? "Organisation bookings" : "My bookings"}
            </Link>
            <Link
              href="/partner/new"
              className="rounded-full px-3 py-1.5 text-white"
              style={{ backgroundColor: branding.primaryColor }}
            >
              New booking
            </Link>
            <Link
              href="/partner/password"
              className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200"
            >
              Password
            </Link>
            {ctx.partnerAdmin ? (
              <Link
                href="/partner/team"
                className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200"
              >
                Team
              </Link>
            ) : null}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
