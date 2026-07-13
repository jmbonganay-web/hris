import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../app/(dashboard)/employees/[id]/sensitive-actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("reveal logging succeeds before plaintext is returned", () => {
  assert.match(source, /if \(logError\) \{/);
  assert.match(
    source,
    /return \{ value: plaintext, revealedAt: Date\.now\(\) \}/,
  );
  assert.ok(source.indexOf("if (logError)") < source.indexOf("value: plaintext"));
});

test("sensitive actions do not log plaintext or use persistent browser storage", () => {
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*plaintext/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test("update action handles duplicate government identifiers", () => {
  assert.match(source, /23505/);
  assert.match(source, /employee_sensitive_details_sss_hash_uidx/);
  assert.match(source, /employee_sensitive_details_tin_hash_uidx/);
});
