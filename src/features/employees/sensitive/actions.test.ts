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

test("reveal compliance and activity logging succeeds before plaintext is returned", () => {
  assert.match(source, /\.rpc\(\s*"log_sensitive_data_reveal"/);
  assert.match(source, /if \(logError\) \{/);
  assert.ok(
    source.indexOf('"log_sensitive_data_reveal"')
      < source.indexOf("value: plaintext"),
  );
  assert.doesNotMatch(
    source,
    /\.from\("sensitive_data_access_logs"\)\s*\.insert/,
  );
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
