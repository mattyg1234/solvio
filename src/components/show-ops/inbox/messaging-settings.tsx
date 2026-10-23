import {
  connectTwilioAction,
  disconnectTwilioAction,
  saveTwilioNumbersAction,
  testTwilioAction,
} from "@/app/dashboard/show-ops/actions-twilio";
import { PhoneInput } from "@/components/show-ops/phone-input";
import { inboundWebhookUrl } from "@/lib/show-ops/inbox/connection";
import { TEMPLATE_SPECS } from "@/lib/show-ops/inbox/templates";
import type { TwilioIntegrationMeta } from "@/lib/show-ops/inbox/types";

export type MessagingSettingsState = {
  /** null = not connected. */
  meta: (TwilioIntegrationMeta & { account_name?: string }) | null;
  status: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
};

const input = "mt-1 block w-full rounded-lg border px-2 py-1.5 text-sm";

/** Keep password managers (1Password, LastPass, Bitwarden) from filling the Hub login into Twilio fields. */
const NO_AUTOFILL = { "data-1p-ignore": "true", "data-lpignore": "true", "data-bwignore": "true", "data-form-type": "other" } as const;

/**
 * Settings → WhatsApp & SMS. The company's own Twilio account, with its
 * WhatsApp Business sender and/or an SMS number. Server component: the token
 * never comes back to the browser, only its last four characters.
 */
export function MessagingSettings({
  state,
  businessName,
  flash,
  flashError,
}: {
  state: MessagingSettingsState;
  businessName: string;
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
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Numbers and templates saved.</p>
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
            <TemplateFields meta={meta} businessName={businessName} />
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                Save numbers and templates
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
        <form action={connectTwilioAction} autoComplete="off" className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Account SID (starts with AC)
            <input
              name="account_sid"
              required
              defaultValue={meta?.account_sid ?? ""}
              autoComplete="off"
              spellCheck={false}
              {...NO_AUTOFILL}
              className={`${input} font-mono`}
            />
          </label>
          <label className="text-xs text-slate-600">
            Auth Token
            {/* new-password: browsers must not offer the signed-in user's saved login here. */}
            <input
              name="auth_token"
              type="password"
              required
              autoComplete="new-password"
              spellCheck={false}
              {...NO_AUTOFILL}
              className={`${input} font-mono`}
            />
          </label>
          <NumberFields meta={meta} />
          {/* Templates are set after connecting; a new token must not wipe them. */}
          {meta
            ? TEMPLATE_SPECS.map((spec) => <input key={spec.kind} type="hidden" name={spec.metaKey} value={meta[spec.metaKey]} />)
            : null}
          {meta?.reopen_uses_name ? <input type="hidden" name="reopen_uses_name" value="on" /> : null}
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
        <PhoneInput name="whatsapp_from" defaultValue={meta?.whatsapp_from ?? ""} className={input} />
      </label>
      <label className="text-xs text-slate-600">
        SMS number (a Twilio number; leave empty if SMS goes elsewhere)
        <PhoneInput name="sms_from" defaultValue={meta?.sms_from ?? ""} className={input} />
      </label>
    </>
  );
}

/** One approved WhatsApp template per kind of message, with the wording to paste into Twilio. */
function TemplateFields({ meta, businessName }: { meta: TwilioIntegrationMeta | null; businessName: string }) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <div>
        <p className="text-sm font-semibold text-slate-800">WhatsApp templates</p>
        <p className="mt-0.5 text-xs text-slate-500">
          After 24 hours WhatsApp only delivers messages Meta has approved. Make each one in Twilio (Content Template Builder,
          category Utility) with this wording, then paste its SID (HX…) here. Without one, that message goes by SMS.
        </p>
      </div>
      {TEMPLATE_SPECS.map((spec) => (
        <div key={spec.kind} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-sm font-semibold">{spec.title}</p>
          <p className="text-xs text-slate-500">{spec.when}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-violet-700">Wording for Twilio (name: {spec.twilioName})</summary>
            <textarea
              readOnly
              value={spec.wording(businessName)}
              rows={spec.wording(businessName).split("\n").length + 1}
              aria-label={`${spec.title} wording`}
              className="mt-2 block w-full rounded-lg border bg-white px-2 py-1.5 font-mono text-xs"
            />
            <ol className="mt-2 grid gap-0.5 text-[11px] text-slate-600 sm:grid-cols-2">
              {spec.blanks.map((b, i) => (
                <li key={b.label}>
                  {`{{${i + 1}}}`} {b.label}, sample: <span className="font-mono">{b.sample}</span>
                </li>
              ))}
            </ol>
          </details>
          <label className="mt-2 block text-xs text-slate-600">
            Template SID
            <input name={spec.metaKey} defaultValue={meta?.[spec.metaKey] ?? ""} spellCheck={false} placeholder="HX…" className={`${input} font-mono`} />
          </label>
          {spec.kind === "reopen" ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="reopen_uses_name" defaultChecked={meta?.reopen_content_sid ? meta.reopen_uses_name : true} className="h-4 w-4" />
              Template uses {"{{1}}"} for first name
            </label>
          ) : null}
        </div>
      ))}
    </div>
  );
}
