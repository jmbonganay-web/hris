import type { DocumentCustomFieldDefinition } from "@/features/documents/types";
export function DocumentMetadataFields({ fields, employeeMode = true }: { fields: DocumentCustomFieldDefinition[]; employeeMode?: boolean }) {
  const visibleFields = employeeMode ? fields.filter((field) => field.employeeVisible) : fields;
  return <div className="document-detail-grid">
    <label><span>Title *</span><input className="field" name="title" required maxLength={160} /></label>
    <label><span>Reference number</span><input className="field" name="reference_number" maxLength={160} /></label>
    <label><span>Issue date</span><input className="field" name="issue_date" type="date" /></label>
    <label><span>Expiration date</span><input className="field" name="expiration_date" type="date" /></label>
    <label><span>Issuing organization</span><input className="field" name="issuing_organization" maxLength={200} /></label>
    <label className="full-span"><span>Notes</span><textarea className="field" name="notes" maxLength={2000} rows={3} /></label>
    <label className="full-span"><span>Tags</span><input className="field" name="tags" placeholder="Separate tags with commas" /></label>
    {visibleFields.map((field) => <label className={field.fieldType === "long_text" ? "full-span" : undefined} key={field.fieldKey}><span>{field.label}{field.isRequired ? " *" : ""}</span>
      {field.fieldType === "long_text" ? <textarea className="field" name={`custom_${field.fieldKey}`} required={field.isRequired} rows={3} />
        : field.fieldType === "select" ? <select className="field" name={`custom_${field.fieldKey}`} required={field.isRequired}><option value="">Select</option>{field.selectOptions.map((option) => <option key={option}>{option}</option>)}</select>
          : field.fieldType === "boolean" ? <select className="field" name={`custom_${field.fieldKey}`} required={field.isRequired}><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select>
            : <input className="field" name={`custom_${field.fieldKey}`} type={field.fieldType === "date" ? "date" : field.fieldType === "number" ? "number" : "text"} required={field.isRequired} />}
    </label>)}
  </div>;
}
