export type EmployeeStatus = "Active" | "On Leave" | "Inactive";

export type Employee = {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  role: string;
  department: string;
  type: string;
  hireDate: string;
  status: EmployeeStatus;
};

export type LeaveRequest = {
  id: string;
  employee: string;
  type: string;
  dates: string;
  days: number;
  status: "Pending" | "Approved" | "Rejected";
};
