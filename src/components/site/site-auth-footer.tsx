import Link from "next/link";

import { SUPPORT_EMAIL, supportMailtoHref } from "@/lib/site-contact";

export function SiteAuthFooter() {
  return (
    <footer className="border-t border-[#ebe7f7] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#64748b]">
      <p>
        <Link href="/privacy" className="font-semibold text-[#475569] hover:text-[#7c3aed]">
          Privacy
        </Link>
        <span className="mx-2 text-[#cbd5e1]">·</span>
        <Link href="/terms" className="font-semibold text-[#475569] hover:text-[#7c3aed]">
          Terms
        </Link>
        <span className="mx-2 text-[#cbd5e1]">·</span>
        <a href={supportMailtoHref()} className="font-semibold text-[#475569] hover:text-[#7c3aed]">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </footer>
  );
}
