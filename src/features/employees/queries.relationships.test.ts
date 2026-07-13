import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./queries.ts", import.meta.url), "utf8");

test("employee queries disambiguate the department relationship after department heads are added", () => {
  assert.match(
    source,
    /department:departments!employees_department_id_fkey\(/,
    "The employees-to-departments embed must name employees_department_id_fkey because Phase 3 adds a second relationship through departments.department_head_id.",
  );
});
