import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const types = await readFile(new URL("./types.ts", import.meta.url), "utf8");
const form = await readFile(
  new URL("../../components/leave/leave-request-form.tsx", import.meta.url),
  "utf8",
);
const employeeActions = await readFile(
  new URL("../../app/(dashboard)/employee/leave/actions.ts", import.meta.url),
  "utf8",
);
const adminActions = await readFile(
  new URL("../../app/(dashboard)/admin/leave/actions.ts", import.meta.url),
  "utf8",
);

function functionBody(source: string, name: string) {
  return source.match(
    new RegExp(`export async function ${name}\\s*\\([\\s\\S]*?\\n\\}`, "m"),
  )?.[0] ?? "";
}

test("leave preview actions return safe serializable validation results", () => {
  assert.match(types, /export type LeavePreviewActionResult/);
  assert.match(types, /ok: true; preview: LeavePreviewResult/);
  assert.match(types, /ok: false; error: string/);

  for (const [source, name] of [
    [employeeActions, "previewLeaveDraft"],
    [adminActions, "previewHrLeaveDraft"],
  ] as const) {
    const body = functionBody(source, name);
    assert.notEqual(body, "", `missing ${name}`);
    assert.match(body, /Promise<LeavePreviewActionResult>/);
    assert.match(body, /mapLeaveError/);
    assert.match(body, /return \{ ok: false, error:/);
    assert.match(body, /return \{ ok: true, preview(?:\s*:\s*preview)? \}/);
    assert.doesNotMatch(body, /throw new Error/);
  }
});

test("leave request form renders preview validation without a rejected server action", () => {
  assert.match(form, /Promise<LeavePreviewActionResult>/);
  assert.match(form, /if \(result\.ok\)/);
  assert.match(form, /setPreview\(result\.preview\)/);
  assert.match(form, /setPreviewError\(result\.error\)/);
});
