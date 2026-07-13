# Phase 4B-1 Sensitive Employee Details Design

**Date:** 2026-07-14  
**Status:** Approved design, pending implementation planning  
**Product:** HRIS MVP  
**Scope:** Government identifiers and payroll/bank details only

## 1. Goal

Add a secure, HR-only employee profile area for Philippine government identifiers and payroll/bank details. Sensitive values must be encrypted before database storage, masked during normal profile viewing, revealed only through authorized server-side actions, and logged whenever an authorized user reveals plaintext.

Phase 4B-1 must preserve all Phase 4A employee-profile behavior and existing role permissions while adding stronger controls for protected HR data.

## 2. Scope

### Included

- SSS number
- PhilHealth number
- Pag-IBIG number
- TIN
- Bank name
- Account name
- Account number
- Payroll account type
- Server-side AES-256-GCM encryption
- HMAC-SHA256 hashes for government-ID duplicate detection
- Last-four masking
- Authorized per-field reveal for 30 seconds
- Immediate manual hide action
- Append-only sensitive-data reveal logs
- HR Admin and Super Admin-only access
- Dedicated profile tab and edit route
- Explicit clear-value actions
- Validation, RLS, tests, and deployment documentation

### Excluded

- Employee self-view of government or payroll details
- Employee self-editing
- Password re-entry before reveal
- National ID, passport, bank branch, SWIFT/BIC, or payroll employee code
- Full HR notes
- General employee activity history
- Change-history comparison UI
- Encryption-key rotation workflow
- Bulk import/export
- Payroll processing or payment initiation

These excluded features remain candidates for Phase 4B-2 or later phases.

## 3. Approved Product Decisions

- Super Admin and HR Admin can view masked values, reveal values, edit values, and explicitly clear values.
- Employees have no access to the tab, route, server actions, or database rows.
- Sensitive fields are masked by default and expose only the last four normalized characters.
- Reveal does not require password re-entry.
- Revealed plaintext remains visible for 30 seconds unless hidden sooner.
- Blank protected inputs preserve the existing encrypted value.
- Clearing a protected value requires a separate explicit action.
- SSS, PhilHealth, Pag-IBIG, and TIN must be unique across employees when present.
- Bank account numbers are not required to be unique.
- Every successful reveal is logged without storing plaintext, ciphertext, or masked output in the log.
- Encryption occurs in Next.js server-only code using Node's built-in cryptography APIs.
- Encryption and HMAC keys are server-only environment variables and never use the `NEXT_PUBLIC_` prefix.

## 4. Architecture

### 4.1 High-level design

Phase 4B-1 adds a focused sensitive-data feature boundary:

```text
src/
├── app/(dashboard)/employees/[id]/
│   ├── sensitive/
│   │   ├── page.tsx
│   │   └── edit/page.tsx
│   └── sensitive-actions.ts
├── components/
│   └── sensitive-field-reveal.tsx
├── features/employees/sensitive/
│   ├── auth.ts
│   ├── masking.ts
│   ├── queries.ts
│   ├── types.ts
│   ├── validation.ts
│   └── *.test.ts
└── lib/security/
    └── sensitive-data.ts

supabase/
└── migrations/
    └── 202607140001_sensitive_employee_details.sql
```

The exact file split may follow existing project conventions, but responsibilities must remain isolated:

- Security utilities handle encryption, decryption, hashing, normalization, and key validation.
- Validation handles form parsing and field-level errors.
- Queries return only masked/non-sensitive data during normal page loads.
- Reveal actions decrypt exactly one requested field after authorization.
- Update actions encrypt only newly supplied values and preserve blank fields.
- Database policies provide defense in depth.

### 4.2 Trust boundaries

Plaintext may exist only:

1. In an authorized HR user's submitted form data on the server.
2. In server memory while encrypting or decrypting.
3. In short-lived client component state after an authorized reveal.

Plaintext must never be written to:

- PostgreSQL columns
- Access-log rows
- Application logs
- URLs or search parameters
- Browser local storage
- Browser session storage
- Analytics events
- Error messages
- HTML rendered during the initial server response

## 5. Database Design

### 5.1 `employee_sensitive_details`

One optional row per employee.

Recommended columns:

```text
id uuid primary key
employee_id uuid not null unique references employees(id) on delete cascade
sss_ciphertext text null
sss_hash text null
sss_last4 text null
philhealth_ciphertext text null
philhealth_hash text null
philhealth_last4 text null
pagibig_ciphertext text null
pagibig_hash text null
pagibig_last4 text null
tin_ciphertext text null
tin_hash text null
tin_last4 text null
bank_name text null
account_name_ciphertext text null
account_name_last4 text null
account_number_ciphertext text null
account_number_last4 text null
payroll_account_type text null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
updated_by uuid null references profiles(id) on delete set null
```

Constraints:

- `payroll_account_type` is null or one of `savings`, `current`, `payroll`, `other`.
- Each ciphertext/hash/last-four group must remain internally consistent.
- Government hash columns use unique partial indexes where the hash is not null.
- `employee_id` is unique so an employee cannot have multiple sensitive-detail rows.
- `updated_at` is maintained by the same timestamp pattern used elsewhere in the project.

Partial unique indexes:

```text
sss_hash where sss_hash is not null
philhealth_hash where philhealth_hash is not null
pagibig_hash where pagibig_hash is not null
tin_hash where tin_hash is not null
```

Bank account numbers intentionally have no uniqueness constraint.

### 5.2 `sensitive_data_access_logs`

Append-only reveal log.

Recommended columns:

```text
id uuid primary key
actor_profile_id uuid not null references profiles(id) on delete restrict
employee_id uuid not null references employees(id) on delete cascade
field_name text not null
action text not null default 'reveal'
accessed_at timestamptz not null default now()
ip_address text null
user_agent text null
```

Allowed `field_name` values:

```text
sss_number
philhealth_number
pagibig_number
tin
account_name
account_number
```

Rules:

- The table contains metadata only.
- It never stores plaintext, ciphertext, hashes, last-four values, or previous/new values.
- Application roles cannot update or delete rows.
- Inserts occur only through authorized server-side actions.
- Viewing log history is deferred to Phase 4B-2, although authorized server code may query it for future use.

### 5.3 RLS policies

Enable RLS on both tables.

`employee_sensitive_details`:

- Super Admin and HR Admin may select rows.
- Super Admin and HR Admin may insert/update/delete through authenticated application sessions.
- Employee role receives no select or mutation policy.

`sensitive_data_access_logs`:

- Super Admin and HR Admin may insert reveal logs.
- No authenticated role may update or delete logs.
- Select access may be restricted to Super Admin and HR Admin for future audit UI use.

Application authorization remains mandatory even with RLS. RLS is defense in depth, not the only permission check.

## 6. Encryption and Hashing Design

### 6.1 Environment variables

```env
HRIS_DATA_ENCRYPTION_KEY=
HRIS_DATA_HASH_KEY=
```

Requirements:

- Both values are server-only.
- Each key must decode to at least 32 bytes of cryptographically strong random material.
- The application must fail closed when a key is missing or invalid.
- Production values must be configured in Vercel and backed up securely outside the code repository.
- Development values must live only in `.env.local`.
- `.env.example` contains placeholders and generation guidance, never real secrets.

### 6.2 Encryption

Use AES-256-GCM with:

- A fresh random 12-byte IV for every encryption.
- A 16-byte authentication tag.
- UTF-8 plaintext input.
- Base64url or base64 encoding for stored binary parts.
- A versioned payload format.

Payload format:

```text
v1.<iv>.<ciphertext>.<authTag>
```

Decryption must:

- Reject unknown versions.
- Reject malformed payloads.
- Reject authentication failures without returning partial plaintext.
- Avoid including ciphertext or plaintext in thrown error messages.

### 6.3 HMAC duplicate detection

Government-ID uniqueness uses:

```text
HMAC-SHA256(normalized_value, HRIS_DATA_HASH_KEY)
```

Properties:

- The same normalized value produces the same hash.
- Changing display punctuation does not bypass duplicate detection.
- Raw SHA-256 without a secret key is not used because government identifiers have a small, guessable input space.
- HMAC output is stored as a fixed lowercase hexadecimal string.

### 6.4 Normalization

Government identifiers are normalized to digits only before validation, encryption, hashing, and last-four extraction.

Bank account numbers preserve meaningful letters but normalize surrounding whitespace and repeated spaces. Hyphens may remain in encrypted plaintext, while masking uses the last four alphanumeric characters.

Account names are trimmed and internal repeated whitespace is collapsed.

## 7. Validation Rules

### 7.1 Government identifiers

Accepted formatted input is normalized before validation.

- SSS: exactly 10 digits
- PhilHealth: exactly 12 digits
- Pag-IBIG: exactly 12 digits
- TIN: 9 to 12 digits

Examples accepted by the form:

```text
SSS:        12-3456789-0
PhilHealth: 12-345678901-2
Pag-IBIG:   1234-5678-9012
TIN:        123-456-789-000
```

Reject:

- Letters in government-ID inputs
- Incorrect normalized lengths
- Duplicate normalized government identifiers
- Values exceeding form limits

### 7.2 Bank details

- Bank name: optional, trimmed, maximum 100 characters
- Account name: optional, trimmed, maximum 150 characters
- Account number: optional, maximum 50 characters; letters, digits, spaces, and hyphens only
- Payroll account type: optional; `savings`, `current`, `payroll`, or `other`
- Partial bank data is allowed

### 7.3 Update semantics

For protected values:

- Blank submitted input means keep the existing encrypted value unchanged.
- Non-blank valid input means replace ciphertext, related hash where applicable, and last-four value.
- Explicit clear flag means set ciphertext, hash, and last-four fields to null together.
- A field cannot be both replaced and cleared in the same request.

For non-protected values:

- Bank name and payroll account type may be prefilled and updated normally.
- Explicit blank values may clear these non-sensitive fields.

## 8. Masking Rules

Normal profile queries return only:

- Whether a protected value exists
- Its last four characters
- A generated masked display string
- Non-sensitive bank name and payroll account type

Examples:

```text
SSS:             ••••••1234
PhilHealth:      ••••••••1234
Pag-IBIG:        ••••••••1234
TIN:             •••••1234
Account name:    ••••••••Cruz
Account number:  ••••••••1234
```

Rules:

- At least four mask characters precede visible characters.
- Values with four or fewer normalized characters are fully masked.
- Missing values display `Not provided`.
- Masking is performed from stored last-four metadata, not by decrypting during normal page rendering.

## 9. Authorization Model

### 9.1 Role matrix

| Action | Super Admin | HR Admin | Employee |
|---|---:|---:|---:|
| See sensitive-data tab | Yes | Yes | No |
| Open sensitive-data route | Yes | Yes | No |
| View masked values | Yes | Yes | No |
| Reveal one protected field | Yes | Yes | No |
| Edit protected values | Yes | Yes | No |
| Clear protected values | Yes | Yes | No |
| Query encrypted columns directly through UI code | No | No | No |
| Update or delete access logs | No | No | No |

### 9.2 Route authorization

Both routes require a server-side role check before reading employee-sensitive records:

```text
/employees/[id]/sensitive
/employees/[id]/sensitive/edit
```

Unauthorized users are redirected to an existing unauthorized state, consistent with current project behavior.

Hiding the navigation tab is a usability measure only. Direct route and server-action authorization are mandatory.

### 9.3 Server actions

Every sensitive server action must:

1. Resolve the authenticated user.
2. Resolve the application profile and role.
3. Require `super_admin` or `hr_admin`.
4. Validate the employee exists and is accessible.
5. Validate the requested field/action.
6. Perform only the minimum required read or write.
7. Avoid logging sensitive inputs.

## 10. UI Design

### 10.1 Profile navigation

Add an authorized-only tab:

```text
Government & Payroll
```

The tab is hidden entirely for employees.

### 10.2 Sensitive details page

Recommended page sections:

#### Government IDs

Rows for:

- SSS number
- PhilHealth number
- Pag-IBIG number
- TIN

Each populated row contains:

- Label
- Masked value
- Reveal button
- Missing-value state when absent

#### Payroll and bank details

Rows for:

- Bank name
- Account name
- Account number
- Payroll account type

Bank name and payroll account type may display normally. Account name and account number remain masked.

Page-level actions:

- Edit details
- Return to employee profile

Clear controls belong on the edit page rather than the read-only page to reduce accidental deletion.

### 10.3 Reveal component

A client component manages one field's temporary plaintext state.

Behavior:

1. Initial state shows masked value.
2. Clicking Reveal calls a protected server action for one field.
3. On success, plaintext appears and a 30-second timer begins.
4. `Hide now` clears plaintext immediately.
5. Timer expiry clears plaintext from component state.
6. Navigation, unmount, or page refresh also removes plaintext.
7. Repeated reveal resets the timer and creates a new access-log row only when a fresh server reveal occurs.
8. The component never stores plaintext in persistent browser storage.

The UI should not copy plaintext automatically. A copy action is excluded from Phase 4B-1.

### 10.4 Edit page

Protected inputs are empty by default and never prefilled with plaintext.

Each protected field displays:

```text
Current value: ••••••••1234
Leave blank to keep unchanged.
```

Each protected field provides an explicit clear control. Clearing requires confirmation in the UI before submission.

Non-sensitive fields may be prefilled:

- Bank name
- Payroll account type

The form returns field-level validation errors and preserves non-sensitive entered values after a failed submission. Protected plaintext must not be embedded into error query strings or logs.

## 11. Data Flows

### 11.1 Normal page load

1. Server authorizes HR Admin or Super Admin.
2. Server queries only masked metadata and non-sensitive fields.
3. Server renders the page without decrypting any value.
4. No access-log row is created.

### 11.2 Reveal

1. Authorized user clicks Reveal for one field.
2. Server action revalidates session, role, employee, and field name.
3. Server loads only the requested ciphertext.
4. Server decrypts the value.
5. Server inserts one reveal-log row.
6. Server returns plaintext to the requesting component.
7. Client shows plaintext for 30 seconds.
8. Client clears plaintext automatically or when Hide now is clicked.

If log insertion fails, the reveal must fail closed and plaintext must not be returned. This ensures every successful reveal has a corresponding log.

### 11.3 Save

1. Server action revalidates session and role.
2. Form data is parsed and validated.
3. Existing sensitive row is loaded when present.
4. Blank protected fields preserve existing values.
5. Explicit clears set related storage fields to null.
6. Replacement values are normalized.
7. Government duplicate hashes are checked.
8. New plaintext is encrypted with a fresh IV.
9. One upsert writes the complete consistent row.
10. `updated_by` and `updated_at` are recorded.
11. Employee-sensitive route data is revalidated.
12. User is redirected with a success state.

Database unique-index violations are translated into field-level duplicate errors without exposing hashes or existing employee identities.

## 12. Error Handling

### User-facing messages

- Unauthorized: use the existing unauthorized state.
- Missing employee: use the existing not-found behavior.
- Duplicate identifier: show a field-specific message such as `This SSS number is already assigned to another employee.`
- Invalid format: show a field-specific validation message.
- Reveal failure: `Unable to reveal this value. Please try again.`
- Save failure: `Unable to save sensitive employee details.`
- Missing encryption configuration: generic save/reveal failure in UI; precise configuration error only in safe server diagnostics.

### Logging rules

Server diagnostics may include:

- Error category
- Database error code
- Requested field name
- Actor profile ID
- Employee ID

Server diagnostics must never include:

- Form values
- Plaintext
- Ciphertext
- HMAC output
- Last-four output when unnecessary
- Full serialized database rows

## 13. Testing Strategy

### 13.1 Security utility tests

- Encrypt/decrypt round trip
- Same plaintext yields different ciphertext due to random IVs
- Same normalized government ID yields the same HMAC
- Formatted and unformatted versions yield the same HMAC
- Tampered ciphertext fails authentication
- Wrong key fails safely
- Missing or invalid keys are rejected
- Plaintext does not appear in the encrypted payload
- Unsupported payload version is rejected

### 13.2 Validation and masking tests

- Valid formatted identifiers normalize correctly
- Invalid lengths fail with field errors
- Letters in government IDs fail
- Bank limits and allowed characters are enforced
- Supported payroll-account types pass
- Unsupported account type fails
- Blank protected input means preserve
- Explicit clear means null all related fields
- Replace and clear conflict is rejected
- Missing values mask as `Not provided`
- Last-four masking exposes no more than four characters
- Short values are fully masked

### 13.3 Authorization tests

- Super Admin can load, reveal, edit, and clear
- HR Admin can load, reveal, edit, and clear
- Employee cannot see the tab
- Employee direct route access is blocked
- Employee direct reveal-action invocation is blocked
- Employee direct update-action invocation is blocked

### 13.4 Database and RLS tests

- One sensitive-details row per employee
- Non-null government hashes are unique
- Bank account duplicates are allowed
- Employee role cannot select or mutate sensitive rows
- Access logs are append-only
- Deleting an employee cascades dependent sensitive details and logs

### 13.5 Reveal tests

- Successful reveal returns exactly one requested field
- Successful reveal creates exactly one access-log row
- Failed authorization creates no success log
- Failed decryption creates no success log
- Failed log insertion returns no plaintext
- Client timer hides plaintext after 30 seconds
- Hide now clears plaintext immediately
- Page refresh restores masked state

### 13.6 Update tests

- New details create one row
- Subsequent updates modify the same row
- Blank protected fields preserve ciphertext
- Explicit clear removes ciphertext/hash/last-four together
- Replacement produces fresh ciphertext
- Duplicate government ID maps to the correct field error
- `updated_by` records the acting profile

### 13.7 Build and manual QA

Required commands:

```bash
npm test
npm run build
```

Manual QA covers:

- Desktop and mobile layouts
- Keyboard access to Reveal and Hide now
- Screen-reader labels for sensitive actions
- Role switching across Super Admin, HR Admin, and Employee
- Direct-route attempts
- Duplicate-entry behavior
- Clear confirmation behavior
- 30-second reveal expiry
- Vercel environment-variable configuration

## 14. Deployment and Operations

### 14.1 Secret generation

Document a secure command for generating two independent 32-byte keys. Real output is never committed.

### 14.2 Key backup

Before production data entry:

- Store both keys in Vercel environment variables.
- Back up both keys in a secure password manager or secret-management system.
- Confirm the backup can be retrieved by an authorized project owner.
- Do not rotate or replace a key without a migration plan.

Losing `HRIS_DATA_ENCRYPTION_KEY` makes existing ciphertext unrecoverable. Changing `HRIS_DATA_HASH_KEY` breaks duplicate matching against existing hashes until all rows are rehashed.

### 14.3 Migration order

1. Apply database migration.
2. Reload the PostgREST schema if necessary.
3. Configure encryption and hash keys locally.
4. Run automated tests and build.
5. Configure the same secrets in Vercel production.
6. Deploy application code.
7. Verify role access and one test reveal in production.
8. Confirm an access-log row was created without sensitive content.

## 15. Completion Criteria

Phase 4B-1 is complete only when:

- Government identifiers and protected bank values are encrypted before database storage.
- Plaintext is absent from Supabase table columns and logs.
- Government-ID duplicates are prevented through HMAC hashes and database indexes.
- HR Admin and Super Admin see masked values by default.
- Employees cannot access the UI, routes, server actions, or database rows.
- Each reveal returns one field, expires after 30 seconds, and has a corresponding immutable log entry.
- Blank edit fields preserve existing protected values.
- Explicit clear actions remove all related storage columns consistently.
- Tests pass with no failures.
- The production build succeeds.
- Local and Vercel environment variables are documented and configured.
- Manual role and reveal QA passes in production.
