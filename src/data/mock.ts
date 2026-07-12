import type { Employee, LeaveRequest } from "@/types";

export const employees: Employee[] = [
  { id: "1", employeeId: "EMP-001", name: "Alyssa Morgan", email: "alyssa@northstar.com", role: "Product Designer", department: "Design", type: "Full-time", hireDate: "Jan 08, 2024", status: "Active" },
  { id: "2", employeeId: "EMP-002", name: "Daniel Cruz", email: "daniel@northstar.com", role: "Frontend Developer", department: "Engineering", type: "Full-time", hireDate: "Mar 21, 2023", status: "Active" },
  { id: "3", employeeId: "EMP-003", name: "Mia Santos", email: "mia@northstar.com", role: "HR Specialist", department: "People", type: "Full-time", hireDate: "Jul 14, 2022", status: "On Leave" },
  { id: "4", employeeId: "EMP-004", name: "Noah Lee", email: "noah@northstar.com", role: "Account Manager", department: "Sales", type: "Contract", hireDate: "Sep 01, 2024", status: "Active" },
  { id: "5", employeeId: "EMP-005", name: "Sofia Reyes", email: "sofia@northstar.com", role: "Finance Analyst", department: "Finance", type: "Full-time", hireDate: "Nov 11, 2021", status: "Inactive" }
];

export const leaveRequests: LeaveRequest[] = [
  { id: "1", employee: "Mia Santos", type: "Vacation Leave", dates: "Jul 14–16", days: 3, status: "Approved" },
  { id: "2", employee: "Daniel Cruz", type: "Sick Leave", dates: "Jul 15", days: 1, status: "Pending" },
  { id: "3", employee: "Noah Lee", type: "Emergency Leave", dates: "Jul 18", days: 1, status: "Pending" }
];

export const attendance = [
  { name: "Alyssa Morgan", time: "8:54 AM", status: "Present" },
  { name: "Daniel Cruz", time: "9:12 AM", status: "Late" },
  { name: "Mia Santos", time: "—", status: "On Leave" },
  { name: "Noah Lee", time: "8:48 AM", status: "Present" }
];
