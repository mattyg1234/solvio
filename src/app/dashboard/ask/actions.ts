"use server";

import { redirect } from "next/navigation";

import {
  countBookingsForDate,
  findBooking,
  listUpcomingEvents,
  searchCalls,
} from "@/lib/merchant-data-tools";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSolvioOpenAiApiKey } from "@/lib/voice-platform-env";

export type AskMessage = { role: "user" | "assistant"; content: string };

export type AskResult =
  | { ok: true; reply: string }
  | { ok: false; message: string };

const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "search_calls",
      description:
        "Search the merchant's voice call transcripts (and summaries) for a keyword or phrase. Use this when the merchant asks about something a caller mentioned — e.g. 'did anyone say they weren't busy on Wednesday'. Returns up to 10 matches with short excerpts.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The keyword or phrase to search for (3-120 chars)." },
          days_back: { type: "number", description: "How many days back to search. Default 30, max 365." },
          limit: { type: "number", description: "Max matches to return (default 10, max 25)." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_booking",
      description:
        "Look up a specific booking by guest name and/or phone, and optionally a specific date. Use this for queries like 'what table did June book' or 'when is the Smith booking'. Returns up to 8 matches from both confirmed bookings and pending requests.",
      parameters: {
        type: "object",
        properties: {
          guest_name: { type: "string", description: "Partial or full guest name to match." },
          phone: { type: "string", description: "Partial or full phone number to match." },
          date: { type: "string", description: "ISO date (YYYY-MM-DD) if the user mentioned a specific day." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "count_bookings_for_date",
      description:
        "Tell the merchant how busy a given day is — how many confirmed bookings, total guests, and pending requests for that date. Use for 'how busy is Wednesday' kind of questions. The user's date phrasing must be resolved to a YYYY-MM-DD first.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Target date in YYYY-MM-DD format." },
        },
        required: ["date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_upcoming_events",
      description:
        "List the merchant's upcoming events (live shows, special nights, etc) within the next N days. Useful for 'what's on next week'.",
      parameters: {
        type: "object",
        properties: {
          days_ahead: { type: "number", description: "How far ahead to look. Default 30, max 180." },
        },
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

export async function askSolvioAction(input: {
  history: AskMessage[];
  message: string;
}): Promise<AskResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = input.message.trim();
  if (trimmed.length < 2) return { ok: false, message: "Type a question first." };

  const apiKey = getSolvioOpenAiApiKey();
  if (!apiKey) return { ok: false, message: "AI service isn't configured on this deployment." };

  const { data: bizRows } = await supabase
    .from("businesses")
    .select("id, name, time_zone, subscription_tier")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (!bizRows?.length) {
    return { ok: false, message: "Add a business profile first — Ask Solvio needs at least one venue to query." };
  }

  const businessIds = bizRows.map((b) => b.id as string);
  const bizNameById = new Map(bizRows.map((b) => [b.id as string, (b.name as string) ?? ""]));
  const venueSummary = bizRows
    .map((b) => `- ${b.name} (id ${b.id}, timezone ${b.time_zone ?? "UTC"}, tier ${b.subscription_tier ?? "trial"})`)
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You are Solvio, an assistant that helps merchants understand their bookings, calls, and venue activity.",
        "You answer in short, conversational paragraphs (1-3 sentences) unless the user asks for a list.",
        "Use the supplied tools to look up real data before answering — never invent bookings or callers.",
        "If a tool returns no matches, say so plainly and suggest what the merchant might try next.",
        `Today's date is ${today}. The merchant owns these venues:`,
        venueSummary,
        "When the merchant mentions a day-of-week (Wednesday, etc.), resolve it to the next upcoming occurrence and pass as YYYY-MM-DD to tools.",
      ].join("\n"),
    },
  ];

  for (const m of input.history.slice(-12)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: trimmed });

  // Loop OpenAI ↔ tools (cap at 4 rounds to prevent runaway calls).
  for (let round = 0; round < 4; round++) {
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
      return { ok: false, message: "Couldn't reach the AI service — try again shortly." };
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
          if (name === "search_calls") {
            toolResult = await searchCalls(supabase, businessIds, bizNameById, args as Parameters<typeof searchCalls>[3]);
          } else if (name === "find_booking") {
            toolResult = await findBooking(supabase, businessIds, bizNameById, args as Parameters<typeof findBooking>[3]);
          } else if (name === "count_bookings_for_date") {
            toolResult = await countBookingsForDate(
              supabase,
              businessIds,
              bizNameById,
              args as Parameters<typeof countBookingsForDate>[3],
            );
          } else if (name === "list_upcoming_events") {
            toolResult = await listUpcomingEvents(
              supabase,
              businessIds,
              bizNameById,
              args as Parameters<typeof listUpcomingEvents>[3],
            );
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

  return { ok: false, message: "Hit the tool-call limit before answering — try a more specific question." };
}
