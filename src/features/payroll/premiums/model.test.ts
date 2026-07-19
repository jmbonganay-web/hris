import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAttendanceDeductionRuleList,
  normalizePremiumApprovalQueue,
  normalizePremiumCoveragePreview,
  normalizePremiumRuleList,
} from "../normalize.ts";
import {
  validateAttendanceDeductionRuleInput,
  validatePremiumCalculationInput,
  validatePremiumRuleSetInput,
} from "../validation.ts";
import { premiumDayTypeValues } from "../constants.ts";

const uuid = "11111111-1111-4111-8111-111111111111";

function dayRules() {
  return premiumDayTypeValues.map((dayType) => ({
    day_type: dayType,
    regular_time_multiplier: dayType === "regular_workday" ? 1 : 1.3,
    overtime_multiplier: dayType === "regular_workday" ? 1.25 : 1.3,
    additional_premium_only: true,
    night_differential_percentage: 0.1,
    night_window_start: "22:00",
    night_window_end: "06:00",
    overtime_rounding_mode: "exact_minutes",
    overtime_rounding_increment_minutes: null,
    night_rounding_mode: "exact_minutes",
    night_rounding_increment_minutes: null,
  }));
}

function validRuleInput() {
  return {
    name: "Philippine company premium policy",
    scope_type: "company_default",
    effective_from: "2026-08-01",
    effective_to: "",
    change_reason: "Initial reviewed company policy.",
    source_agency: "DOLE/Bureau of Working Conditions",
    source_reference: "Handbook on Workers' Statutory Monetary Benefits",
    source_publication_date: "2024-11-01",
    source_url: "https://example.gov.ph/payroll-guide.pdf",
    day_rules: JSON.stringify(dayRules()),
  };
}

test("premium rule validation accepts the complete effective-dated matrix", () => {
  const result = validatePremiumRuleSetInput(validRuleInput());
  assert.ok(result.data);
  assert.equal(result.data.dayRules.length, 8);
  assert.equal(result.data.scopeType, "company_default");
  assert.equal(result.data.sourceAgency, "DOLE/Bureau of Working Conditions");
});

test("premium rule validation rejects duplicate day types and insecure source links", () => {
  const input = validRuleInput();
  const rows = dayRules();
  rows[7] = { ...rows[0] };
  input.day_rules = JSON.stringify(rows);
  input.source_url = "http://example.test/source";
  const result = validatePremiumRuleSetInput(input);
  assert.equal(result.data, undefined);
  assert.ok(result.state?.fieldErrors?.day_rules);
  assert.ok(result.state?.fieldErrors?.source_url);
});

test("attendance rule validation supports zero grace and independent rounding", () => {
  const result = validateAttendanceDeductionRuleInput({
    scope_type: "department",
    department_id: uuid,
    late_grace_minutes: "0",
    undertime_grace_minutes: "10",
    late_rounding_mode: "exact_minutes",
    late_rounding_increment_minutes: "",
    undertime_rounding_mode: "round_up",
    undertime_rounding_increment_minutes: "5",
    effective_from: "2026-08-01",
    change_reason: "Approved attendance policy.",
  });
  assert.ok(result.data);
  assert.equal(result.data.lateGraceMinutes, 0);
  assert.equal(result.data.undertimeRoundingIncrementMinutes, 5);
});

test("premium calculation validation limits recalculation to selected employees", () => {
  const valid = validatePremiumCalculationInput({
    payroll_period_id: uuid,
    mode: "selected",
    employee_ids: [uuid],
  });
  assert.deepEqual(valid.data?.employeeIds, [uuid]);

  const invalid = validatePremiumCalculationInput({
    payroll_period_id: uuid,
    mode: "selected",
    employee_ids: [],
  });
  assert.ok(invalid.state?.fieldErrors?.employee_ids);
});

test("premium payload normalization is safe and preserves rule matrices", () => {
  const normalized = normalizePremiumRuleList({
    rules: [{
      id: uuid,
      name: "Default",
      scope_type: "payroll_group",
      scope_label: "Semi-monthly",
      payroll_group_id: uuid,
      effective_from: "2026-08-01",
      status: "approved",
      version: 2,
      source_agency: "DOLE",
      source_reference: "Guide",
      source_publication_date: "2024-11-01",
      source_url: "https://example.gov.ph/guide.pdf",
      created_at: "2026-07-19T00:00:00Z",
      updated_at: "2026-07-19T00:00:00Z",
      day_rules: dayRules().map((row, index) => ({ ...row, id: `${index}`, version_number: 2 })),
    }],
    presets: [{
      code: "ph_dole_2024_reference",
      name: "Reference",
      country_code: "PH",
      source_agency: "DOLE",
      source_reference: "Guide",
      source_publication_date: "2024-11-01",
      source_url: "https://example.gov.ph/guide.pdf",
      day_rules: dayRules(),
    }],
    departments: [{ id: uuid, name: "Finance" }],
    positions: [{ id: uuid, title: "Analyst" }],
    payroll_groups: [{ id: uuid, code: "SM", name: "Semi-monthly" }],
  });
  assert.equal(normalized.rules[0]?.scopeType, "payroll_group");
  assert.equal(normalized.rules[0]?.dayRules.length, 8);
  assert.equal(normalized.presets[0]?.countryCode, "PH");
  assert.equal(normalized.positions[0]?.name, "Analyst");
});

test("approval and coverage normalizers tolerate missing arrays", () => {
  assert.deepEqual(normalizePremiumApprovalQueue({}), {
    premiumRules: [],
    attendanceDeductionRules: [],
  });
  assert.deepEqual(normalizePremiumCoveragePreview({}), {
    affectedEmployeeCount: 0,
    affectedOpenPeriodCount: 0,
    staleEntryCount: 0,
    conflictingRuleIds: [],
    missingDayTypes: [],
  });
  assert.deepEqual(normalizeAttendanceDeductionRuleList(null), []);
});

test("premium rule validation rejects a zero-length night window", () => {
  const input = validRuleInput();
  input.day_rules = JSON.stringify(dayRules().map((row) => ({
    ...row,
    night_window_end: row.night_window_start,
  })));
  const result = validatePremiumRuleSetInput(input);
  assert.ok(result.state?.fieldErrors?.day_rules);
});
