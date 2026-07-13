import type { SupabaseClient } from "@supabase/supabase-js";

export type OrganizationSelection = {
  id: string;
  is_active: boolean;
  archived_at: string | null;
};

export type JobTitleSelection = OrganizationSelection & {
  department_id: string | null;
};

export function evaluateOrganizationAssignment(input: {
  requestedDepartmentId: string | null;
  requestedJobTitleId: string | null;
  currentDepartmentId: string | null;
  currentJobTitleId: string | null;
  department: OrganizationSelection | null;
  jobTitle: JobTitleSelection | null;
}) {
  const {
    requestedDepartmentId,
    requestedJobTitleId,
    currentDepartmentId,
    currentJobTitleId,
    department,
    jobTitle,
  } = input;

  if (requestedDepartmentId) {
    if (!department || department.id !== requestedDepartmentId) {
      return "Select a valid department.";
    }

    const retainsCurrentDepartment = currentDepartmentId === requestedDepartmentId;
    if ((!department.is_active || department.archived_at) && !retainsCurrentDepartment) {
      return "The selected department is no longer available.";
    }
  }

  if (requestedJobTitleId) {
    if (!jobTitle || jobTitle.id !== requestedJobTitleId) {
      return "Select a valid job title.";
    }

    const retainsCurrentJobTitle = currentJobTitleId === requestedJobTitleId;
    if ((!jobTitle.is_active || jobTitle.archived_at) && !retainsCurrentJobTitle) {
      return "The selected job title is no longer available.";
    }

    if (jobTitle.department_id && jobTitle.department_id !== requestedDepartmentId) {
      return "The selected job title does not belong to the selected department.";
    }
  }

  return null;
}

export async function validateEmployeeOrganizationAssignment(
  supabase: SupabaseClient,
  input: {
    requestedDepartmentId: string | null;
    requestedJobTitleId: string | null;
    currentDepartmentId?: string | null;
    currentJobTitleId?: string | null;
  },
) {
  const [departmentResult, jobTitleResult] = await Promise.all([
    input.requestedDepartmentId
      ? supabase
          .from("departments")
          .select("id,is_active,archived_at")
          .eq("id", input.requestedDepartmentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.requestedJobTitleId
      ? supabase
          .from("job_titles")
          .select("id,department_id,is_active,archived_at")
          .eq("id", input.requestedJobTitleId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (departmentResult.error || jobTitleResult.error) {
    return "Unable to validate the selected department and job title.";
  }

  return evaluateOrganizationAssignment({
    requestedDepartmentId: input.requestedDepartmentId,
    requestedJobTitleId: input.requestedJobTitleId,
    currentDepartmentId: input.currentDepartmentId ?? null,
    currentJobTitleId: input.currentJobTitleId ?? null,
    department: departmentResult.data,
    jobTitle: jobTitleResult.data,
  });
}
