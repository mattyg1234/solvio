import assert from "node:assert/strict";
import test from "node:test";

import { hubBrandFor, isMhtHubHost } from "./hub-brand";

test("MHT hosts get the Hub brand", () => {
  assert.equal(isMhtHubHost("mht.solviosystems.com"), true);
  assert.equal(isMhtHubHost("mhtshowshub.com"), true);
  assert.equal(isMhtHubHost("www.mhtshowshub.com:443"), true);
  assert.equal(isMhtHubHost("MHT.solviosystems.com"), true);
});

test("Solvio's own hosts keep Solvio branding", () => {
  assert.equal(isMhtHubHost("www.solviosystems.com"), false);
  assert.equal(isMhtHubHost("solviosystems.com"), false);
  assert.equal(isMhtHubHost("solvio-abc.vercel.app"), false);
  assert.equal(isMhtHubHost("notmhtshowshub.com"), false);
  assert.equal(isMhtHubHost(""), false);
  assert.equal(hubBrandFor("www.solviosystems.com"), null);
});

test("?hub=mht previews the Hub brand on any host", () => {
  assert.equal(hubBrandFor("solvio-abc.vercel.app", "mht")?.name, "The MHT Hub");
  assert.equal(hubBrandFor("solvio-abc.vercel.app", ["mht"])?.name, "The MHT Hub");
  assert.equal(hubBrandFor("solvio-abc.vercel.app", "other"), null);
});
