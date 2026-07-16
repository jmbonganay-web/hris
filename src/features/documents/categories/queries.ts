import type {
  DocumentCardinality,
  DocumentCustomFieldDefinition,
  DocumentCustomFieldType,
  DocumentExpirationMode,
  DocumentVisibility,
} from "../types.ts";

export type CategoryRow = {
  category_id: string;
  code: string;
  archived_at: string | null;
  version_id: string;
  version_number: number;
  name: string;
  description: string | null;
  default_visibility: DocumentVisibility;
  employee_upload_enabled: boolean;
  cardinality: DocumentCardinality;
  allowed_mime_types: string[];
  expiration_mode: DocumentExpirationMode;
  default_validity_months: number | null;
  expiring_soon_days: number;
  retention_months_after_separation: number | null;
  created_at: string;
  field_id: string | null;
  field_key: string | null;
  field_label: string | null;
  field_type: DocumentCustomFieldType | null;
  field_required: boolean | null;
  select_options: string[] | null;
  employee_visible: boolean | null;
  display_order: number | null;
};

export type DocumentCategorySummary = {
  id: string;
  code: string;
  archivedAt: string | null;
  currentVersion: {
    id: string;
    versionNumber: number;
    name: string;
    description: string | null;
    defaultVisibility: DocumentVisibility;
    employeeUploadEnabled: boolean;
    cardinality: DocumentCardinality;
    allowedMimeTypes: string[];
    expirationMode: DocumentExpirationMode;
    defaultValidityMonths: number | null;
    expiringSoonDays: number;
    retentionMonthsAfterSeparation: number | null;
    createdAt: string;
    fields: Array<DocumentCustomFieldDefinition & { id: string }>;
  };
};


export type CategoryVersionFieldRow = {
  id: string;
  category_version_id: string;
  field_key: string;
  label: string;
  field_type: DocumentCustomFieldType;
  is_required: boolean;
  select_options: string[] | null;
  employee_visible: boolean;
  display_order: number;
};

export function attachCategoryVersionFields<T extends { id: string }>(versions: T[], rows: CategoryVersionFieldRow[]) {
  return versions.map((version) => ({
    ...version,
    fields: rows
      .filter((row) => row.category_version_id === version.id)
      .sort((left, right) => left.display_order - right.display_order)
      .map((row) => ({
        id: row.id,
        fieldKey: row.field_key,
        label: row.label,
        fieldType: row.field_type,
        isRequired: row.is_required,
        selectOptions: row.select_options ?? [],
        employeeVisible: row.employee_visible,
        displayOrder: row.display_order,
      })),
  }));
}

export function normalizeCategoryRows(rows: CategoryRow[]) {
  const categories = new Map<string, DocumentCategorySummary>();
  for (const row of rows) {
    const category = categories.get(row.category_id) ?? {
      id: row.category_id,
      code: row.code,
      archivedAt: row.archived_at,
      currentVersion: {
        id: row.version_id,
        versionNumber: row.version_number,
        name: row.name,
        description: row.description,
        defaultVisibility: row.default_visibility,
        employeeUploadEnabled: row.employee_upload_enabled,
        cardinality: row.cardinality,
        allowedMimeTypes: row.allowed_mime_types,
        expirationMode: row.expiration_mode,
        defaultValidityMonths: row.default_validity_months,
        expiringSoonDays: row.expiring_soon_days,
        retentionMonthsAfterSeparation: row.retention_months_after_separation,
        createdAt: row.created_at,
        fields: [],
      },
    };
    if (
      row.field_id
      && row.field_key
      && row.field_label
      && row.field_type
      && row.field_required !== null
      && row.employee_visible !== null
      && row.display_order !== null
      && !category.currentVersion.fields.some((field) => field.id === row.field_id)
    ) {
      category.currentVersion.fields.push({
        id: row.field_id,
        fieldKey: row.field_key,
        label: row.field_label,
        fieldType: row.field_type,
        isRequired: row.field_required,
        selectOptions: row.select_options ?? [],
        employeeVisible: row.employee_visible,
        displayOrder: row.display_order,
      });
      category.currentVersion.fields.sort((left, right) => left.displayOrder - right.displayOrder);
    }
    categories.set(row.category_id, category);
  }
  return [...categories.values()];
}

export async function listCurrentDocumentCategories(options: { includeArchived?: boolean; employeeUploadOnly?: boolean } = {}) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  let query = supabase.from("document_current_category_versions").select("*");
  if (!options.includeArchived) query = query.is("archived_at", null);
  if (options.employeeUploadOnly) query = query.eq("employee_upload_enabled", true);
  const { data, error } = await query.order("name").order("display_order");
  if (error) throw new Error(error.message);
  return normalizeCategoryRows((data ?? []) as CategoryRow[]);
}

export async function getDocumentCategoryDetail(categoryId: string) {
  const { createClient } = await import("../../../lib/supabase/server.ts");
  const supabase = await createClient();
  const [{ data: currentRows, error: currentError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from("document_current_category_versions").select("*").eq("category_id", categoryId).order("display_order"),
    supabase.from("document_category_versions")
      .select("id,category_id,version_number,name,description,default_visibility,employee_upload_enabled,cardinality,allowed_mime_types,expiration_mode,default_validity_months,expiring_soon_days,retention_months_after_separation,change_reason,created_at")
      .eq("category_id", categoryId)
      .order("version_number", { ascending: false }),
  ]);
  if (currentError) throw new Error(currentError.message);
  if (versionsError) throw new Error(versionsError.message);
  const current = normalizeCategoryRows((currentRows ?? []) as CategoryRow[])[0];
  if (!current) throw new Error("DOCUMENT_CATEGORY_NOT_FOUND");
  const versionRows = versions ?? [];
  const versionIds = versionRows.map((version) => version.id);
  let fieldRows: CategoryVersionFieldRow[] = [];
  if (versionIds.length > 0) {
    const { data: fields, error: fieldsError } = await supabase
      .from("document_category_fields")
      .select("id,category_version_id,field_key,label,field_type,is_required,select_options,employee_visible,display_order")
      .in("category_version_id", versionIds)
      .order("display_order");
    if (fieldsError) throw new Error(fieldsError.message);
    fieldRows = (fields ?? []) as CategoryVersionFieldRow[];
  }
  return { ...current, versions: attachCategoryVersionFields(versionRows, fieldRows) };
}
