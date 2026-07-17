const safePayrollErrors: ReadonlyArray<readonly [string, string]> = [
  ["PAYROLL_PERMISSION_DENIED", "You do not have permission to perform this payroll action."],
  ["PAYROLL_SETTINGS_INVALID", "Review the payroll settings and try again."],
  ["PAYROLL_SCHEDULE_NOT_FOUND", "The selected payroll schedule could not be found."],
  ["PAYROLL_SCHEDULE_INVALID", "Review the payroll schedule details and try again."],
  ["PAYROLL_SCHEDULE_IN_USE", "This payroll schedule is assigned to current or future employees."],
  ["PAYROLL_PERIOD_NOT_FOUND", "The selected payroll period could not be found."],
  ["PAYROLL_PERIOD_TRANSITION_INVALID", "This payroll period cannot move to the selected status."],
  ["PAYROLL_PERIOD_VERSION_CONFLICT", "The payroll period changed. Reload and try again."],
  ["PAYROLL_PERIOD_REOPEN_REASON_REQUIRED", "A reason is required to reopen a locked payroll period."],
  ["PAYROLL_COMPENSATION_NOT_FOUND", "The selected compensation record could not be found."],
  ["PAYROLL_COMPENSATION_INVALID", "Review the compensation details and try again."],
  ["PAYROLL_COMPENSATION_OVERLAP", "A compensation record already applies during this date range."],
  ["PAYROLL_COMPENSATION_IMMUTABLE", "Approved compensation records cannot be edited."],
  ["PAYROLL_BACKDATED_REASON_REQUIRED", "A reason and confirmation are required for a backdated compensation change."],
  ["PAYROLL_ASSIGNMENT_NOT_FOUND", "The selected payroll schedule assignment could not be found."],
  ["PAYROLL_ASSIGNMENT_INVALID", "Review the payroll schedule assignment and try again."],
  ["PAYROLL_ASSIGNMENT_OVERLAP", "A payroll schedule assignment already applies during this date range."],
  ["PAYROLL_ASSIGNMENT_MID_PERIOD", "This schedule change begins inside a payroll period and requires an approved override."],
  ["PAYROLL_REQUEST_STATE_INVALID", "This request is no longer in a state that allows the selected action."],
  ["PAYROLL_REQUEST_VERSION_CONFLICT", "This request changed. Reload and try again."],
  ["PAYROLL_GENERATION_ALREADY_RUNNING", "Payroll period generation is already running."],
  ["PAYROLL_GENERATION_FAILED", "Payroll periods could not be generated."],
];

export function mapPayrollError(
  message: string,
  fallback = "The payroll request could not be completed. Please try again.",
) {
  return safePayrollErrors.find(([code]) => message.includes(code))?.[1] ?? fallback;
}
