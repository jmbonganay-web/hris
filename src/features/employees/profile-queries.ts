import { createClient } from "@/lib/supabase/server";
import type {
  EmployeeEmergencyContact,
  EmployeePersonalDetails,
  EmployeeRecord,
  ExpandedEmployeeProfile,
  ManagerOption,
  ManagerSummary,
} from "./types";

const expandedEmployeeSelect = `
  id,
  profile_id,
  employee_number,
  first_name,
  last_name,
  work_email,
  personal_email,
  phone,
  department_id,
  job_title_id,
  manager_id,
  employment_type,
  employment_status,
  hire_date,
  probation_end_date,
  regularization_date,
  work_location,
  work_schedule,
  avatar_path,
  archived_at,
  created_at,
  department:departments!employees_department_id_fkey(
    id,
    name,
    code,
    is_active,
    archived_at
  ),
  job_title:job_titles!employees_job_title_id_fkey(
    id,
    title,
    department_id,
    is_active,
    archived_at
  )
`;

function logSupabaseError(
  context: string,
  error: {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  },
) {
  console.error(
    [
      `[Supabase ${context}]`,
      `code=${error.code ?? "none"}`,
      `message=${error.message ?? "none"}`,
      `details=${error.details ?? "none"}`,
      `hint=${error.hint ?? "none"}`,
    ].join(" "),
  );
}

export async function getEmployeeAvatarSignedUrl(
  path: string | null,
) {
  if (!path) {
    return null;
  }

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from("employee-avatars")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    logSupabaseError("avatar signed URL", error);
    return null;
  }

  return data.signedUrl;
}

export async function getEmployeePersonalDetails(
  employeeId: string,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employee_personal_details")
    .select("*")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (error) {
    logSupabaseError("personal details", error);
    throw new Error("Unable to load personal details.");
  }

  return data as EmployeePersonalDetails | null;
}

export async function getEmployeeEmergencyContacts(
  employeeId: string,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employee_emergency_contacts")
    .select("*")
    .eq("employee_id", employeeId)
    .order("is_primary", { ascending: false })
    .order("full_name");

  if (error) {
    logSupabaseError("emergency contacts", error);
    throw new Error("Unable to load emergency contacts.");
  }

  return (data ?? []) as EmployeeEmergencyContact[];
}

export async function getEmergencyContact(
  employeeId: string,
  contactId: string,
) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employee_emergency_contacts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("id", contactId)
    .maybeSingle();

  if (error) {
    logSupabaseError("emergency contact", error);
    throw new Error("Unable to load emergency contact.");
  }

  return data as EmployeeEmergencyContact | null;
}

export async function getExpandedEmployeeProfile(
  employeeId: string,
): Promise<ExpandedEmployeeProfile | null> {
  const supabase = await createClient();

  const [
    { data: employee, error: employeeError },
    personal,
    emergencyContacts,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(expandedEmployeeSelect)
      .eq("id", employeeId)
      .maybeSingle(),

    getEmployeePersonalDetails(employeeId),

    getEmployeeEmergencyContacts(employeeId),
  ]);

  if (employeeError) {
    logSupabaseError("expanded employee", employeeError);
    throw new Error("Unable to load employee profile.");
  }

  if (!employee) {
    return null;
  }

  const typedEmployee = employee as unknown as EmployeeRecord;
  let managerSummary: ManagerSummary | null = null;

  if (typedEmployee.manager_id) {
    const { data: manager, error: managerError } = await supabase
      .rpc("get_employee_manager_summary", {
        p_employee_id: employeeId,
      })
      .maybeSingle();

    if (managerError) {
      logSupabaseError("employee manager summary", managerError);
      throw new Error("Unable to load the employee manager.");
    }

    managerSummary = manager as ManagerSummary | null;
  }

  const avatarUrl = await getEmployeeAvatarSignedUrl(
    typedEmployee.avatar_path,
  );

  return {
    employee: {
      ...typedEmployee,
      manager: managerSummary,
    },
    personal,
    emergencyContacts,
    avatarUrl,
  };
}

function appendCurrentManager(
  options: ManagerOption[],
  current: ManagerOption | null,
) {
  if (
    !current ||
    options.some((option) => option.id === current.id)
  ) {
    return options;
  }

  return [...options, current];
}

export async function getManagerOptions(
  employeeId: string,
  currentManagerId: string | null,
) {
  const supabase = await createClient();

  const { data: active, error } = await supabase
    .from("employees")
    .select(`
      id,
      first_name,
      last_name,
      employee_number,
      manager_id,
      employment_status,
      archived_at,
      job_title:job_titles!employees_job_title_id_fkey(title)
    `)
    .neq("id", employeeId)
    .eq("employment_status", "active")
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");

  if (error) {
    logSupabaseError("manager options", error);
    throw new Error("Unable to load manager options.");
  }

  let current: ManagerOption | null = null;

  if (
    currentManagerId &&
    !(active ?? []).some(
      (option) => option.id === currentManagerId,
    )
  ) {
    const { data, error: currentError } = await supabase
      .from("employees")
      .select(`
        id,
        first_name,
        last_name,
        employee_number,
        manager_id,
        employment_status,
        archived_at,
        job_title:job_titles!employees_job_title_id_fkey(title)
      `)
      .eq("id", currentManagerId)
      .maybeSingle();

    if (currentError) {
      logSupabaseError("current manager", currentError);
      throw new Error("Unable to load the current manager.");
    }

    current = data as unknown as ManagerOption | null;
  }

  return appendCurrentManager(
    (active ?? []) as unknown as ManagerOption[],
    current,
  );
}