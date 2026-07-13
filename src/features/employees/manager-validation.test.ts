import test from "node:test";
import assert from "node:assert/strict";
import { wouldCreateManagerCycle } from "./manager-validation.ts";

const records = [
  { id: "a", manager_id: null },
  { id: "b", manager_id: "a" },
  { id: "c", manager_id: "b" },
];

test("self management is a cycle", () => {
  assert.equal(wouldCreateManagerCycle("a", "a", records), true);
});

test("assigning a direct report as manager creates a cycle", () => {
  assert.equal(wouldCreateManagerCycle("a", "b", records), true);
});

test("assigning an indirect report as manager creates a cycle", () => {
  assert.equal(wouldCreateManagerCycle("a", "c", records), true);
});

test("assigning an ancestor as manager does not create a cycle", () => {
  assert.equal(wouldCreateManagerCycle("c", "a", records), false);
});

import { evaluateManagerSelection } from "./manager-validation.ts";

test("an inactive historical manager may be retained", () => {
  assert.equal(evaluateManagerSelection({
    employeeId: "employee",
    proposedManagerId: "manager",
    currentManagerId: "manager",
    manager: { id: "manager", employment_status: "inactive", archived_at: null },
    hierarchy: [],
  }), null);
});

test("an inactive manager cannot be newly assigned", () => {
  assert.equal(evaluateManagerSelection({
    employeeId: "employee",
    proposedManagerId: "manager",
    currentManagerId: null,
    manager: { id: "manager", employment_status: "inactive", archived_at: null },
    hierarchy: [],
  }), "Select an active employee as manager.");
});
