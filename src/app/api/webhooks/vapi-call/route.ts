import { NextResponse } from "next/server";

import { judgeCallAgainstCriteria } from "@/lib/call-success-judge";
import { extractLeadIntakeFromTranscript } from "@/lib/campaign-lead-extraction";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSolvioVapiWebhookSecret } from "@/lib/voice-platform-env";

export const runtime = "nodejs";

type VapiMsg = Record<string, unknown>;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Dig transcript out of wherever Vapi decided to put it this week. */
function extractTranscript(msg: VapiMsg): string {
  // 1. Top-level transcript on the message object (end-of-call-report)
  const topTx = asString(msg.transcript);
  if (topTx.trim()) return topTx.trim();

  // 2. artifact.transcript
  const artifact = msg.artifact as VapiMsg | undefined;
  if (artifact) {
    const artTx = asString(artifact.transcript);
    if (artTx.trim()) return artTx.trim();
    // artifact.messages array
    const artMsgs = artifact.messages;
    if (Array.isArray(artMsgs)) {
      const built = buildFromMessages(artMsgs as VapiMsg[]);
      if (built) return built;
    }
  }

  // 3. call.transcript
  const call = msg.call as VapiMsg | undefined;
  if (call) {
    const callTx = asString(call.transcript);
    if (callTx.trim()) return callTx.trim();
    // call.messages array
    if (Array.isArray(call.messages)) {
      const built = buildFromMessages(call.messages as VapiMsg[]);
      if (built) return built;
    }
    // call.artifact
    const callArtifact = call.artifact as VapiMsg | undefined;
    if (callArtifact) {
      const caTx = asString(callArtifact.transcript);
      if (caTx.trim()) return caTx.trim();
    }
  }

  return "";
}

function buildFromMessages(messages: VapiMsg[]): string {
  return messages
    .map((m) => {
      const text = asString(m.message) || asString(m.content) || asString(m.text);
      const role = m.role === "assistant" ? "AI" : m.role === "user" ? "Caller" : asString(m.role);
      return text.trim() ? `${role}: ${text.trim()}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Extract summary from wherever Vapi puts it. */
function extractSummary(msg: VapiMsg): string {
  const top = asString(msg.summary);
  if (top.trim()) return top.trim();
  const call = msg.call as VapiMsg | undefined;
  if (call) {
    const cs = asString(call.summary);
    if (cs.trim()) return cs.trim();
    const analysis = call.analysis as VapiMsg | undefined;
    if (analysis) return asString(analysis.summary).trim();
  }
  return "";
}

/** Extract timing/cost from call obj or message top-level. */
function extractCallField(msg: VapiMsg, field: string): unknown {
  const call = msg.call as VapiMsg | undefined;
  if (call && call[field] !== undefined) return call[field];
  return msg[field];
}

/** Extract metadata (always in call.metadata). */
function extractMetadata(msg: VapiMsg): Record<string, unknown> {
  const call = msg.call as VapiMsg | undefined;
  const meta = call?.metadata;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

/** Extract call ID from call.id or msg.callId. */
function extractCallId(msg: VapiMsg): string {
  const call = msg.call as VapiMsg | undefined;
  return asString(call?.id) || asString(msg.callId) || asString(msg.id);
}

export async function POST(req: Request) {
  // Optional shared-secret auth (configure in Vapi → Server URL → Secret).
  const expected = getSolvioVapiWebhookSecret();
  if (expected) {
    const provided = req.headers.get("x-vapi-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    if (provided !== expected) {
      return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  const msg: VapiMsg = (body && typeof body === "object" && "message" in body
    ? (body as { message: VapiMsg }).message
    : (body as VapiMsg)) ?? {};

  const type = asString(msg.type);
  // Only act on end-of-call events. Skip status-update (fires too early, no transcript yet).
  if (type !== "end-of-call-report" && type !== "call.ended") {
    return NextResponse.json({ ok: true, ignored: type || "unknown" });
  }

  const vapiCallId = extractCallId(msg);
  if (!vapiCallId) return NextResponse.json({ ok: true, ignored: "no call id" });

  const metadata = extractMetadata(msg);
  const businessId = asString(metadata.solvio_business_id);
  const campaignId = asString(metadata.solvio_campaign_id);
  const leadId = asString(metadata.solvio_lead_id);
  const venueCalendarBookingId = asString(metadata.solvio_venue_calendar_booking_id);
  const bookingRequestId = asString(metadata.solvio_booking_request_id);
  const callPurpose = asString(metadata.solvio_call_purpose);

  const admin = createSupabaseServiceRoleClient();

  const startedAtRaw = asString(extractCallField(msg, "startedAt"));
  const endedAtRaw = asString(extractCallField(msg, "endedAt"));
  const startedAt = startedAtRaw ? new Date(startedAtRaw).toISOString() : null;
  const endedAt = endedAtRaw ? new Date(endedAtRaw).toISOString() : new Date().toISOString();
  let durationSec = 0;
  if (startedAt && endedAt) durationSec = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const transcript = extractTranscript(msg);
  const summary = extractSummary(msg);
  const costRaw = extractCallField(msg, "cost");
  const costCents = typeof costRaw === "number" ? Math.round(costRaw * 100) : 0;
  const endedReason = asString(extractCallField(msg, "endedReason"));
  const callRecap = summary || (transcript ? transcript.slice(0, 800) : "");

  // Find existing call_log row (placed when we dialled the guest or lead).
  const { data: existing } = await admin
    .from("voice_call_logs")
    .select("id, campaign_id, business_id, lead_id, venue_calendar_booking_id, booking_request_id, call_purpose")
    .eq("vapi_call_id", vapiCallId)
    .maybeSingle();

  // Pull success criteria for judge (if we have a campaign)
  let successCriteria = "";
  if (campaignId || existing?.campaign_id) {
    const { data: c } = await admin
      .from("voice_campaigns")
      .select("success_criteria")
      .eq("id", campaignId || existing?.campaign_id || "")
      .maybeSingle();
    successCriteria = asString(c?.success_criteria);
  }

  // Judge the call
  const judge = await judgeCallAgainstCriteria({
    successCriteria,
    transcript,
    endedReason,
  });
  const verdict = judge.ok ? judge.verdict : null;
  const reasoning = judge.ok ? judge.reasoning : judge.message;

  // Update or insert call log
  if (existing) {
    await admin
      .from("voice_call_logs")
      .update({
        ended_at: endedAt,
        duration_seconds: durationSec,
        duration_minutes_billable: Math.ceil(durationSec / 60),
        transcript_summary: summary || (transcript ? transcript.slice(0, 500) : null),
        raw_transcript: transcript ? { text: transcript } : null,
        cost_cents: costCents,
        outcome: verdict === "voicemail" ? "voicemail" : verdict === "no_answer" ? "dropped" : "answered",
        judge_verdict: verdict,
        judge_reasoning: reasoning,
        venue_calendar_booking_id: existing.venue_calendar_booking_id ?? (venueCalendarBookingId || null),
        booking_request_id: existing.booking_request_id ?? (bookingRequestId || null),
        call_purpose: existing.call_purpose ?? (callPurpose || null),
      })
      .eq("id", existing.id);
  } else if (businessId) {
    await admin.from("voice_call_logs").insert({
      business_id: businessId,
      campaign_id: campaignId || null,
      lead_id: leadId || null,
      direction: "outbound",
      vapi_call_id: vapiCallId,
      caller_phone: asString((extractCallField(msg, "customer") as Record<string,unknown>)?.number),
      caller_name: asString((extractCallField(msg, "customer") as Record<string,unknown>)?.name),
      started_at: startedAt ?? endedAt,
      ended_at: endedAt,
      duration_seconds: durationSec,
      duration_minutes_billable: Math.ceil(durationSec / 60),
      transcript_summary: summary || (transcript ? transcript.slice(0, 500) : null),
      raw_transcript: transcript ? { text: transcript } : null,
      cost_cents: costCents,
      outcome: verdict === "voicemail" ? "voicemail" : verdict === "no_answer" ? "dropped" : "answered",
      judge_verdict: verdict,
      judge_reasoning: reasoning,
      venue_calendar_booking_id: venueCalendarBookingId || null,
      booking_request_id: bookingRequestId || null,
      call_purpose: callPurpose || null,
    });
  }

  // Append call recap to booking comms threads when this was a guest AI call.
  if (callRecap) {
    const resolvedVenueBookingId = existing?.venue_calendar_booking_id ?? venueCalendarBookingId;
    const resolvedRequestId = existing?.booking_request_id ?? bookingRequestId;

    if (resolvedVenueBookingId) {
      const { data: vcbMsg } = await admin
        .from("venue_calendar_booking_messages")
        .select("id, body, metadata")
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle();
      if (vcbMsg) {
        const meta =
          typeof vcbMsg.metadata === "object" && vcbMsg.metadata !== null
            ? (vcbMsg.metadata as Record<string, unknown>)
            : {};
        await admin
          .from("venue_calendar_booking_messages")
          .update({
            body: `${vcbMsg.body}\n\nCall recap: ${callRecap}`,
            metadata: {
              ...meta,
              ended_at: endedAt,
              ended_reason: endedReason || null,
              outcome: verdict,
            },
          })
          .eq("id", vcbMsg.id);
      }
    }

    if (resolvedRequestId) {
      const { data: brMsgs } = await admin
        .from("booking_messages")
        .select("id, body, metadata")
        .eq("booking_request_id", resolvedRequestId)
        .eq("channel", "voice")
        .order("created_at", { ascending: false })
        .limit(20);
      const brMsg = (brMsgs ?? []).find((m) => {
        const meta = typeof m.metadata === "object" && m.metadata !== null ? (m.metadata as Record<string, unknown>) : {};
        return meta.vapi_call_id === vapiCallId;
      });
      if (brMsg) {
        const meta =
          typeof brMsg.metadata === "object" && brMsg.metadata !== null
            ? (brMsg.metadata as Record<string, unknown>)
            : {};
        await admin
          .from("booking_messages")
          .update({
            body: `${brMsg.body}\n\nCall recap: ${callRecap}`,
            metadata: {
              ...meta,
              ended_at: endedAt,
              ended_reason: endedReason || null,
              outcome: verdict,
            },
          })
          .eq("id", brMsg.id);
      }
    }
  }

  // Update lead status + run post-call intake extraction
  if (leadId) {
    const leadStatus =
      verdict === "voicemail" || verdict === "no_answer"
        ? "failed"
        : "completed";
    await admin
      .from("voice_outbound_leads")
      .update({ status: leadStatus })
      .eq("id", leadId);

    // Enrich lead with structured intake extracted from transcript (fire-and-forget)
    if (transcript.length > 60) {
      try {
        // Fetch campaign success_criteria to guide extraction
        let intakeCriteria: string | undefined;
        let campaignGoal: string | undefined;
        if (campaignId || existing?.campaign_id) {
          const { data: camp } = await admin
            .from("voice_campaigns")
            .select("success_criteria, name")
            .eq("id", campaignId || existing?.campaign_id || "")
            .maybeSingle();
          intakeCriteria = camp?.success_criteria ?? undefined;
          campaignGoal = camp?.name ?? undefined;
        }

        const intake = await extractLeadIntakeFromTranscript({ transcript, successCriteria: intakeCriteria, campaignGoal });
        if (intake) {
          const patch: Record<string, unknown> = {
            intake_json: intake.extra && Object.keys(intake.extra).length ? intake.extra : {},
            extracted_at: new Date().toISOString(),
          };
          if (intake.name) patch.name = intake.name;
          if (intake.email) patch.email = intake.email;
          if (intake.address_line1) patch.address_line1 = intake.address_line1;
          if (intake.city) patch.city = intake.city;
          if (intake.postcode) patch.postcode = intake.postcode;
          if (intake.country) patch.country = intake.country;
          if (intake.interest_level) patch.interest_level = intake.interest_level;
          if (intake.intake_notes) patch.intake_notes = intake.intake_notes;
          if (intake.contact_role) patch.contact_role = intake.contact_role;
          if (intake.reached_decision_maker !== null) patch.reached_decision_maker = intake.reached_decision_maker;
          if (intake.owner_name) patch.owner_name = intake.owner_name;
          if (intake.owner_phone) patch.owner_phone = intake.owner_phone;
          if (intake.owner_email) patch.owner_email = intake.owner_email;
          if (intake.owner_best_time) patch.owner_best_time = intake.owner_best_time;
          if (intake.objections) patch.objections = intake.objections;

          await admin
            .from("voice_outbound_leads")
            .update(patch)
            .eq("id", leadId);
        }
      } catch {
        // Extraction is best-effort — never fail the webhook
      }
    }
  }

  // Bump campaign counters
  if (campaignId) {
    const { data: c } = await admin
      .from("voice_campaigns")
      .select("total_calls_answered, total_calls_succeeded, total_cost_cents")
      .eq("id", campaignId)
      .maybeSingle();
    if (c) {
      const answered = verdict && verdict !== "voicemail" && verdict !== "no_answer";
      const succeeded = verdict === "success";
      await admin
        .from("voice_campaigns")
        .update({
          total_calls_answered: (c.total_calls_answered ?? 0) + (answered ? 1 : 0),
          total_calls_succeeded: (c.total_calls_succeeded ?? 0) + (succeeded ? 1 : 0),
          total_cost_cents: (c.total_cost_cents ?? 0) + costCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
    }
  }

  return NextResponse.json({ ok: true, verdict, callId: vapiCallId });
}
