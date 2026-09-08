import assert from "node:assert/strict";
import { test } from "node:test";

import { decryptSecret, encryptSecret, secretHint, secretsKeyConfigured } from "./secrets";

const env = { SHOW_OPS_SECRETS_KEY: Buffer.alloc(32, 7).toString("base64") } as unknown as NodeJS.ProcessEnv;

test("round-trips a token and never stores it in clear", () => {
  const blob = encryptSecret("pat_abc_def", env);
  assert.match(blob, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(blob.includes("pat_abc"), false);
  assert.equal(decryptSecret(blob, env), "pat_abc_def");
  assert.notEqual(encryptSecret("same", env), encryptSecret("same", env), "fresh IV each time");
});

test("tampered ciphertext or wrong key fails closed", () => {
  const blob = encryptSecret("secret", env);
  const parts = blob.split(".");
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
  assert.throws(() => decryptSecret(parts.join("."), env));
  const other = { SHOW_OPS_SECRETS_KEY: Buffer.alloc(32, 9).toString("base64") } as unknown as NodeJS.ProcessEnv;
  assert.throws(() => decryptSecret(blob, other));
});

test("missing or short key is reported, hint shows last four only", () => {
  assert.equal(secretsKeyConfigured({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(secretsKeyConfigured({ SHOW_OPS_SECRETS_KEY: "short" } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(secretsKeyConfigured(env), true);
  assert.throws(() => encryptSecret("x", {} as unknown as NodeJS.ProcessEnv), /SHOW_OPS_SECRETS_KEY/);
  assert.equal(secretHint("pat_6aa0_7306"), "…7306");
});
