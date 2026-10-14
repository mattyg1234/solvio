import {
  connectTwilioAction,
  disconnectTwilioAction,
  saveTwilioNumbersAction,
  testTwilioAction,
} from "@/app/dashboard/show-ops/actions-twilio";
import { inboundWebhookUrl } from "@/lib/show-ops/inbox/connection";
import type { TwilioIntegrationMeta } from "@/lib/show-ops/inbox/types";

export type MessagingSettingsState = {
  /** null = not connected. */
  meta: (TwilioIntegrationMeta & { account_name?: string }) | null;
  status: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
};

const input = "mt-1 block w-full rounded-lg border px-2 py-1.5 text-sm";

/**
 * Settings → WhatsApp & SMS. The company's own Twilio account, with its
 * WhatsApp Business sender and/or an SMS number. Server component: the token
 * never comes back to the browser, only its last four characters.
 */
export function MessagingSettings({
  state,
  flash,
  flashError,
}: {
  state: MessagingSettingsState;
  flash?: string;
  flashError?: string;
}) {
  const { meta } = state;
  const webhook = meta?.webhook_token ? inboundWebhookUrl(meta.webhook_token) : null;
  return (
    <section id="messaging" className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="font-semibold">WhatsApp &amp; SMS — customer inbox</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect the company&apos;s own Twilio account. Guest replies to WhatsApp and texts land in{" "}
        <a href="/dashboard/show-ops/inbox" className="font-semibold text-violet-700 underline">
          Customer inbox
        </a>
        , and the tickets and pick-up texts the Hub sends go out from these numbers and show there too.
      </p>

      {flash === "connected" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Twilio connected and verified. Now paste the webhook address below into Twilio.</p>
      ) : flash === "ok" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Twilio answered: the connection works.</p>
      ) : flash === "saved" ? (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Numbers saved.</p>
      ) : flash === "disconnected" ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">Twilio disconnected. Past conversations stay in the inbox.</p>
      ) : null}
      {flashError ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{flashError}</p> : null}

      {meta ? (
        <div className="mt-4 space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Account</dt>
              <dd className="font-medium">
                {meta.account_name || "Twilio"} · <span className="font-mono text-xs">{meta.account_sid.slice(0, 6)}…{meta.account_sid.slice(-4)}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd className={`font-medium ${state.status === "connected" ? "text-emerald-700" : "text-rose-700"}`}>
                {state.status === "connected" ? "Connected" : "Needs attention"}
                {state.lastError ? <span className="block text-xs font-normal text-rose-700">{state.lastError}</span> : null}
              </dd>
            </div>
          </dl>

          {webhook ? (
            <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <p className="font-semibold">Webhook address (paste into Twilio)</p>
              <p className="mt-1 text-xs text-slate-600">
                In Twilio, set &quot;A message comes in&quot; (HTTP POST) to this address for the WhatsApp sender and for the SMS
                number. Delivery ticks are set up automatically on each message.
              </p>
              <input readOnly value={webhook} className="mt-2 block w-full rounded-lg border bg-white px-2 py-1.5 font-mono text-xs" aria-label="Webhook address" />
            </div>
          ) : null}

          <form action={saveTwilioNumbersAction} className="grid gap-3 sm:grid-cols-2">
            <NumberFields meta={meta} />
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                Save numbers
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <form action={testTwilioAction}>
              <button type="submit" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                Test connection
              </button>
            </form>
            <form action={disconnectTwilioAction}>
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 hover:underline">
                Disconnect
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <details className="mt-4" open={!meta}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          {meta ? `Replace the Auth Token (now ending ${meta.hint || "…"})` : "Connect Twilio"}
        </summary>
        <form action={connectTwilioAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Account SID (starts with AC)
            <input name="account_sid" required defaultValue={meta?.account_sid ?? ""} autoComplete="off" spellCheck={false} className={`${input} font-mono`} />
          </label>
          <label className="text-xs text-slate-600">
            Auth Token
            <input name="auth_token" type="password" required autoComplete="off" spellCheck={false} className={`${input} font-mono`} />
          </label>
          <NumberFields meta={meta} />
          <p className="text-xs text-slate-500 sm:col-span-2">
            The token is checked with Twilio, then stored encrypted; nobody can read it back, including Solvio staff in the app.
          </p>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-2 text-sm font-semibold text-white">
              {meta ? "Save new token" : "Connect Twilio"}
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

function NumberFields({ meta }: { meta: TwilioIntegrationMeta | null }) {
  return (
    <>
      <label className="text-xs text-slate-600">
        WhatsApp Business sender
        <input name="whatsapp_from" type="tel" defaultValue={meta?.whatsapp_from ?? ""} placeholder="+34 928 000 000" className={input} />
        <span className="mt-1 block text-[11px] text-slate-500">The number approved for WhatsApp in Twilio. Leave empty for SMS only.</span>
      </label>
      <label className="text-xs text-slate-600">
        SMS number
        <input name="sms_from" type="tel" defaultValue={meta?.sms_from ?? ""} placeholder="+34 928 000 000" className={input} />
        <span className="mt-1 block text-[11px] text-slate-500">A Twilio number that can send and receive texts. Leave empty for WhatsApp only.</span>
      </label>
      <label className="text-xs text-slate-600 sm:col-span-2">
        WhatsApp template to start or re-open a chat (Content SID, starts with HX)
        <input name="reopen_content_sid" defaultValue={meta?.reopen_content_sid ?? ""} spellCheck={false} className={`${input} font-mono`} />
        <span className="mt-1 block text-[11px] text-slate-500">
          WhatsApp only allows free text within 24 hours of the guest&apos;s last message. Outside that, the inbox sends this
          approved template (made in Twilio → Content Template Builder, approved by WhatsApp).
        </span>
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2">
        <input type="checkbox" name="reopen_uses_name" defaultChecked={meta?.reopen_uses_name ?? false} className="h-4 w-4" />
        The template has {"{{1}}"} for the guest&apos;s first name
      </label>
    </>
  );
}
