import Image from "next/image";

import type { HubBrand } from "@/lib/show-ops/hub-brand";

/** MHT's own show banner from musichalltavern.com across the top of the Hub home page. */
export function HubBanner({ hub }: { hub: HubBrand }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl print:hidden"
      style={{ boxShadow: `0 0 0 3px ${hub.primaryColor}, 0 18px 40px -22px ${hub.primaryColor}` }}
    >
      <div className="relative aspect-[1536/551] max-h-72 w-full">
        <Image
          src={hub.bannerPhoto}
          alt="MHT Shows cast"
          fill
          priority
          sizes="(min-width: 1024px) 70vw, 100vw"
          className="object-cover object-top"
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
