import Link from "next/link";

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-[#ebe7f7] bg-[#f8fafc] py-14">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-md space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-sm font-bold text-white">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight">Solvio</span>
          </div>
          <p className="text-[15px] leading-relaxed text-[#64748b]">
            Your AI receptionist for restaurants, salons, cafés and tourist-facing teams across Spain — built for growth, not jargon.
          </p>
          <p className="text-sm font-medium text-[#7c3aed]">
            <a href="mailto:hello@solvio.es" className="underline-offset-4 hover:underline">
              hello@solvio.es
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-10 text-sm">
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">Product</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <Link href="#growth" className="hover:text-[#7c3aed]">
                  What you get
                </Link>
              </li>
              <li>
                <Link href="#demo" className="hover:text-[#7c3aed]">
                  Voice demo
                </Link>
              </li>
              <li>
                <Link href="#proof" className="hover:text-[#7c3aed]">
                  Results
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3">
            <p className="font-semibold text-[#0f172a]">Company</p>
            <ul className="space-y-2 text-[#64748b]">
              <li>
                <span className="cursor-default">EU hosting-ready</span>
              </li>
              <li>
                <span className="cursor-default">Spanish & English</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-6xl border-t border-[#ebe7f7] px-4 pt-8 text-center text-xs text-[#94a3b8] sm:px-6 sm:text-left">
        © {new Date().getFullYear()} Solvio. Built for busy shop floors — not dashboards.
      </div>
    </footer>
  );
}
