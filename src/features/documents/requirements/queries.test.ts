import test from "node:test";
import assert from "node:assert/strict";
import { selectApplicableRequirement } from "./queries.ts";

const employee = { id: "e1", departmentId: "d1", jobTitleId: "j1", employmentType: "regular" };
const base = {
  categoryId: "c1", requiredCount: 1, expiredSatisfies: false,
  effectiveFrom: "2026-01-01", effectiveTo: null, createdAt: "2026-01-01T00:00:00Z",
};

test("requirement precedence chooses the most specific target", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", targetType: "all_active_employees", targetId: null },
    { ...base, id: "r2", targetType: "employment_type", targetId: "regular" },
    { ...base, id: "r3", targetType: "department", targetId: "d1" },
    { ...base, id: "r4", targetType: "job_title", targetId: "j1" },
    { ...base, id: "r5", targetType: "employee", targetId: "e1" },
  ], employee, "2026-07-17");
  assert.equal(result?.id, "r5");
});

test("same-specificity ties use effective date, creation time, then stable id", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", effectiveFrom: "2026-05-01", createdAt: "2026-06-01T00:00:00Z", targetType: "department", targetId: "d1" },
    { ...base, id: "r3", effectiveFrom: "2026-05-01", createdAt: "2026-06-02T00:00:00Z", targetType: "department", targetId: "d1" },
    { ...base, id: "r2", effectiveFrom: "2026-05-01", createdAt: "2026-06-02T00:00:00Z", targetType: "department", targetId: "d1" },
  ], employee, "2026-07-17");
  assert.equal(result?.id, "r3");
});

test("inactive date ranges and unrelated targets are ignored", () => {
  const result = selectApplicableRequirement([
    { ...base, id: "r1", effectiveTo: "2026-01-31", targetType: "employee", targetId: "e1" },
    { ...base, id: "r2", targetType: "department", targetId: "other" },
  ], employee, "2026-07-17");
  assert.equal(result, null);
});
