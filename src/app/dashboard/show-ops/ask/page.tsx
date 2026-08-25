import { OpsBrainChat } from "@/components/show-ops/ops-brain-chat";
import { ShowOpsPageHeader } from "@/components/show-ops/show-ops-page-header";
import { requireShowOpsEnabled } from "@/lib/show-ops/access";

export default async function ShowOpsAskPage() {
  const ctx = await requireShowOpsEnabled();

  return (
    <div className="space-y-6">
      <ShowOpsPageHeader
        eyebrow="Operations"
        title="Ops Brain"
        subtitle={`Chat with ${ctx.branding.displayName}'s live data — bookings, bus seats, unpaid deposits. Create bookings by confirming in the chat.`}
      />
      <OpsBrainChat displayName={ctx.branding.displayName} primaryColor={ctx.branding.primaryColor} />
    </div>
  );
}
