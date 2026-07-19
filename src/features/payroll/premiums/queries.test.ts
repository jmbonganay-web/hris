import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");

test("premium queries are server-only and use protected RPCs", () => {
  assert.match(source, /import\s+["']server-only["']/);
  for (const rpc of [
    "list_premium_rule_sets",
    "get_premium_rule_set_detail",
    "list_attendance_deduction_rules",
    "list_premium_rule_approvals",
    "preview_premium_rule_coverage",
  ]) assert.match(source, new RegExp(`rpc\\(["']${rpc}["']`));
});

test("premium queries never use a service-role client", () => {
  assert.match(source, /@\/lib\/supabase\/server/);
  assert.doesNotMatch(source, /createAdminClient|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("premium query failures expose fixed safe messages", () => {
  assert.doesNotMatch(source, /throw\s+error|error\.message/);
  for (const message of [
    "Unable to load premium rules.",
    "Unable to load the premium rule.",
    "Unable to load attendance deduction rules.",
    "Unable to load premium approvals.",
    "Unable to preview premium-rule coverage.",
  ]) assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
