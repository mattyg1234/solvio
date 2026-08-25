import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";
import { merchantNotifyPhoneFromDetails } from "@/lib/merchant-notify-phone";
import { sendNewBookingNotificationEmail } from "@/lib/notifications/booking-emails";
import { sendNewBookingNotificationSms } from "@/lib/notifications/booking-sms";
import { sendNewBookingNotificationWhatsApp } from "@/lib/notifications/booking-whatsapp";
import { isTwilioWhatsAppConfigured } from "@/lib/notifications/booking-whatsapp";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type NotifyMerchantNewBookingParams = {
  bookingSlug: string;
  guestName: string;
  guestEmail: string;
  bookingKind: string;
  requestedDate?: string;
  preferredTime?: string;
  guestCount?: string;
  notes?: string;
  autoConfirmed?: boolean;
};

/** Email + SMS (+ WhatsApp when configured) to the business owner after a guest booking. */
export async function notifyMerchantNewBooking(
  params: NotifyMerchantNewBookingParams,
): Promise<{ emailSent: boolean; smsSent: boolean; whatsappSent: boolean }> {
  const slug = params.bookingSlug.trim();
  if (!slug) return { emailSent: false, smsSent: false, whatsappSent: false };

  const siteUrl = getDeploymentSiteUrl();
  let emailSent = false;
  let smsSent = false;
  let whatsappSent = false;

  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: biz } = await admin
      .from("businesses")
      .select("owner_id, name, booking_flow_details")
      .eq("booking_slug", slug)
      .maybeSingle();

    if (!biz?.owner_id) return { emailSent, smsSent, whatsappSent };

    const merchantPhone = merchantNotifyPhoneFromDetails(biz.booking_flow_details);

    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", biz.owner_id)
      .maybeSingle();

    if (ownerProfile?.email) {
      const emailResult = await sendNewBookingNotificationEmail({
        merchantEmail: ownerProfile.email,
        merchantName: biz.name,
        guestName: params.guestName,
        guestEmail: params.guestEmail,
        bookingKind: params.bookingKind,
        requestedDate: params.requestedDate,
        preferredTime: params.preferredTime,
        guestCount: params.guestCount,
        notes: params.notes,
        dashboardUrl: siteUrl,
        autoConfirmed: params.autoConfirmed,
      });
      emailSent = emailResult.ok;
      if (!emailResult.ok) {
        console.error("[merchant-new-booking] email failed:", emailResult.message);
      }
    }

    if (merchantPhone) {
      const notifyPayload = {
        merchantPhoneE164: merchantPhone,
        merchantName: biz.name,
        guestName: params.guestName,
        bookingKind: params.bookingKind,
        requestedDate: params.requestedDate,
        preferredTime: params.preferredTime,
        guestCount: params.guestCount,
        dashboardUrl: siteUrl,
        autoConfirmed: params.autoConfirmed,
      };

      const smsResult = await sendNewBookingNotificationSms(notifyPayload);
      smsSent = smsResult.ok;
      if (!smsResult.ok && smsResult.reason !== "not_configured") {
        console.error("[merchant-new-booking] owner SMS failed:", smsResult.message);
      }

      if (isTwilioWhatsAppConfigured()) {
        const waResult = await sendNewBookingNotificationWhatsApp(notifyPayload);
        whatsappSent = waResult.ok;
        if (!waResult.ok && waResult.reason !== "not_configured" && waResult.reason !== "invalid_recipient") {
          console.error("[merchant-new-booking] WhatsApp failed:", waResult.message);
        }
      }
    }
  } catch (err) {
    console.error("[merchant-new-booking] notify error:", err);
  }

  return { emailSent, smsSent, whatsappSent };
}
