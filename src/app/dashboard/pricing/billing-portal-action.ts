"use server";

import { redirect } from "next/navigation";
import { stripeClient } from "@/lib/stripe-client";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function openBillingPortalAction() {
  const stripe = stripeClient();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!stripe || !user) redirect("/dashboard/pricing");

  const admin = createSupabaseServiceRoleClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("stripe_customer_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const customerId = (biz as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!customerId) redirect("/dashboard/pricing?portal=no_customer");

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/dashboard/pricing`,
  });

  redirect(session.url);
}
