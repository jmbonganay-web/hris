import type {
  DepartmentInput,
  JobTitleInput,
  OrganizationActionState,
} from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function invalidResult(fieldErrors: Record<string, string>) {
  return {
    state: {
      error: "Please correct the highlighted fields.",
      fieldErrors,
    } satisfies OrganizationActionState,
  };
}

export function validateDepartment(formData: FormData): {
  data?: DepartmentInput;
  state?: OrganizationActionState;
} {
  const name = text(formData, "name");
  const code = text(formData, "code").toUpperCase();
  const description = text(formData, "description") || null;
  const departmentHeadId = text(formData, "department_head_id") || null;
  const isActive = formData.get("is_active") === "on";
  const fieldErrors: Record<string, string> = {};

  if (!name) fieldErrors.name = "Department name is required.";
  else if (name.length < 2) fieldErrors.name = "Department name must be at least 2 characters.";
  else if (name.length > 100) fieldErrors.name = "Department name must be 100 characters or fewer.";

  if (!code) fieldErrors.code = "Department code is required.";
  else if (code.length < 2) fieldErrors.code = "Department code must be at least 2 characters.";
  else if (code.length > 20) fieldErrors.code = "Department code must be 20 characters or fewer.";

  if (description && description.length > 500) {
    fieldErrors.description = "Description must be 500 characters or fewer.";
  }

  if (departmentHeadId && !uuidPattern.test(departmentHeadId)) {
    fieldErrors.department_head_id = "Select a valid department head.";
  }

  if (Object.keys(fieldErrors).length) return invalidResult(fieldErrors);

  return {
    data: {
      name,
      code,
      description,
      department_head_id: departmentHeadId,
      is_active: isActive,
    },
  };
}

export function validateJobTitle(formData: FormData): {
  data?: JobTitleInput;
  state?: OrganizationActionState;
} {
  const title = text(formData, "title");
  const description = text(formData, "description") || null;
  const departmentId = text(formData, "department_id") || null;
  const isActive = formData.get("is_active") === "on";
  const fieldErrors: Record<string, string> = {};

  if (!title) fieldErrors.title = "Job title is required.";
  else if (title.length < 2) fieldErrors.title = "Job title must be at least 2 characters.";
  else if (title.length > 100) fieldErrors.title = "Job title must be 100 characters or fewer.";

  if (description && description.length > 500) {
    fieldErrors.description = "Description must be 500 characters or fewer.";
  }

  if (departmentId && !uuidPattern.test(departmentId)) {
    fieldErrors.department_id = "Select a valid department.";
  }

  if (Object.keys(fieldErrors).length) return invalidResult(fieldErrors);

  return {
    data: {
      title,
      description,
      department_id: departmentId,
      is_active: isActive,
    },
  };
}

export function evaluateDepartmentAvailability(input: {
  requestedDepartmentId: string | null;
  currentDepartmentId: string | null;
  department: { id: string; is_active: boolean; archived_at: string | null } | null;
}) {
  if (!input.requestedDepartmentId) return null;
  if (!input.department || input.department.id !== input.requestedDepartmentId) {
    return "Select a valid department.";
  }
  const retainingCurrent = input.currentDepartmentId === input.requestedDepartmentId;
  if ((!input.department.is_active || input.department.archived_at) && !retainingCurrent) {
    return "Select an active department.";
  }
  return null;
}
