export const hrNoteCategories = [
  "general",
  "performance",
  "disciplinary",
  "medical",
  "payroll",
] as const;

export type HrNoteCategory = typeof hrNoteCategories[number];

export type HrNoteActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: {
    category: string;
  };
};

export type HrNotePerson = {
  id: string;
  display_name: string | null;
  first_name: string;
  last_name: string;
};

export type HrNoteRecord = {
  id: string;
  employee_id: string;
  category: HrNoteCategory;
  content: string | null;
  contentUnavailable: boolean;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
  author: HrNotePerson | null;
  updater: HrNotePerson | null;
  deleter: HrNotePerson | null;
};
