import test from "node:test";
import assert from "node:assert/strict";
import { attachCategoryVersionFields, normalizeCategoryRows } from "./queries.ts";

test("category rows group immutable fields under the correct version", () => {
  const result = normalizeCategoryRows([
    {
      category_id: "c1", code: "professional_license", archived_at: null,
      version_id: "v2", version_number: 2, name: "Professional License",
      description: "Current license", default_visibility: "employee_hr",
      employee_upload_enabled: true, cardinality: "multiple",
      allowed_mime_types: ["application/pdf"], expiration_mode: "required",
      default_validity_months: 12, expiring_soon_days: 30,
      retention_months_after_separation: 60, created_at: "2026-07-17T00:00:00Z",
      field_id: "f1", field_key: "license_type", field_label: "License type",
      field_type: "select", field_required: true, select_options: ["PRC"],
      employee_visible: true, display_order: 1,
    },
    {
      category_id: "c1", code: "professional_license", archived_at: null,
      version_id: "v2", version_number: 2, name: "Professional License",
      description: "Current license", default_visibility: "employee_hr",
      employee_upload_enabled: true, cardinality: "multiple",
      allowed_mime_types: ["application/pdf"], expiration_mode: "required",
      default_validity_months: 12, expiring_soon_days: 30,
      retention_months_after_separation: 60, created_at: "2026-07-17T00:00:00Z",
      field_id: "f2", field_key: "license_number", field_label: "License number",
      field_type: "text", field_required: true, select_options: [],
      employee_visible: true, display_order: 2,
    },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].currentVersion.fields.length, 2);
  assert.equal(result[0].currentVersion.fields[0].fieldKey, "license_type");
});


test("category version history includes immutable field definitions", () => {
  const versions = [{ id: "v2", version_number: 2 }, { id: "v1", version_number: 1 }];
  const result = attachCategoryVersionFields(versions, [
    { id: "f2", category_version_id: "v2", field_key: "license_number", label: "License number", field_type: "text", is_required: true, select_options: [], employee_visible: true, display_order: 2 },
    { id: "f1", category_version_id: "v2", field_key: "license_type", label: "License type", field_type: "select", is_required: true, select_options: ["PRC"], employee_visible: true, display_order: 1 },
  ]);
  assert.deepEqual(result[0].fields.map((field) => field.fieldKey), ["license_type", "license_number"]);
  assert.deepEqual(result[1].fields, []);
});
