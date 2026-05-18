import Link from "next/link";
import { ExternalLink } from "lucide-react";

type DashboardHeaderProps = {
  email: string;
  greetingName?: string | null;
};

export function DashboardHeader({ email, greetingName }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#ebe7f7]/90 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/75">
      <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 md:items-center md:px-8 md:py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#94a3b8]">Workspace</p>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[#0f172a] md:text-2xl">
            {greetingName?.trim() ? `Welcome back, ${greetingName.trim()}` : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-[#64748b]">{email}</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[#ebe7f7] bg-[#fafbff] px-4 py-2.5 text-sm font-semibold text-[#64748b] shadow-sm transition-colors hover:border-[#ddd6fe] hover:text-[#7c3aed]"
        >
          View marketing site
          <ExternalLink className="h-4 w-4 opacity-70" aria-hidden />
        </Link>
      </div>
    </header>
  );
}
