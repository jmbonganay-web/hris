import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOrganizationAssignment } from "./organization-validation.ts";

const activeDepartment = {
  id: "11111111-1111-4111-8111-111111111111",
  is_active: true,
  archived_at: null,
};

const activeJobTitle = {
  id: "22222222-2222-4222-8222-222222222222",
  department_id: activeDepartment.id,
  is_active: true,
  archived_at: null,
};

test("active matching department and job title are accepted", () => {
  assert.equal(evaluateOrganizationAssignment({
    requestedDepartmentId: activeDepartment.id,
    requestedJobTitleId: activeJobTitle.id,
    currentDepartmentId: null,
    currentJobTitleId: null,
    department: activeDepartment,
    jobTitle: activeJobTitle,
  }), null);
});

test("a job title from another department is rejected", () => {
  assert.equal(evaluateOrganizationAssignment({
    requestedDepartmentId: activeDepartment.id,
    requestedJobTitleId: activeJobTitle.id,
    currentDepartmentId: null,
    currentJobTitleId: null,
    department: activeDepartment,
    jobTitle: { ...activeJobTitle, department_id: "33333333-3333-4333-8333-333333333333" },
  }), "The selected job title does not belong to the selected department.");
});

test("an archived department cannot be newly assigned", () => {
  assert.equal(evaluateOrganizationAssignment({
    requestedDepartmentId: activeDepartment.id,
    requestedJobTitleId: null,
    currentDepartmentId: null,
    currentJobTitleId: null,
    department: { ...activeDepartment, is_active: false, archived_at: "2026-07-13T00:00:00Z" },
    jobTitle: null,
  }), "The selected department is no longer available.");
});

test("an employee may retain their currently archived organization values", () => {
  assert.equal(evaluateOrganizationAssignment({
    requestedDepartmentId: activeDepartment.id,
    requestedJobTitleId: activeJobTitle.id,
    currentDepartmentId: activeDepartment.id,
    currentJobTitleId: activeJobTitle.id,
    department: { ...activeDepartment, is_active: false, archived_at: "2026-07-13T00:00:00Z" },
    jobTitle: { ...activeJobTitle, is_active: false, archived_at: "2026-07-13T00:00:00Z" },
  }), null);
});
