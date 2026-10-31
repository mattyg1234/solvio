import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import type { HubBrand } from "@/lib/show-ops/hub-brand";

/** The sign in page as MHT Shows' own hub: their logo, colours and islands, no Solvio marketing. */
export function HubLoginPage({
  brand,
  authCallbackError,
  redirectTo,
}: {
  brand: HubBrand;
  authCallbackError?: string;
  redirectTo: string;
}) {
  const { primaryColor: pink, accentColor: yellow } = brand;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#12041a] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 15% -10%, ${pink}55, transparent 50%), radial-gradient(ellipse at 95% 105%, ${yellow}26, transparent 45%), radial-gradient(ellipse at 50% 120%, ${pink}22, transparent 60%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${pink}, ${yellow}, ${pink})` }}
      />

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 py-12 sm:py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full bg-white/95 p-3 shadow-2xl"
            style={{ boxShadow: `0 0 0 4px ${pink}, 0 0 48px -6px ${pink}` }}
          >
            <Image
              src={brand.logoUrl}
              alt="MHT Shows"
              width={192}
              height={192}
              unoptimized
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              The <span style={{ color: pink }}>MHT</span> Hub
            </h1>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">{brand.company}</p>
          </div>
          <ul className="flex flex-wrap justify-center gap-2" aria-label="Islands">
            {brand.islands.map((island) => (
              <li
                key={island}
                className="rounded-full border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: `${yellow}66`, color: yellow, backgroundColor: `${yellow}12` }}
              >
                {island}
              </li>
            ))}
          </ul>
        </div>

        <section className="w-full rounded-[26px] bg-white p-6 text-[#0f172a] shadow-[0_30px_90px_-40px_rgba(0,0,0,0.9)] sm:p-8">
          <div className="mb-6 space-y-1.5">
            <h2 className="text-xl font-bold tracking-tight">Welcome back</h2>
            <p className="text-[15px] leading-relaxed text-[#64748b]">
              Bookings, partners, invoices and show nights for all three islands.
            </p>
          </div>
          <LoginForm
            authCallbackError={authCallbackError}
            redirectTo={redirectTo}
            hub={{ primaryColor: pink, contactEmail: brand.contactEmail }}
          />
        </section>

        <p className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-white/60">MHT Team Only</p>
      </main>

      <footer className="relative border-t border-white/10 px-4 py-5 text-center text-xs text-white/45">
        <a href={brand.website} className="font-semibold text-white/70 hover:text-white">
          musichalltavern.com
        </a>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:text-white">
          Privacy
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-white">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <span>Powered by Solvio</span>
      </footer>
    </div>
  );
}
