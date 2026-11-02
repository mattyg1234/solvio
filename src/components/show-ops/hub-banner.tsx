import Image from "next/image";

import type { HubBrand } from "@/lib/show-ops/hub-brand";

/** The MHT logo on a clean white panel across the top of the Hub home page. */
export function HubBanner({ hub }: { hub: HubBrand }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl bg-white print:hidden"
      style={{ boxShadow: `0 0 0 3px ${hub.primaryColor}, 0 18px 40px -22px ${hub.primaryColor}` }}
    >
      <div className="flex items-center justify-center px-6 py-5 sm:py-6">
        <Image
          src={hub.logoUrl}
          alt="MHT Shows"
          width={320}
          height={320}
          priority
          unoptimized
          className="h-28 w-auto object-contain sm:h-36"
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1.5"
        style={{ background: `linear-gradient(90deg, ${hub.primaryColor}, ${hub.accentColor}, ${hub.primaryColor})` }}
      />
    </div>
  );
}
