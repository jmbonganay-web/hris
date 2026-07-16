import type { DocumentRequirementTargetType } from "../types.ts";

export type RequirementCandidate = {
  id: string;
  categoryId: string;
  requiredCount: number;
  expiredSatisfies: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  targetType: DocumentRequirementTargetType;
  targetId: string | null;
};

export type RequirementEmployee = {
  id: string;
  departmentId: string | null;
  jobTitleId: string | null;
  employmentType: string | null;
};

const specificity: Record<DocumentRequirementTargetType, number> = {
  all_active_employees: 1,
  employment_type: 2,
  department: 3,
  job_title: 4,
  employee: 5,
};

export function selectApplicableRequirement(candidates: RequirementCandidate[], employee: RequirementEmployee, date: string) {
  return candidates
    .filter((requirement) => requirement.effectiveFrom <= date && (!requirement.effectiveTo || requirement.effectiveTo >= date))
    .filter((requirement) => requirement.targetType === "all_active_employees"
      || (requirement.targetType === "employee" && requirement.targetId === employee.id)
      || (requirement.targetType === "job_title" && requirement.targetId === employee.jobTitleId)
      || (requirement.targetType === "department" && requirement.targetId === employee.departmentId)
      || (requirement.targetType === "employment_type" && requirement.targetId === employee.employmentType))
    .sort((left, right) => specificity[right.targetType] - specificity[left.targetType]
      || right.effectiveFrom.localeCompare(left.effectiveFrom)
      || right.createdAt.localeCompare(left.createdAt)
      || right.id.localeCompare(left.id))[0] ?? null;
}

export async function listDocumentRequirements(filters: { categoryId?: string; includeArchived?: boolean } = {}) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_document_requirements", {
    p_category_id: filters.categoryId ?? null,
    p_include_archived: filters.includeArchived ?? false,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRequirementFormOptions() {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const { listCurrentDocumentCategories } = await import("../categories/queries.ts");
  const supabase = await createClient();
  const [categories, departmentsResult, jobTitlesResult, employeesResult] = await Promise.all([
    listCurrentDocumentCategories(),
    supabase.from("departments").select("id,name").eq("is_active", true).is("archived_at", null).order("name"),
    supabase.from("job_titles").select("id,title,department_id").eq("is_active", true).is("archived_at", null).order("title"),
    supabase.from("employees")
      .select("id,first_name,last_name,employee_number,employment_type,department_id,job_title_id")
      .is("archived_at", null)
      .in("employment_status", ["active", "probation", "on_leave"])
      .order("last_name"),
  ]);
  const errors = [departmentsResult.error, jobTitlesResult.error, employeesResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]!.message);
  const employees = employeesResult.data ?? [];
  return {
    categories,
    departments: departmentsResult.data ?? [],
    jobTitles: jobTitlesResult.data ?? [],
    employmentTypes: [...new Set(employees.map((employee) => employee.employment_type).filter(Boolean))].sort(),
    employees,
  };
}
