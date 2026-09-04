import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isPrivatePickupLabel,
  parsePickupKind,
  parsePrivateAccommodation,
  parsePrivatePickupLabel,
  pickupKindFromBooking,
  privatePickupLabel,
  privateTransferLine,
  zoneOptionsFromStops,
} from "./private-pickup";

test("private label reads Private <ZONE> · <Accommodation> for the office list", () => {
  assert.equal(privatePickupLabel("PDC", "villa"), "Private PDC · Villa");
  assert.equal(privatePickupLabel("pdc", "friends_family"), "Private PDC · Friends & Family");
  assert.equal(privatePickupLabel("TFW", null), "Private TFW");
  assert.equal(privatePickupLabel(null, "airbnb"), "Private · AirBnB");
  assert.equal(privatePickupLabel("", null), "Private");
});

test("stored labels round-trip back to zone + accommodation", () => {
  assert.deepEqual(parsePrivatePickupLabel("Private PDC · Villa"), { zone: "PDC", accommodation: "villa" });
  assert.deepEqual(parsePrivatePickupLabel("Private CT · Friends & Family"), { zone: "CT", accommodation: "friends_family" });
  assert.deepEqual(parsePrivatePickupLabel("Private TFS"), { zone: "TFS", accommodation: null });
  assert.deepEqual(parsePrivatePickupLabel("Private"), { zone: null, accommodation: null });
  assert.equal(parsePrivatePickupLabel("Puerto del Carmen · Hotel Fariones"), null);
  assert.equal(isPrivatePickupLabel("Private PDC · Villa"), true);
  assert.equal(isPrivatePickupLabel("Privateer Bar stop"), false);
  assert.equal(isPrivatePickupLabel(null), false);
});

test("old forms that only send transport_required still map to a kind", () => {
  assert.equal(parsePickupKind("private"), "private");
  assert.equal(parsePickupKind("own_way", true), "own_way");
  assert.equal(parsePickupKind("", true), "bus");
  assert.equal(parsePickupKind(undefined, false), "own_way");
  assert.equal(parsePickupKind("nonsense", true), "bus");
  assert.equal(parsePrivateAccommodation("Villa"), "villa");
  assert.equal(parsePrivateAccommodation("caravan"), null);
});

test("guest ticket wording names the resort, not the code", () => {
  assert.equal(privateTransferLine("PDC"), "Private transfer from Puerto del Carmen");
  assert.equal(privateTransferLine("PDC", { PDC: "Pto del Carmen" }), "Private transfer from Pto del Carmen");
  assert.equal(privateTransferLine("XYZ"), "Private transfer from XYZ");
  assert.equal(privateTransferLine(null), "Private transfer");
});

test("booking rows from before pickup_kind still classify from what they carry", () => {
  assert.equal(pickupKindFromBooking({ pickup_kind: "private" }), "private");
  assert.equal(pickupKindFromBooking({ transport_required: true }), "bus");
  assert.equal(pickupKindFromBooking({ transport_required: false, pickup_stop_name: "Private PDC · Villa" }), "private");
  assert.equal(pickupKindFromBooking({ transport_required: false, pickup_stop_name: null }), "own_way");
});

test("zone options come from that island's stops, labelled by the common resort name", () => {
  const stops = [
    { island: "Lanzarote", zone: "PDC", resort: "Puerto del Carmen" },
    { island: "Lanzarote", zone: "PDC", resort: "Puerto del Carmen" },
    { island: "Lanzarote", zone: "pdc", resort: "Pto Carmen" },
    { island: "Lanzarote", zone: "CT", resort: "Costa Teguise" },
    { island: "Lanzarote", zone: null, resort: "Arrecife" },
    { island: "Tenerife", zone: "TFS", resort: "Las Américas" },
  ];
  assert.deepEqual(zoneOptionsFromStops(stops, "Lanzarote"), [
    { code: "CT", resort: "Costa Teguise", label: "CT · Costa Teguise" },
    { code: "PDC", resort: "Puerto del Carmen", label: "PDC · Puerto del Carmen" },
  ]);
  assert.deepEqual(
    zoneOptionsFromStops(stops, "Tenerife").map((o) => o.code),
    ["TFS"],
  );
  assert.equal(zoneOptionsFromStops(stops, "").length, 3);
});
