import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./queries.ts", import.meta.url),
  "utf8",
);

test("normal sensitive queries never select protected storage columns", () => {
  assert.doesNotMatch(source, /_ciphertext/);
  assert.doesNotMatch(source, /_hash/);
  assert.match(source, /sss_last4/);
  assert.match(source, /account_number_last4/);
});
