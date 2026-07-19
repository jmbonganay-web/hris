import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const verification = await readFile(
  new URL("../../../../phase10b2a_post_migration_verification.sql", import.meta.url),
  "utf8",
);

function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
}

test("post-migration verification is a single read-only statement", () => {
  const executable = stripCommentsAndStrings(verification);
  assert.match(executable.trim(), /^with\b/i);
  assert.doesNotMatch(
    executable,
    /\b(insert|update|delete|alter|drop|create|grant|revoke|truncate|call|do)\b/i,
  );
  assert.equal((executable.match(/;/g) ?? []).length, 1);
});

test("verification covers schema, security, immutability, readiness, and activation safety", () => {
  for (const requirement of [
    "premium_rule_sets",
    "payroll_premium_lines",
    "security_definer",
    "restricted_search_path",
    "authenticated_execute",
    "internal premium helpers",
    "immutable triggers",
    "effective-date exclusion constraints",
    "holiday_count",
    "premium_calculated_at",
    "ph_dole_2024_reference",
    "does not activate a premium rule automatically",
    "missingPremiumEntryCount",
    "/payroll/settings/premium-rules",
  ]) {
    assert.match(verification, new RegExp(requirement, "i"));
  }
});
