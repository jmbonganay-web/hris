# Phase 4B-2 — HR Notes and Audit History Design Specification

**Project:** HRIS  
**Date:** 2026-07-14  
**Status:** Approved design, pending implementation plan  
**Depends on:** Phase 4B-1 Protected Employee Details

---

## 1. Goal

Build a protected HR Notes module and an immutable employee Activity timeline that:

- Keeps HR note content encrypted at rest
- Restricts all note and activity access to HR Admin and Super Admin
- Allows HR Admins to manage only notes they created
- Allows Super Admins to manage all notes and restore deleted notes
- Records approved employee actions exactly once
- Prevents sensitive or private data from entering audit history
- Supports direct database changes through trigger-based fallback auditing

---

## 2. Scope

### Included

- HR note creation, editing, soft deletion, and restoration
- Five note categories:
  - General
  - Performance
  - Disciplinary
  - Medical
  - Payroll
- Encrypted HR note content
- Deleted-note archive for Super Admin
- Employee-specific Activity timeline
- Server-side filters and pagination
- Hybrid audit generation using PostgreSQL triggers and application logging
- Audit coverage for:
  - HR notes
  - Personal details
  - Employment details
  - Manager changes
  - Emergency contacts
  - Avatars
  - Employee archive and restore
  - Sensitive details
  - Sensitive-field reveals
- RLS and direct-route authorization
- Automated security and data-leak tests

### Excluded

- Permanent HR note deletion
- Employee self-service access to HR notes or activity
- HR note attachments
- HR note comments or discussion threads
- Audit export
- Audit editing or deletion
- Full-text search across encrypted notes
- Custom note categories
- User-configurable audit retention policies

---

## 3. Roles and permissions

### HR Notes

| Action | Super Admin | HR Admin | Employee |
|---|---:|---:|---:|
| View active notes | Yes | Yes | No |
| Create notes | Yes | Yes | No |
| Edit own notes | Yes | Yes | No |
| Edit another author’s notes | Yes | No | No |
| Soft-delete own notes | Yes | Yes | No |
| Soft-delete another author’s notes | Yes | No | No |
| View deleted-note archive | Yes | No | No |
| Restore deleted notes | Yes | No | No |
| Permanently delete notes | No | No | No |

### Audit History

| Action | Super Admin | HR Admin | Employee |
|---|---:|---:|---:|
| View employee activity | Yes | Yes | No |
| Filter and paginate activity | Yes | Yes | No |
| Create audit entries directly | Internal only | Internal only | No |
| Edit audit entries | No | No | No |
| Delete audit entries | No | No | No |

Authorization must be enforced at all layers:

- Navigation visibility
- Server-rendered route protection
- Server actions
- Database RLS
- Trigger/function permissions

Hiding controls alone is not sufficient.

---

## 4. Database model

### 4.1 `employee_hr_notes`

One row per HR note.

```text
id                  uuid primary key
employee_id         uuid not null references employees(id)
category            text not null
content_ciphertext  text not null
created_by          uuid not null references profiles(id)
created_at          timestamptz not null
updated_by          uuid null references profiles(id)
updated_at          timestamptz null
deleted_by          uuid null references profiles(id)
deleted_at          timestamptz null
```

Allowed category values:

```text
general
performance
disciplinary
medical
payroll
```

Rules:

- `content_ciphertext` stores only encrypted note content.
- Plaintext note content must never be stored in Supabase.
- Soft-deleted notes remain in the table.
- Normal note queries must include `deleted_at IS NULL`.
- Deleted-note archive queries must include `deleted_at IS NOT NULL`.
- Only Super Admin can view or restore deleted notes.
- HR Admin can edit or delete only rows where `created_by = auth.uid()`.
- Super Admin can edit or delete any active note.
- Deleted notes cannot be edited.
- Permanent deletion is not exposed through the application.

Recommended indexes:

```text
(employee_id, deleted_at, created_at desc)
(employee_id, category, created_at desc)
(created_by)
```

---

### 4.2 `employee_audit_logs`

Append-only employee activity history.

```text
id                uuid primary key
employee_id       uuid not null references employees(id)
actor_profile_id  uuid null references profiles(id)
action            text not null
entity_type       text not null
entity_id         uuid null
changed_fields    jsonb not null default '[]'
before_values     jsonb not null default '{}'
after_values      jsonb not null default '{}'
metadata          jsonb not null default '{}'
source            text not null
created_at        timestamptz not null
```

Allowed `source` values:

```text
application
database_trigger
```

Audit rows are immutable:

- No update policy
- No delete policy
- No application feature for modification
- Trigger/function permissions must not expose update or delete access

Recommended indexes:

```text
(employee_id, created_at desc, id desc)
(employee_id, entity_type, created_at desc)
(action, created_at desc)
(actor_profile_id, created_at desc)
```

---

## 5. Audit actions

Approved actions:

```text
hr_note.created
hr_note.updated
hr_note.deleted
hr_note.restored

personal_details.updated

employment_details.updated
manager.changed

emergency_contact.created
emergency_contact.updated
emergency_contact.deleted

avatar.uploaded
avatar.replaced
avatar.removed

employee.archived
employee.restored

sensitive_details.updated
sensitive_details.cleared
sensitive_field.revealed
```

Each business action must produce exactly one corresponding audit entry.

---

## 6. Encryption and private note handling

HR note text will use the existing Phase 4B-1 server-only encryption utility and:

```env
HRIS_DATA_ENCRYPTION_KEY
```

Requirements:

- AES-256-GCM
- Fresh random IV for every encryption
- Authentication tag verification during decryption
- Versioned ciphertext payload
- Encryption and decryption only in server-side code
- No client import of crypto utilities
- No plaintext note content in:
  - Database columns
  - Audit logs
  - Application logs
  - URLs or query parameters
  - Browser storage
  - Form error payloads
  - Analytics events

Identical note text must produce different ciphertext because each encryption uses a fresh IV.

A damaged or undecryptable note must:

- Not crash the entire page
- Display a safe unavailable-content state for that note
- Log only the technical failure server-side
- Never print ciphertext or plaintext into user-visible output

---

## 7. Audit privacy rules

### 7.1 Safe before/after values

Before and after values may be stored only for approved employment fields:

```text
department_id
job_title_id
manager_id
employment_type
employment_status
hire_date
probation_end_date
regularization_date
work_location
work_schedule
```

For relationship fields, safe snapshot labels may be stored:

```json
{
  "manager_id": {
    "id": "employee-id",
    "label": "Maria Santos"
  }
}
```

This preserves readable history if names or organizational labels change later.

### 7.2 Field names only

The following audit categories store changed field names but no values:

- Personal information
- Emergency contacts
- Sensitive government and bank details
- HR note content

Example:

```json
{
  "changed_fields": ["phone", "address_line_1"]
}
```

### 7.3 Prohibited audit data

Audit rows must never contain:

- HR note plaintext
- HR note ciphertext
- Government IDs
- Government ID hashes
- Government ID last-four values
- Bank account names
- Bank account numbers
- Revealed plaintext
- Encryption keys
- Passwords
- Session tokens
- Raw form payloads
- Sensitive ciphertext
- Sensitive hash columns

### 7.4 Sensitive field mapping

Database column changes must be translated to safe business labels:

```text
sss_ciphertext            -> sss_number
philhealth_ciphertext     -> philhealth_number
pagibig_ciphertext        -> pagibig_number
tin_ciphertext            -> tin
account_name_ciphertext   -> account_name
account_number_ciphertext -> account_number
```

Columns ending in `_hash`, `_last4`, or containing ciphertext payloads must not be copied into audit JSON.

---

## 8. Hybrid audit architecture

The system will use one audit owner per event type to prevent duplicate rows.

### 8.1 PostgreSQL triggers

Triggers own row-based database events:

| Table | Trigger-owned events |
|---|---|
| `employees` | employment updates, manager changes, avatar changes, archive/restore |
| `employee_personal_details` | personal details updated |
| `employee_emergency_contacts` | created, updated, deleted |
| `employee_sensitive_details` | sensitive fields updated or cleared |
| `employee_hr_notes` | created, updated, soft-deleted, restored |

Requirements:

- Triggers compare `OLD` and `NEW`.
- Triggers classify one update into the correct business action.
- A single application save must not create duplicate audit rows.
- Trigger functions use a fixed `search_path`.
- Trigger functions must not expose unsafe `security definer` behavior.
- Trigger failure rolls back the associated data change.
- Direct database changes without an authenticated actor use:
  - `actor_profile_id = null`
  - `source = database_trigger`
  - `metadata.actor_type = system_or_database`

### 8.2 Application logging

Application code owns non-row events:

```text
sensitive_field.revealed
```

A successful reveal must create:

1. A row in `sensitive_data_access_logs`
2. A row in `employee_audit_logs`

Both writes must happen through one PostgreSQL function so they succeed or fail together.

Plaintext may be returned only after:

- Authorization succeeds
- Decryption succeeds
- Compliance log insertion succeeds
- Activity log insertion succeeds

If logging fails, no plaintext is returned.

---

## 9. HR Notes UI

### 9.1 Profile navigation

Authorized users receive two new tabs:

```text
HR Notes
Activity
```

Final authorized profile navigation:

```text
Overview
Personal
Employment
Emergency Contacts
Government & Payroll
HR Notes
Activity
```

Employee users:

- Do not see either tab
- Cannot access any related route directly
- Do not receive note or activity data in server responses

### 9.2 Routes

```text
/employees/[id]/hr-notes
/employees/[id]/hr-notes/new
/employees/[id]/hr-notes/[noteId]/edit
/employees/[id]/hr-notes/deleted
/employees/[id]/activity
```

### 9.3 Active notes list

Each note card displays:

- Category badge
- Author name
- Created date and time
- Updated indicator when applicable
- Decrypted note body
- Edit control when permitted
- Delete control when permitted

Ordering:

```text
Newest first
```

Filters:

```text
All
General
Performance
Disciplinary
Medical
Payroll
```

Empty state:

```text
No HR notes have been added for this employee.
```

### 9.4 Create note

Fields:

- Category
- Note body
- Save
- Cancel

Validation:

- Category is required
- Category must be one of the five allowed values
- Note body is required
- Whitespace-only content is rejected
- Maximum length is 5,000 characters

Save flow:

1. Verify role
2. Validate employee and form input
3. Encrypt note body
4. Insert note
5. Trigger writes `hr_note.created`
6. Revalidate notes and activity routes
7. Redirect with success state

### 9.5 Edit note

Permissions:

- Super Admin can edit any active note
- HR Admin can edit only their own active note
- Deleted notes cannot be edited
- Employees cannot access the edit route

Edit form behavior:

- Decrypt note server-side
- Prefill authorized edit form only
- Encrypt saved body with a fresh IV
- Set `updated_by`
- Set `updated_at`
- Trigger writes `hr_note.updated`
- Audit changed fields only:
  - `category`
  - `content`

The audit log never receives note text.

### 9.6 Delete note

Deletion is soft delete only.

Confirmation copy:

```text
Delete this HR note?

The note will be removed from the active list. Only a Super Admin can restore it.
```

Delete flow:

- Verify permission
- Set `deleted_at`
- Set `deleted_by`
- Trigger writes `hr_note.deleted`
- Remove note from active list

### 9.7 Deleted-note archive

Only Super Admin can access:

```text
/employees/[id]/hr-notes/deleted
```

Archive shows:

- Category
- Original author
- Created date
- Deleted by
- Deleted date
- Decrypted note body
- Restore action

Restore flow:

- Clear `deleted_at`
- Clear `deleted_by`
- Trigger writes `hr_note.restored`
- Return note to active list

No permanent delete control is included.

---

## 10. Activity UI

### 10.1 Timeline content

Each entry displays:

- Human-readable action
- Actor
- Date and time
- Source
- Changed fields
- Safe before/after values when available

Examples:

```text
Employment details updated
Manager changed from Maria Santos to Joel Reyes
Emergency contact added
Sensitive details updated: SSS number, account number
HR note deleted
Profile photo replaced
```

Sensitive entries show only safe field names.

### 10.2 Filters

```text
All activity
Profile
Employment
Emergency contacts
Sensitive data
HR notes
System
```

Filtering occurs server-side.

### 10.3 Pagination

- 20 entries per page
- Newest first
- Stable ordering using `created_at DESC, id DESC`
- Filter and page stored in query parameters
- No edit or delete controls

### 10.4 Actor display

Authenticated actor:

```text
Display name or email
```

No authenticated actor:

```text
System / database operation
```

---

## 11. Data flows

### 11.1 Create HR note

1. Request reaches protected server action
2. Session and role are verified
3. Target employee is verified
4. Input is validated
5. Content is encrypted
6. Note is inserted
7. Trigger inserts one `hr_note.created` audit row
8. Pages are revalidated
9. User is redirected with success state

### 11.2 Edit HR note

1. Session and role are verified
2. Note ownership is verified for HR Admin
3. Deleted status is checked
4. Input is validated
5. Content is encrypted with a fresh IV
6. Note row is updated
7. Trigger inserts one `hr_note.updated` audit row
8. Pages are revalidated
9. User is redirected

### 11.3 Soft delete or restore

1. Session and role are verified
2. Ownership or Super Admin permission is checked
3. Delete or restore columns are updated
4. Trigger inserts exactly one matching audit row
5. Notes and Activity pages are revalidated

### 11.4 Activity query

1. HR Admin or Super Admin opens Activity
2. Server verifies role
3. Filter and page input are validated
4. Audit rows are queried by employee
5. Results use stable ordering
6. Actor and safe labels are resolved
7. Actions are transformed into readable descriptions
8. Twenty entries are rendered
9. Employees receive no audit JSON

---

## 12. Error handling

- Unauthorized requests return a generic unauthorized state.
- Protected routes do not reveal whether a note or audit row exists.
- Note decryption failure affects only that note card.
- Trigger failure rolls back the associated business change.
- Reveal logging failure prevents plaintext disclosure.
- Audit errors must not log:
  - Submitted note text
  - Government identifiers
  - Bank information
  - Ciphertext
  - Encryption keys
- Form validation returns field-level errors without echoing unsafe content.
- Empty results render appropriate empty states.
- Invalid filter or page input falls back to safe defaults.

---

## 13. Testing requirements

### 13.1 HR note validation tests

- Accept all five categories
- Reject unsupported categories
- Reject empty note body
- Reject whitespace-only note body
- Reject note body over 5,000 characters
- Encrypt before insertion
- Decrypt authorized content correctly
- Reject damaged ciphertext safely
- Produce different ciphertext for identical plaintext

### 13.2 Permission tests

| Scenario | Expected |
|---|---|
| Super Admin views active notes | Allowed |
| HR Admin views active notes | Allowed |
| Employee views notes | Blocked |
| Super Admin edits any note | Allowed |
| HR Admin edits own note | Allowed |
| HR Admin edits another author’s note | Blocked |
| Super Admin deletes any note | Allowed |
| HR Admin deletes own note | Allowed |
| HR Admin deletes another author’s note | Blocked |
| Super Admin views deleted archive | Allowed |
| HR Admin views deleted archive | Blocked |
| Super Admin restores note | Allowed |
| Employee calls note actions directly | Blocked |

### 13.3 Audit generation tests

Each approved operation creates exactly one audit row:

- HR note created
- HR note updated
- HR note deleted
- HR note restored
- Personal details updated
- Employment details updated
- Manager changed
- Emergency contact created
- Emergency contact updated
- Emergency contact deleted
- Avatar uploaded
- Avatar replaced
- Avatar removed
- Employee archived
- Employee restored
- Sensitive details updated
- Sensitive details cleared
- Sensitive field revealed

Tests verify:

- No duplicate rows
- Correct actor
- Correct employee
- Correct action
- Correct entity type
- Correct source
- Direct database operations display as system activity

### 13.4 Data-leak tests

Use recognizable sentinel values:

```text
DO_NOT_LOG_NOTE_TEXT
DO_NOT_LOG_SSS_1234567890
DO_NOT_LOG_BANK_99887766
```

After related operations, verify none of those strings appear anywhere in `employee_audit_logs`.

Also verify audit rows never contain:

- HR note ciphertext
- Sensitive ciphertext
- Government ID hashes
- Last-four values
- Bank account data
- Reveal plaintext
- Encryption keys

### 13.5 UI tests

HR Notes:

- Tabs visible only to authorized roles
- Newest-first ordering
- Category filters work
- Create/edit/delete success and error states work
- Permission-based actions are hidden and server-enforced
- Deleted notes disappear from active list
- Deleted archive is Super Admin-only
- Long notes wrap correctly
- Damaged notes show safe unavailable state

Activity:

- Tab visible only to authorized roles
- Newest-first stable ordering
- Filters work
- Pagination is 20 entries per page
- Descriptions match action types
- Safe before/after values display correctly
- Sensitive actions show field names only
- No edit or delete controls appear

### 13.6 Direct-route tests

Employee role must be blocked from:

```text
/employees/[own-id]/hr-notes
/employees/[own-id]/hr-notes/new
/employees/[own-id]/activity
/employees/[other-id]/hr-notes
/employees/[other-id]/activity
```

HR Admin must be blocked from:

```text
/employees/[id]/hr-notes/deleted
```

No protected page may briefly render before redirect.

### 13.7 Database and RLS tests

- RLS enabled on both new tables
- Employees cannot select notes or audit rows
- HR Admin cannot select deleted notes
- Super Admin can select deleted notes
- Audit rows cannot be updated or deleted
- Soft-deleted notes remain stored
- Restore clears `deleted_at` and `deleted_by`
- Trigger functions use fixed `search_path`
- No unsafe function privileges
- Foreign-key cleanup rules behave as defined

---

## 14. Rollout plan

1. Back up production Supabase database
2. Apply Phase 4B-2 migration
3. Reload PostgREST schema cache
4. Deploy updated Next.js application
5. Smoke test as Super Admin
6. Smoke test as HR Admin
7. Run direct-route tests as Employee
8. Create, edit, delete, and restore one disposable HR note
9. Perform one action from each audit category
10. Inspect audit rows for actor, source, and prohibited data
11. Run automated tests
12. Run production build
13. Monitor server and Supabase logs for trigger or decryption failures

---

## 15. Completion criteria

Phase 4B-2 is complete when:

- HR notes are encrypted at rest
- Employees cannot access HR notes or activity
- HR Admin can manage only notes they created
- Super Admin can manage all notes and restore deleted notes
- Soft deletion works without permanent deletion
- Every approved business event creates exactly one audit entry
- Audit rows contain only approved safe data
- Sensitive reveals create compliance and activity logs atomically
- Audit rows cannot be edited or deleted
- Filters and pagination work
- Responsive and direct-route tests pass
- Full automated test suite reports zero failures
- Production build completes successfully
