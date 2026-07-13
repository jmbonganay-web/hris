import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL(
    "../../../components/employees/profile/sensitive-details-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("protected inputs are not prefilled from existing details", () => {
  assert.doesNotMatch(
    source,
    /defaultValue=\{details\.(sss_number|philhealth_number|pagibig_number|tin|account_name|account_number)/,
  );
  assert.match(source, /Leave blank to keep unchanged/);
});

test("clear controls are explicit and protected fields disable autocomplete", () => {
  assert.match(source, /name=\{`clear_\$\{name\}`\}/);
  for (const field of [
    "sss_number",
    "philhealth_number",
    "pagibig_number",
    "tin",
    "account_name",
    "account_number",
  ]) {
    assert.match(source, new RegExp(`name=\\"${field}\\"`));
  }
  assert.match(source, /autoComplete="off"/);
});
