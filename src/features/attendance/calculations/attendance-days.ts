import type { AttendanceEmployeeSummary, AttendanceRecord } from "../types.ts";
import type { ActiveAttendanceCalculation } from "./types.ts";

function dayKey(employeeId: string, attendanceDate: string) {
  return `${employeeId}:${attendanceDate}`;
}

function effectiveStatus(
  calculation: ActiveAttendanceCalculation,
): AttendanceRecord["effective_status"] {
  if (calculation.base_status === "missing_clock_out") {
    return "missing_clock_out";
  }
  return calculation.actual_clock_out_at ? "completed" : "clocked_in";
}

function calculationOnlyRecord(
  calculation: ActiveAttendanceCalculation,
  employee?: AttendanceEmployeeSummary | null,
): AttendanceRecord {
  const storedStatus: AttendanceRecord["status"] = calculation.actual_clock_out_at
    ? "completed"
    : "clocked_in";

  return {
    id: `calculation:${calculation.calculation_group_id}`,
    employee_id: calculation.employee_id,
    attendance_date: calculation.attendance_date,
    clock_in_at: calculation.actual_clock_in_at,
    clock_out_at: calculation.actual_clock_out_at,
    clock_in_note: null,
    clock_out_note: null,
    status: storedStatus,
    effective_status: effectiveStatus(calculation),
    is_corrected: calculation.is_corrected,
    last_corrected_at: null,
    last_corrected_by: null,
    last_correction_reason: null,
    created_by: "",
    created_at: calculation.calculated_at,
    updated_at: calculation.calculated_at,
    employee: employee ?? null,
    calculation,
    is_calculation_only: true,
    overtime: [],
  };
}

export function mergeAttendanceDays(
  records: AttendanceRecord[],
  calculations: ActiveAttendanceCalculation[],
  employees: Map<string, AttendanceEmployeeSummary> = new Map(),
): AttendanceRecord[] {
  const calculationsByDay = new Map(
    calculations.map((calculation) => [
      dayKey(calculation.employee_id, calculation.attendance_date),
      calculation,
    ]),
  );

  const merged: AttendanceRecord[] = records.map((record) => {
    const calculation = calculationsByDay.get(
      dayKey(record.employee_id, record.attendance_date),
    ) ?? null;
    if (calculation) {
      calculationsByDay.delete(
        dayKey(record.employee_id, record.attendance_date),
      );
    }
    return {
      ...record,
      calculation,
      is_calculation_only: false,
    };
  });

  for (const calculation of calculationsByDay.values()) {
    merged.push(
      calculationOnlyRecord(
        calculation,
        employees.get(calculation.employee_id) ?? null,
      ),
    );
  }

  return merged.sort((left, right) => {
    const dateOrder = right.attendance_date.localeCompare(left.attendance_date);
    if (dateOrder !== 0) return dateOrder;
    return right.id.localeCompare(left.id);
  });
}

export function filterAttendanceDays(
  records: AttendanceRecord[],
  status?: string,
): AttendanceRecord[] {
  if (!status) return records;

  return records.filter((record) => {
    const calculation = record.calculation;
    if (
      status === "absent" ||
      status === "holiday" ||
      status === "rest_day_worked" ||
      status === "unscheduled_attendance"
    ) {
      return calculation?.base_status === status;
    }
    if (status === "missing_clock_out") {
      return calculation
        ? calculation.base_status === "missing_clock_out"
        : record.effective_status === "missing_clock_out";
    }
    if (status === "clocked_in") {
      return calculation
        ? calculation.is_provisional && !calculation.actual_clock_out_at
        : record.effective_status === "clocked_in";
    }
    if (status === "completed") {
      return calculation
        ? !calculation.is_provisional && Boolean(calculation.actual_clock_out_at)
        : record.effective_status === "completed";
    }
    if (status === "corrected") {
      return calculation?.is_corrected ?? record.is_corrected;
    }
    return calculation?.base_status === status;
  });
}
