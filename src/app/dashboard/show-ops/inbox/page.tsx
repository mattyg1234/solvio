import { redirect } from "next/navigation";

import { ShowOpsInboxApp } from "@/components/show-ops/inbox/inbox-app";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { getShowOpsRenderContext } from "@/lib/show-ops/access";
import { isUuid } from "@/lib/show-ops/inbox/logic";
import { inboxViewerFromContext } from "@/lib/show-ops/inbox/server";

export const dynamic = "force-dynamic";

/**
 * Customer inbox: every WhatsApp and SMS conversation with guests, through the
 * company's own Twilio. Whole-inbox people see everything; everyone else sees
 * the chats that are theirs or that a teammate has sent them.
 */
export default async function ShowOpsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const ctx = await getShowOpsRenderContext();
  if (!ctx.business.show_ops_enabled) redirect("/dashboard/show-ops/setup");
  const viewer = await inboxViewerFromContext(ctx);
  if (!viewer) redirect("/dashboard/show-ops");
  const sp = await searchParams;

  return (
    <div className="space-y-4">
      <ShowOpsPageHeader
        eyebrow="Team"
        title="Customer inbox"
        subtitle={
          viewer.seesAll
            ? "Every WhatsApp and text with guests: what the Hub sent and what they replied. Take a chat, or send it to someone on the team."
            : "Your WhatsApp and text chats with guests, and the ones a teammate has sent you to accept."
        }
      />
      <ShowOpsInboxApp
        meId={viewer.meId}
        seesAll={viewer.seesAll}
        canSeeBookings={viewer.canSeeBookings}
        canManageSettings={ctx.isOwner || ctx.role === "admin"}
        initialConversationId={isUuid(sp.c) ? sp.c : null}
      />
    </div>
  );
}
