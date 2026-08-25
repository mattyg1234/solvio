import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTicketTokenFromScan, showOpsTicketUrl } from "./ticket-token";

const token = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("parses a full ticket URL", () => {
  assert.equal(
    parseTicketTokenFromScan(`https://www.solviosystems.com/ticket/${token}?x=1`),
    token,
  );
});

test("parses a raw UUID and a path", () => {
  assert.equal(parseTicketTokenFromScan(token.toUpperCase()), token);
  assert.equal(parseTicketTokenFromScan(`/ticket/${token}`), token);
});

test("rejects junk", () => {
  assert.equal(parseTicketTokenFromScan("MHT-1002"), null);
  assert.equal(parseTicketTokenFromScan(""), null);
});

test("builds the public ticket URL", () => {
  assert.equal(showOpsTicketUrl("https://www.solviosystems.com/", token), `https://www.solviosystems.com/ticket/${token}`);
});
