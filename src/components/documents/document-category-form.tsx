"use client";

import { useActionState, useMemo, useState } from "react";
import type { DocumentActionState, DocumentCardinality, DocumentCustomFieldDefinition, DocumentCustomFieldType, DocumentExpirationMode, DocumentVisibility } from "@/features/documents/types";

const mimeOptions = [
  ["application/pdf", "PDF"],
  ["image/jpeg", "JPG/JPEG"],
  ["image/png", "PNG"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "DOCX"],
] as const;
const fieldTypes: DocumentCustomFieldType[] = ["text", "long_text", "number", "date", "boolean", "select"];

type EditableField = DocumentCustomFieldDefinition & { clientKey: string };
export type CategoryFormValue = {
  id?: string; code: string; name: string; description: string | null; defaultVisibility: DocumentVisibility;
  employeeUploadEnabled: boolean; cardinality: DocumentCardinality; allowedMimeTypes: string[]; expirationMode: DocumentExpirationMode;
  defaultValidityMonths: number | null; expiringSoonDays: number; retentionMonthsAfterSeparation: number | null;
  fields: Array<DocumentCustomFieldDefinition & { id?: string }>;
};

export function DocumentCategoryForm({
  mode,
  initial,
  action,
  canUseSuperAdminVisibility,
}: {
  mode: "create" | "revision";
  initial?: CategoryFormValue;
  action: (state: DocumentActionState, formData: FormData) => Promise<DocumentActionState>;
  canUseSuperAdminVisibility: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as DocumentActionState);
  const [fields, setFields] = useState<EditableField[]>(() => (initial?.fields ?? []).map((field) => ({ ...field, clientKey: crypto.randomUUID() })));
  const [expirationMode, setExpirationMode] = useState<DocumentExpirationMode>(initial?.expirationMode ?? "optional");
  const fieldsJson = useMemo(() => JSON.stringify(fields.map(({ clientKey: _clientKey, ...field }, index) => ({ ...field, displayOrder: index + 1 }))), [fields]);

  function updateField(clientKey: string, patch: Partial<EditableField>) {
    setFields((current) => current.map((field) => field.clientKey === clientKey ? { ...field, ...patch } : field));
  }
  function moveField(index: number, offset: number) {
    setFields((current) => { const next = [...current]; const target = index + offset; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }
  function addField() {
    setFields((current) => [...current, { clientKey: crypto.randomUUID(), fieldKey: "", label: "", fieldType: "text", isRequired: false, selectOptions: [], employeeVisible: true, displayOrder: current.length + 1 }]);
  }

  return <form action={formAction} className="card document-category-form">
    <div className="card-header-row"><div><h2>{mode === "create" ? "Create document category" : "Create immutable revision"}</h2><p>{mode === "create" ? "Define a stable category identity and its first configuration." : "Publish a new version without modifying prior configurations."}</p></div></div>
    <input type="hidden" name="category_id" value={initial?.id ?? ""} />
    <input type="hidden" name="fields_json" value={fieldsJson} />
    <div className="document-detail-grid">
      <label><span>Stable code</span><input className="field" name="code" defaultValue={initial?.code ?? ""} readOnly={mode === "revision"} pattern="[a-z][a-z0-9_]{2,63}" required /></label>
      <label><span>Name</span><input className="field" name="name" defaultValue={initial?.name ?? ""} required /></label>
      <label className="full-span"><span>Description</span><textarea className="field" name="description" rows={3} defaultValue={initial?.description ?? ""} /></label>
      <label><span>Default visibility</span><select className="field" name="default_visibility" defaultValue={initial?.defaultVisibility ?? "employee_hr"}><option value="employee_hr">Employee and HR</option><option value="hr_only">HR only</option>{canUseSuperAdminVisibility && <option value="super_admin_only">Super Admin only</option>}</select></label>
      <label><span>Cardinality</span><select className="field" name="cardinality" defaultValue={initial?.cardinality ?? "multiple"}><option value="single">Single active document</option><option value="multiple">Multiple documents</option></select></label>
      <label><span>Expiration mode</span><select className="field" name="expiration_mode" value={expirationMode} onChange={(event) => setExpirationMode(event.target.value as DocumentExpirationMode)}><option value="required">Required</option><option value="optional">Optional</option><option value="disabled">Disabled</option></select></label>
      <label><span>Default validity months</span><input className="field" type="number" name="default_validity_months" min={1} defaultValue={initial?.defaultValidityMonths ?? ""} disabled={expirationMode === "disabled"} /></label>
      <label><span>Expiring-soon days</span><input className="field" type="number" name="expiring_soon_days" min={0} defaultValue={initial?.expiringSoonDays ?? 30} required /></label>
      <label><span>Retention months after separation</span><input className="field" type="number" name="retention_months_after_separation" min={1} defaultValue={initial?.retentionMonthsAfterSeparation ?? ""} /></label>
    </div>
    <label className="checkbox-row"><input type="checkbox" name="employee_upload_enabled" defaultChecked={initial?.employeeUploadEnabled ?? true} /> Employee uploads enabled</label>
    <fieldset><legend>Allowed file types</legend><div className="checkbox-grid">{mimeOptions.map(([value, label]) => <label className="checkbox-row" key={value}><input type="checkbox" name="allowed_mime_types" value={value} defaultChecked={(initial?.allowedMimeTypes ?? ["application/pdf", "image/jpeg", "image/png"]).includes(value)} /> {label}</label>)}</div></fieldset>
    <section className="content-stack"><div className="card-header-row"><div><h3>Custom fields</h3><p>Order and configure category-specific metadata.</p></div><button className="btn secondary" type="button" onClick={addField}>Add field</button></div>{fields.map((field, index) => <div className="document-field-builder" key={field.clientKey}>
      <label><span>Key</span><input className="field" value={field.fieldKey} onChange={(event) => updateField(field.clientKey, { fieldKey: event.target.value })} required /></label>
      <label><span>Label</span><input className="field" value={field.label} onChange={(event) => updateField(field.clientKey, { label: event.target.value })} required /></label>
      <label><span>Type</span><select className="field" value={field.fieldType} onChange={(event) => updateField(field.clientKey, { fieldType: event.target.value as DocumentCustomFieldType, selectOptions: event.target.value === "select" ? field.selectOptions : [] })}>{fieldTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
      {field.fieldType === "select" && <label><span>Options</span><input className="field" value={field.selectOptions.join(", ")} onChange={(event) => updateField(field.clientKey, { selectOptions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>}
      <label className="checkbox-row"><input type="checkbox" checked={field.isRequired} onChange={(event) => updateField(field.clientKey, { isRequired: event.target.checked })} /> Required</label>
      <label className="checkbox-row"><input type="checkbox" checked={field.employeeVisible} onChange={(event) => updateField(field.clientKey, { employeeVisible: event.target.checked })} /> Employee visible</label>
      <div className="button-row"><button className="btn secondary" type="button" onClick={() => moveField(index, -1)} disabled={index === 0}>Up</button><button className="btn secondary" type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1}>Down</button><button className="btn danger" type="button" onClick={() => setFields((current) => current.filter((item) => item.clientKey !== field.clientKey))}>Remove</button></div>
    </div>)}</section>
    <label><span>Change reason{mode === "revision" ? " *" : ""}</span><textarea className="field" name="change_reason" rows={3} maxLength={1000} required={mode === "revision"} defaultValue={mode === "create" ? "Initial configuration" : ""} /></label>
    {state.error && <p className="form-error">{state.error}</p>}{state.success && <p className="form-success">{state.success}</p>}
    <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Create category" : "Publish new version"}</button>
  </form>;
}
