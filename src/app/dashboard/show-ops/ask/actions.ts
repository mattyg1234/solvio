"use server";

import { logLlmUsage } from "@/lib/llm-usage";
import { requireShowOpsEnabled, roleAtLeast } from "@/lib/show-ops/access";
import {
  opsBusNeeds,
  opsBusinessSnapshot,
  opsCountBookings,
  opsCreateBooking,
  opsFindBooking,
  opsListHotels,
  opsListProducts,
  opsListSuppliers,
  opsListUnpaid,
} from "@/lib/show-ops/brain-tools";
import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type OpsAskMessage = { role: "user" | "assistant"; content: string };

export type OpsAskResult = { ok: true; reply: string } | { ok: false; message: string };

const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "count_bookings",
      description:
        "Count show/tour bookings and pax for a date (optional island/region). Use for 'how many bookings tomorrow', 'how busy is Friday on Lanzarote'.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          island: { type: "string", description: "Optional region/island filter" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "bus_needs",
      description:
        "Compare bus pax (transport required) vs seats ordered for a date. Answers 'how many buses / seats do we need', spaces left, shortfall.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          island: { type: "string" },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_booking",
      description: "Find bookings by guest name, booking ref, and/or date.",
      parameters: {
        type: "object",
        properties: {
          guest_name: { type: "string" },
          booking_ref: { type: "string" },
          date: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_unpaid",
      description: "List deposit bookings still unpaid/partial and total balance outstanding.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Optional show date filter YYYY-MM-DD" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_products",
      description: "List active shows/trips/tickets with prices — use before creating a booking.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_suppliers",
      description: "List active suppliers (agencies) with billing mode.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_hotels",
      description: "List hotels, optionally filtered by island/region.",
      parameters: {
        type: "object",
        properties: { island: { type: "string" } },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_booking",
      description:
        "Create a booking. First call with confirm=false to show a draft summary to the user. Only set confirm=true after the user clearly agrees (e.g. 'yes create it'). Resolve product_id/supplier_id/hotel_id via list_* tools first.",
      parameters: {
        type: "object",
        properties: {
          show_date: { type: "string" },
          guest_name: { type: "string" },
          product_id: { type: "string" },
          supplier_id: { type: "string" },
          hotel_id: { type: "string" },
          adults: { type: "number" },
          children: { type: "number" },
          infants: { type: "number" },
          transport_required: { type: "boolean" },
          guest_mobile: { type: "string" },
          guest_email: { type: "string" },
          confirm: { type: "boolean" },
        },
        required: ["show_date", "guest_name", "product_id", "confirm"],
      },
    },
  },
] as const;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
};

export async function askOpsBrainAction(input: {
  history: OpsAskMessage[];
  message: string;
}): Promise<OpsAskResult> {
  const ctx = await requireShowOpsEnabled();
  const trimmed = input.message.trim();
  if (trimmed.length < 2) return { ok: false, message: "Type a question first." };

  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) return { ok: false, message: "AI isn’t configured on this deployment yet." };

  const canBook = roleAtLeast(ctx.role, "booker");
  const snapshot = await opsBusinessSnapshot(ctx.supabase, { businessId: ctx.business.id }, ctx.config);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        `You are the Ops Brain for ${ctx.branding.displayName} on Solvio.`,
        "You help the office with bookings, bus capacity, unpaid deposits, and day-to-day ops.",
        "Always use tools for real numbers — never invent bookings, pax, or bus seats.",
        "Answer in short clear paragraphs. Use bullet lists when comparing islands or showing several bookings.",
        `Today is ${snapshot.today}. ${ctx.config.location_label}s: ${ctx.config.islands.join(", ") || "not set"}.`,
        `Product label: ${ctx.config.product_label}. Role of user: ${ctx.role}.`,
        `Snapshot: ${JSON.stringify(snapshot)}`,
        canBook
          ? "You may create bookings after listing products/hotels as needed. Always draft with confirm=false first, then confirm=true only when the user agrees."
          : "This user cannot create bookings — explain and suggest asking an office user.",
        "When the user says Wednesday/Friday/etc, resolve to the next upcoming YYYY-MM-DD.",
      ].join("\n"),
    },
  ];

  for (const m of input.history.slice(-12)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: trimmed });

  const scope = { businessId: ctx.business.id };

  for (let round = 0; round < 5; round++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages,
          tools: TOOL_DEFINITIONS,
        }),
      });
    } catch {
      return { ok: false, message: "Couldn’t reach the AI — try again shortly." };
    }

    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        detail = body?.error?.message ?? "";
      } catch {
        /* empty */
      }
      return { ok: false, message: detail || `AI service returned ${res.status}.` };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, message: "Unexpected AI response." };
    }

    logLlmUsage({
      feature: "show_ops_brain",
      model: "gpt-4o-mini",
      businessId: ctx.business.id,
      usage: (body as { usage?: unknown }).usage as Parameters<typeof logLlmUsage>[0]["usage"],
    });

    const choice = (body as { choices?: { message?: ChatMessage }[] }).choices?.[0]?.message;
    if (!choice) return { ok: false, message: "AI returned an empty reply." };

    if (choice.tool_calls?.length) {
      messages.push({ role: "assistant", content: null, tool_calls: choice.tool_calls });
      for (const call of choice.tool_calls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        let toolResult: unknown = null;
        try {
          if (name === "count_bookings") {
            toolResult = await opsCountBookings(ctx.supabase, scope, args as { date: string; island?: string });
          } else if (name === "bus_needs") {
            toolResult = await opsBusNeeds(ctx.supabase, scope, args as { date: string; island?: string });
          } else if (name === "find_booking") {
            toolResult = await opsFindBooking(ctx.supabase, scope, args as never);
          } else if (name === "list_unpaid") {
            toolResult = await opsListUnpaid(ctx.supabase, scope, args as never);
          } else if (name === "list_products") {
            toolResult = await opsListProducts(ctx.supabase, scope);
          } else if (name === "list_suppliers") {
            toolResult = await opsListSuppliers(ctx.supabase, scope);
          } else if (name === "list_hotels") {
            toolResult = await opsListHotels(ctx.supabase, scope, args as { island?: string });
          } else if (name === "create_booking") {
            if (!canBook) {
              toolResult = { error: "Your role cannot create bookings." };
            } else {
              toolResult = await opsCreateBooking(
                ctx.supabase,
                { ...scope, userId: ctx.user.id, transportSupplement: ctx.config.transport_supplement },
                args as never,
              );
            }
          } else {
            toolResult = { error: `Unknown tool: ${name}` };
          }
        } catch (e) {
          toolResult = { error: e instanceof Error ? e.message : "Tool failed" };
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    if (typeof choice.content === "string" && choice.content.trim()) {
      return { ok: true, reply: choice.content.trim() };
    }
    return { ok: false, message: "AI returned an empty answer." };
  }

  return { ok: false, message: "Too many tool steps — try a more specific question." };
}
