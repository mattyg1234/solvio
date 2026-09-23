import { confirmationRows, type GuestConfirmationInput } from "@/lib/show-ops/confirmation-pdf";

/**
 * Ruth's guest confirmation as an email (23 Sept 2026: "needs to be the same booking
 * confirmation in the email"). Mirrors "MHT Confirmation Master Template V7" section by
 * section — logo, welcome, the booking band, timings, menu, both venues, sign-off — with
 * the booking rows coming from the same confirmationRows() the PDF prints, so the two
 * never drift. Tenerife and Lanzarote only, like the PDF.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT = "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const H = `${FONT};font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:#000;margin:22px 0 6px;text-align:center`;
const P = `${FONT};font-size:14px;line-height:1.5;color:#111;margin:0 0 4px;text-align:center`;
const SMALL = `${FONT};font-size:12px;line-height:1.45;color:#333;margin:0 0 4px;text-align:center`;

export const MHT_CONFIRMATION_COPY = {
  welcome: "HELLO DARLINGS, THANK YOU FOR YOUR BOOKING!",
  strap: "THE FUNNIEST NIGHT OF YOUR HOLIDAY IS WAITING FOR YOU",
  contact: "Need to speak to us? Contact: (0034) 928 514 701 | Reservations@musichalltavern.com",
  timingTitle: "IT'S ALL ABOUT TIMING DARLINGS!",
  timing: ["Doors open 19:00 | Seated by 19:30 | Meal service 20:00", "Pre-show and show during the evening", "(20 minute break included for you to have a little powder of your nose!)"],
  foodTitle: "FOOD GLORIOUS FOOD!",
  foodIntro: "Your home-cooked 3 course meal is:",
  menu: [
    ["STARTER", ["Home Made Vegetable Soup with Bread Roll"]],
    ["MAIN COURSE", ["Roast Chicken with Creamy Mash Potatoes,", "Crispy Roast Potatoes, Mixed Vegetables, Yorkshire Pudding", "& Mouth-Watering Gravy (just like Granny taught us!)"]],
    ["Vegetarian & Vegan Option", ["Breaded Mixed Bean Burger with all the above trimmings", "(For vegetarian meals or any other dietary requirement, please contact us)"]],
    ["KIDS MENU", ["Tenerife: Cheese & Tomato Pizza | Lanzarote: Chicken Nuggets & Chips"]],
    ["PUDDING", ["Beautiful Viennetta Ice Cream"]],
  ] as Array<[string, string[]]>,
  venues: [
    {
      name: "TENERIFE",
      lines: ["MHT @ Vivo Show Bar - Vivo Mini Golf", "Av. Rafael Puig Lluvina, 7", "Playa de las Americas, 38650", "Santa Cruz de Tenerife, Spain"],
      important: "IMPORTANT: Located in front of the Sol Tenerife Hotel. Taxi rank opposite. Our venue is inside the Mini Golf Complex.",
    },
    {
      name: "LANZAROTE",
      lines: ["MHT Music Hall Tavern", "CC la Penita local 20/21 (Top Floor)", "Avda de las Playas", "Puerto del Carmen, Lanzarote", "Las Palmas, 35510"],
      important: "IMPORTANT: Located on the 1st Floor with 17 steps. There is no lift or ramp, however a full disabled toilet is available on site.",
    },
  ],
  goodToKnowTitle: "GOOD TO KNOW, DARLINGS!",
  goodToKnow: [
    "We are a family-friendly, non-offensive comedy drag show, packed with unique routines & one-liners.",
    "English-speaking Hostess & Award-Winning MHT Cast.",
    "Remember your camera to capture amazing memories for your social media!",
  ],
  signoff: "WE LOOK FORWARD TO SEEING YOU AT MHT VERY SOON!",
  signature: "Our Queen Bee Miss Shona & Her MHT Cast",
  kisses: "xxx",
} as const;

export function renderMhtConfirmationEmail(
  booking: GuestConfirmationInput,
  opts: { logoUrl?: string | null; merchantName: string; updated?: boolean; extrasSummary?: string; showTime?: string | null; attachmentNote?: boolean },
): string {
  const c = MHT_CONFIRMATION_COPY;
  const rows = confirmationRows(booking);
  if (opts.extrasSummary) rows.splice(5, 0, ["Extras", opts.extrasSummary]);
  if (opts.showTime) rows.splice(4, 0, ["Show time", opts.showTime]);
  const qrSrc = booking.ticketUrl ? `${booking.ticketUrl.replace(/\/$/, "")}/qr` : "";

  const band = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #000;border-bottom:2px solid #000;margin:14px 0 6px">
      <tr>
        <td style="padding:14px 4px 10px;vertical-align:top">
          <p style="${FONT};font-size:12px;font-weight:800;letter-spacing:.06em;color:#000;margin:0 0 8px">${opts.updated ? "YOUR UPDATED PICK-UP" : "YOUR BOOKING"}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${rows
              .map(
                ([k, v]) => `<tr>
              <td style="${FONT};font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#555;padding:2px 14px 2px 0;white-space:nowrap;vertical-align:top">${esc(k)}</td>
              <td style="${FONT};font-size:13px;color:#000;padding:2px 0;vertical-align:top">${esc(v)}</td>
            </tr>`,
              )
              .join("")}
          </table>
        </td>
        ${
          qrSrc
            ? `<td width="120" style="padding:12px 4px 10px;vertical-align:top;text-align:center">
          <img src="${esc(qrSrc)}" width="110" height="110" alt="Your door QR" style="width:110px;height:110px;display:block;margin:0 auto" />
          <p style="${FONT};font-size:10px;color:#555;margin:4px 0 0">Show this at the door</p>
        </td>`
            : ""
        }
      </tr>
    </table>
    ${
      booking.ticketUrl
        ? `<p style="text-align:center;margin:8px 0 4px"><a href="${esc(booking.ticketUrl)}" style="${FONT};display:inline-block;background:#000;color:#fff;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:700;font-size:13px">View your ticket</a></p>`
        : ""
    }`;

  const menu = c.menu
    .map(
      ([title, lines]) => `<p style="${H};font-size:13px;margin-top:14px">${esc(title)}</p>${lines.map((l) => `<p style="${P}">${esc(l)}</p>`).join("")}`,
    )
    .join("");

  const venues = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #000;margin-top:22px">
      <tr>
        ${c.venues
          .map(
            (v) => `<td width="50%" style="padding:14px 8px 0;vertical-align:top">
          <p style="${FONT};font-size:13px;font-weight:800;color:#000;margin:0 0 6px">${esc(v.name)}</p>
          ${v.lines.map((l) => `<p style="${FONT};font-size:12px;line-height:1.4;color:#111;margin:0">${esc(l)}</p>`).join("")}
          <p style="${FONT};font-size:12px;line-height:1.4;color:#111;margin:10px 0 0">${esc(v.important)}</p>
        </td>`,
          )
          .join("")}
      </tr>
    </table>`;

  return `
  <div style="background:#f3f4f6;padding:16px 8px">
    <div style="max-width:620px;margin:0 auto;background:#fff;padding:26px 28px 30px;border:1px solid #e5e7eb">
      ${opts.logoUrl ? `<p style="text-align:center;margin:0 0 10px"><img src="${esc(opts.logoUrl)}" alt="${esc(opts.merchantName)}" height="56" style="height:56px;width:auto;display:inline-block" /></p>` : `<p style="${H};font-size:22px;margin:0 0 10px">${esc(opts.merchantName)}</p>`}
      <p style="${H};font-size:18px;margin-top:8px">${esc(c.welcome)}</p>
      <p style="${H};font-size:15px;margin-top:2px">${esc(c.strap)}</p>
      <p style="${FONT};font-size:12px;font-weight:700;color:#000;margin:6px 0 0;text-align:center">${esc(c.contact)}</p>
      ${band}
      <p style="${H};font-size:15px">${esc(c.timingTitle)}</p>
      ${c.timing.map((l, i) => `<p style="${i === 2 ? SMALL : P}">${esc(l)}</p>`).join("")}
      <p style="${H};font-size:15px">${esc(c.foodTitle)}</p>
      <p style="${P};font-weight:700">${esc(c.foodIntro)}</p>
      ${menu}
      ${venues}
      <p style="${H};font-size:14px">${esc(c.goodToKnowTitle)}</p>
      ${c.goodToKnow.map((l) => `<p style="${SMALL}">${esc(l)}</p>`).join("")}
      <p style="${H};font-size:14px;margin-top:16px">${esc(c.signoff)}</p>
      <p style="font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#000;text-align:center;margin:4px 0 0">${esc(c.signature)}</p>
      <p style="${P}">${esc(c.kisses)}</p>
      ${opts.attachmentNote ? `<p style="${SMALL};color:#666;margin-top:18px">A printable copy of this confirmation is attached.</p>` : ""}
    </div>
  </div>`;
}
