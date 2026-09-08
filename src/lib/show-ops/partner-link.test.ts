import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingRefSeries, isPartnerLinkToken, isUniqueViolation, nextBookingRefWithoutSession, partnerLinkPath, partnerLinkUrl } from "./partner-link";

test("tokens are validated before they reach a URL", () => {
  assert.ok(isPartnerLinkToken("sMY6SFFDEIznTsJthq8W6wfX"));
  assert.ok(!isPartnerLinkToken("short"));
  assert.ok(!isPartnerLinkToken("has/slash-and-length-enough"));
  assert.ok(!isPartnerLinkToken(null));
  assert.equal(partnerLinkPath("sMY6SFFDEIznTsJthq8W6wfX"), "/p/sMY6SFFDEIznTsJthq8W6wfX");
  assert.equal(partnerLinkUrl("https://www.solviosystems.com/", "sMY6SFFDEIznTsJthq8W6wfX"), "https://www.solviosystems.com/p/sMY6SFFDEIznTsJthq8W6wfX");
  assert.throws(() => partnerLinkPath(""), /not set/);
});

test("ref series follows the invoice series and refs continue the operator's numbers", async () => {
  assert.equal(bookingRefSeries({ invoice: { series: "MHT" } }), "MHT");
  assert.equal(bookingRefSeries({ invoice: { series: "m-h.t" } }), "MHT");
  assert.equal(bookingRefSeries({}), "SO");
  const client = (rows: Array<{ booking_ref_num: number | null }>) => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) }),
  });
  assert.equal(await nextBookingRefWithoutSession(client([{ booking_ref_num: 319326 }]), "b", "MHT"), "MHT-319327");
  assert.equal(await nextBookingRefWithoutSession(client([]), "b", "MHT"), "MHT-1000");
  assert.equal(await nextBookingRefWithoutSession(client([{ booking_ref_num: 12 }]), "b", "SO"), "SO-1000");
});

test("unique violations are recognised so the caller can retry the ref", () => {
  assert.ok(isUniqueViolation({ code: "23505" }));
  assert.ok(isUniqueViolation({ message: 'duplicate key value violates unique constraint "show_bookings_business_id_booking_ref_key"' }));
  assert.ok(!isUniqueViolation({ code: "42501", message: "permission denied" }));
  assert.ok(!isUniqueViolation(null));
});
