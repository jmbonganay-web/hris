import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePayrollBasisRuleList,
  normalizePayrollCalculationWorkspace,
  normalizePayrollEmployeeCalculationDetail,
  normalizePayrollExceptionList,
} from "../normalize.ts";
import {
  validatePayrollBasisRuleInput,
  validatePayrollCalculationRunInput,
  validatePayrollReasonActionInput,
} from "../validation.ts";
import {
  payrollCalculationRunStatusLabel,
  payrollEmployeeEntryStatusLabel,
  formatPayrollMinutes,
} from "../presentation.ts";

const id = "11111111-1111-4111-8111-111111111111";
const employee = { id, employee_number: "E-001", full_name: "A Person", work_email: "a@example.com" };

test("basis rule validation accepts approved preset values and rejects unsafe values", () => {
  const valid = validatePayrollBasisRuleInput({
    name: "261-day basis",
    annual_divisor: "261",
    standard_hours_per_day: "8",
    rounding_mode: "half_up",
    effective_from: "2026-08-01",
    change_reason: "Initial payroll setup",
  });
  assert.equal(valid.data?.annualDivisor, 261);
  assert.equal(valid.data?.roundingMode, "half_up");
  const invalid = validatePayrollBasisRuleInput({
    name: "x",
    annual_divisor: "0",
    standard_hours_per_day: "25",
    rounding_mode: "unsafe",
    effective_from: "not-a-date",
  });
  assert.ok(invalid.state?.fieldErrors?.annual_divisor);
  assert.ok(invalid.state?.fieldErrors?.standard_hours_per_day);
});

test("calculation and reason actions validate safe UUIDs and required reasons", () => {
  assert.equal(validatePayrollCalculationRunInput({ payroll_period_id: id, mode: "all" }).data?.mode, "all");
  assert.ok(validatePayrollCalculationRunInput({ payroll_period_id: "bad", mode: "all" }).state);
  assert.equal(validatePayrollReasonActionInput({ id, reason: "Reviewed and approved." }).data?.reason, "Reviewed and approved.");
  assert.ok(validatePayrollReasonActionInput({ id, reason: "" }).state?.fieldErrors?.reason);
});

test("basis, workspace, detail, and exception payloads normalize safely", () => {
  const basis = normalizePayrollBasisRuleList({
    rules: [{
      id,name:"261-day basis",annual_divisor:261,standard_hours_per_day:8,rounding_mode:"half_up",
      effective_from:"2026-08-01",effective_to:null,status:"approved",change_reason:null,version:2,
      submitted_at:"2026-07-20T00:00:00Z",approved_at:"2026-07-21T00:00:00Z",rejected_at:null,
      rejection_reason:null,created_at:"2026-07-20T00:00:00Z",updated_at:"2026-07-21T00:00:00Z"
    }],
    presets:[{code:"261",name:"261-day basis",annual_divisor:261,standard_hours_per_day:8}],
  });
  assert.equal(basis.rules[0]?.annualDivisor,261);
  assert.equal(basis.presets[0]?.code,"261");

  const entry = {
    id,payroll_period_id:id,employee_id:id,calculation_run_id:id,version_number:1,previous_entry_id:null,
    is_current:true,status:"calculated",compensation_type:"monthly",currency_code:"PHP",
    period_start:"2026-08-01",period_end:"2026-08-15",employment_start:"2026-01-01",employment_end:null,
    eligible_start:"2026-08-01",eligible_end:"2026-08-15",monthly_salary:30000,hourly_rate:null,
    annual_divisor:261,standard_hours_per_day:8,standard_hours_per_week:40,eligible_workdays:11,
    eligible_minutes:5280,payable_minutes:5280,approved_overtime_minutes:60,regular_earnings_raw:15172.413793,
    regular_earnings_rounded:15172.41,absence_deduction_raw:0,absence_deduction_rounded:0,
    late_deduction_raw:0,late_deduction_rounded:0,undertime_deduction_raw:0,undertime_deduction_rounded:0,
    overtime_input_amount:0,paid_leave_amount:0,unpaid_leave_deduction:0,gross_pay_raw:15172.413793,
    gross_pay_rounded:15172.41,is_stale:false,stale_reason:null,calculated_at:"2026-08-16T00:00:00Z",
    created_at:"2026-08-16T00:00:00Z",employee,open_exception_count:0,blocking_exception_count:0,
  };
  const workspace = normalizePayrollCalculationWorkspace({
    period:{id,period_code:"2026-SM-01A",period_start:"2026-08-01",period_end:"2026-08-15",cutoff_date:"2026-08-15",payment_date:"2026-08-20",status:"open",version:2,requires_recalculation:false,payroll_schedule_id:id,schedule_name:"Semi-monthly",schedule_code:"SM",currency_code:"PHP"},
    latest_run:null,runs:[],entries:[entry],readiness:{ready:true,activeRunCount:0,blockingExceptionCount:0,staleEntryCount:0,missingEmployeeCount:0},
    summary:{entry_count:1,exception_count:0,stale_count:0,excluded_count:0},
  });
  assert.equal(workspace.entries[0]?.employee.fullName,"A Person");
  assert.equal(workspace.summary.entryCount,1);

  const detail = normalizePayrollEmployeeCalculationDetail({employee,current_entry:entry,versions:[entry],daily_breakdowns:[],snapshots:[],exceptions:[]});
  assert.equal(detail.currentEntry?.grossPayRounded,15172.41);
  const exceptions = normalizePayrollExceptionList({items:[{id,payroll_period_id:id,employee_id:id,employee,calculation_run_id:id,payroll_employee_entry_id:id,exception_code:"INCOMPLETE_ATTENDANCE",severity:"blocking",message:"Missing attendance",source_type:"attendance",source_record_id:null,status:"open",resolution_note:null,resolved_at:null,created_at:"2026-08-16T00:00:00Z"}]});
  assert.equal(exceptions[0]?.severity,"blocking");
});

test("calculation presentation labels statuses and minutes", () => {
  assert.equal(payrollCalculationRunStatusLabel("completed_with_exceptions"), "Completed with exceptions");
  assert.equal(payrollEmployeeEntryStatusLabel("recalculated"), "Recalculated");
  assert.equal(formatPayrollMinutes(510), "8h 30m");
});
