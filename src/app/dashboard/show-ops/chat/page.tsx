import { redirect } from "next/navigation";

import { ShowOpsChatApp } from "@/components/show-ops/chat/chat-app";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { getShowOpsRenderContext } from "@/lib/show-ops/access";
import { isUuid } from "@/lib/show-ops/chat/logic";
import { chatViewerFromContext } from "@/lib/show-ops/chat/server";

export const dynamic = "force-dynamic";

/**
 * Team chat: a Team channel with everyone on staff, direct messages and named
 * groups, with bookings sent in as cards. Every staff role gets it; partner
 * logins never reach Show Ops pages at all.
 */
export default async function ShowOpsChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await getShowOpsRenderContext();
  if (!ctx.business.show_ops_enabled) redirect("/dashboard/show-ops/setup");
  const viewer = chatViewerFromContext(ctx);
  if (!viewer) redirect("/dashboard/show-ops");
  const sp = await searchParams;
  const initialChannelId = isUuid(sp.c) ? sp.c : null;

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Team"
        title="Chat"
        subtitle="Talk to the office and the door, and send a booking in to ask about it."
      />
      <ShowOpsChatApp
        meId={viewer.meId}
        canSeeBookings={viewer.canSeeBookings}
        initialChannelId={initialChannelId}
      />
    </div>
  );
}
