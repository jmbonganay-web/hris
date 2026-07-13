import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDepartmentAvailability, validateDepartment, validateJobTitle } from "./validation.ts";

const validEmployeeId = "11111111-1111-4111-8111-111111111111";
const validDepartmentId = "22222222-2222-4222-8222-222222222222";

function makeForm(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

test("department validation normalizes the code and optional values", () => {
  const result = validateDepartment(makeForm({
    name: "  Customer Success  ",
    code: " cs ",
    description: "  Customer onboarding and support.  ",
    department_head_id: validEmployeeId,
    is_active: "on",
  }));

  assert.deepEqual(result.data, {
    name: "Customer Success",
    code: "CS",
    description: "Customer onboarding and support.",
    department_head_id: validEmployeeId,
    is_active: true,
  });
  assert.equal(result.state, undefined);
});

test("department validation rejects missing names and invalid head IDs", () => {
  const result = validateDepartment(makeForm({
    name: "",
    code: "X",
    department_head_id: "not-a-uuid",
  }));

  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.name, "Department name is required.");
  assert.equal(result.state?.fieldErrors?.code, "Department code must be at least 2 characters.");
  assert.equal(result.state?.fieldErrors?.department_head_id, "Select a valid department head.");
});

test("job-title validation returns normalized database input", () => {
  const result = validateJobTitle(makeForm({
    title: "  Senior Designer  ",
    description: "  Leads product design.  ",
    department_id: validDepartmentId,
    is_active: "on",
  }));

  assert.deepEqual(result.data, {
    title: "Senior Designer",
    description: "Leads product design.",
    department_id: validDepartmentId,
    is_active: true,
  });
});

test("job-title validation rejects missing titles and invalid department IDs", () => {
  const result = validateJobTitle(makeForm({
    title: "",
    department_id: "invalid",
  }));

  assert.equal(result.data, undefined);
  assert.equal(result.state?.fieldErrors?.title, "Job title is required.");
  assert.equal(result.state?.fieldErrors?.department_id, "Select a valid department.");
});

test("a job title may retain its currently archived department", () => {
  const department = {
    id: validDepartmentId,
    is_active: false,
    archived_at: "2026-07-13T00:00:00Z",
  };

  assert.equal(evaluateDepartmentAvailability({
    requestedDepartmentId: validDepartmentId,
    currentDepartmentId: validDepartmentId,
    department,
  }), null);

  assert.equal(evaluateDepartmentAvailability({
    requestedDepartmentId: validDepartmentId,
    currentDepartmentId: null,
    department,
  }), "Select an active department.");
});
