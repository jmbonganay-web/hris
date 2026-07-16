begin;

-- Phase 7: secure employee document management foundation.

create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_categories_code_format check (code ~ '^[a-z][a-z0-9_]{2,63}$')
);
create unique index if not exists document_categories_code_unique on public.document_categories(code);

create table if not exists public.document_category_versions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.document_categories(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text,
  default_visibility text not null check (default_visibility in ('employee_hr', 'hr_only', 'super_admin_only')),
  employee_upload_enabled boolean not null default false,
  cardinality text not null check (cardinality in ('single', 'multiple')),
  allowed_mime_types text[] not null check (cardinality(allowed_mime_types) > 0),
  expiration_mode text not null check (expiration_mode in ('required', 'optional', 'disabled')),
  default_validity_months integer check (default_validity_months is null or default_validity_months > 0),
  expiring_soon_days integer not null default 30 check (expiring_soon_days >= 0),
  retention_months_after_separation integer check (retention_months_after_separation is null or retention_months_after_separation >= 0),
  change_reason text not null check (length(btrim(change_reason)) > 0),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint document_category_versions_expiration_check check (
    (expiration_mode = 'disabled' and default_validity_months is null)
    or expiration_mode <> 'disabled'
  )
);
create unique index if not exists document_category_versions_number_unique
  on public.document_category_versions(category_id, version_number);
create index if not exists document_category_versions_current_idx
  on public.document_category_versions(category_id, version_number desc, created_at desc);

create table if not exists public.document_category_fields (
  id uuid primary key default gen_random_uuid(),
  category_version_id uuid not null references public.document_category_versions(id) on delete restrict,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label text not null check (length(btrim(label)) > 0),
  field_type text not null check (field_type in ('text', 'long_text', 'number', 'date', 'boolean', 'select')),
  is_required boolean not null default false,
  select_options text[] not null default '{}',
  employee_visible boolean not null default true,
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  constraint document_category_fields_options_check check (
    (field_type = 'select' and cardinality(select_options) > 0)
    or (field_type <> 'select' and cardinality(select_options) = 0)
  )
);
create unique index if not exists document_category_fields_key_unique
  on public.document_category_fields(category_version_id, field_key);
create unique index if not exists document_category_fields_order_unique
  on public.document_category_fields(category_version_id, display_order);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  category_id uuid not null references public.document_categories(id) on delete restrict,
  active_version_id uuid,
  cardinality_snapshot text not null check (cardinality_snapshot in ('single', 'multiple')),
  visibility_override text check (visibility_override is null or visibility_override in ('employee_hr', 'hr_only', 'super_admin_only')),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employee_documents_employee_category_idx
  on public.employee_documents(employee_id, category_id, archived_at);
create unique index if not exists employee_documents_single_active_unique
  on public.employee_documents(employee_id, category_id)
  where archived_at is null and cardinality_snapshot = 'single';

create table if not exists public.employee_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.employee_documents(id) on delete restrict,
  category_version_id uuid not null references public.document_category_versions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  source text not null check (source in ('employee', 'hr')),
  review_status text not null check (review_status in ('draft', 'pending_review', 'approved', 'rejected', 'replacement_requested')),
  supersedes_version_id uuid references public.employee_document_versions(id) on delete restrict,
  original_filename text not null,
  safe_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes bigint not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  title text not null check (length(btrim(title)) between 1 and 160),
  reference_number text,
  issue_date date,
  expiration_date date,
  issuing_organization text,
  notes text,
  tags text[] not null default '{}',
  custom_metadata jsonb not null default '{}'::jsonb,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_document_versions_size_check check (size_bytes between 1 and 15 * 1024 * 1024),
  constraint employee_document_versions_dates_check check (issue_date is null or expiration_date is null or issue_date <= expiration_date)
);
create unique index if not exists employee_document_versions_number_unique
  on public.employee_document_versions(document_id, version_number);
create index if not exists employee_document_versions_review_queue_idx
  on public.employee_document_versions(review_status, submitted_at desc)
  where review_status in ('pending_review', 'replacement_requested');
create index if not exists employee_document_versions_expiration_idx
  on public.employee_document_versions(expiration_date)
  where review_status = 'approved';

alter table public.employee_documents
  drop constraint if exists employee_documents_active_version_fkey;
alter table public.employee_documents
  add constraint employee_documents_active_version_fkey
  foreign key (active_version_id) references public.employee_document_versions(id)
  deferrable initially deferred;

create table if not exists public.document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.employee_document_versions(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected', 'replacement_requested')),
  internal_reason text,
  employee_message text,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint document_reviews_reason_check check (
    (decision = 'approved')
    or length(btrim(coalesce(internal_reason, ''))) > 0
  ),
  constraint document_reviews_replacement_message_check check (
    decision <> 'replacement_requested'
    or length(btrim(coalesce(employee_message, ''))) > 0
  )
);
create unique index if not exists document_reviews_version_unique
  on public.document_reviews(document_version_id);
create unique index if not exists document_reviews_request_unique
  on public.document_reviews(reviewer_user_id, request_id);

create table if not exists public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.document_categories(id) on delete restrict,
  required_count integer not null check (required_count > 0),
  expired_satisfies boolean not null default false,
  effective_from date not null,
  effective_to date,
  supersedes_requirement_id uuid references public.document_requirements(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint document_requirements_dates_check check (effective_to is null or effective_to >= effective_from)
);
create index if not exists document_requirements_effective_idx
  on public.document_requirements(category_id, effective_from desc, effective_to, created_at desc)
  where archived_at is null;

create table if not exists public.document_requirement_targets (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.document_requirements(id) on delete restrict,
  target_type text not null check (target_type in ('all_active_employees', 'department', 'job_title', 'employment_type', 'employee')),
  target_id text,
  created_at timestamptz not null default now(),
  constraint document_requirement_targets_shape_check check (
    (target_type = 'all_active_employees' and target_id is null)
    or (target_type <> 'all_active_employees' and length(btrim(coalesce(target_id, ''))) > 0)
  )
);
create unique index if not exists document_requirement_targets_unique
  on public.document_requirement_targets(requirement_id, target_type, coalesce(target_id, ''));

create table if not exists public.document_permission_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_code text not null check (permission_code in ('documents.review', 'documents.manage')),
  granted_by uuid not null references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  request_id uuid not null
);
create unique index if not exists document_permission_grants_active_unique
  on public.document_permission_grants(user_id, permission_code)
  where revoked_at is null;
create index if not exists document_permission_grants_user_idx
  on public.document_permission_grants(user_id, revoked_at);

create table if not exists public.document_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  category_id uuid not null references public.document_categories(id) on delete restrict,
  category_version_id uuid not null references public.document_category_versions(id) on delete restrict,
  source text not null check (source in ('employee', 'hr')),
  status text not null default 'pending' check (status in ('pending', 'finalized', 'cancelled', 'expired', 'failed')),
  save_as_draft boolean not null default false,
  replacement_document_id uuid references public.employee_documents(id) on delete restrict,
  supersedes_version_id uuid references public.employee_document_versions(id) on delete restrict,
  visibility_override text check (visibility_override is null or visibility_override in ('employee_hr', 'hr_only', 'super_admin_only')),
  common_metadata jsonb not null default '{}'::jsonb,
  manifest_count integer not null,
  idempotency_key uuid not null,
  expires_at timestamptz not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_upload_sessions_manifest_count_check check (manifest_count >= 1 and manifest_count <= 10)
);
create unique index if not exists document_upload_sessions_actor_idempotency_unique
  on public.document_upload_sessions(actor_user_id, idempotency_key);
create index if not exists document_upload_sessions_expiry_idx
  on public.document_upload_sessions(status, expires_at)
  where status = 'pending';

create table if not exists public.document_upload_session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.document_upload_sessions(id) on delete cascade,
  client_file_key text not null,
  planned_document_id uuid not null,
  planned_version_id uuid not null,
  original_filename text not null,
  safe_filename text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  expected_size_bytes bigint not null check (expected_size_bytes between 1 and 15 * 1024 * 1024),
  extension text not null check (extension in ('pdf', 'jpg', 'jpeg', 'png', 'docx')),
  storage_path text not null unique,
  verified_at timestamptz,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists document_upload_session_files_client_key_unique
  on public.document_upload_session_files(session_id, client_file_key);

create table if not exists public.document_lifecycle_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  request_id uuid not null,
  target_key text not null,
  result jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists document_lifecycle_actions_idempotency_unique
  on public.document_lifecycle_actions(actor_user_id, action, request_id);

create table if not exists public.document_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  employee_id uuid references public.employees(id) on delete set null,
  category_id uuid references public.document_categories(id) on delete set null,
  document_id uuid references public.employee_documents(id) on delete set null,
  document_version_id uuid references public.employee_document_versions(id) on delete set null,
  request_id uuid,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists document_audit_logs_document_idx
  on public.document_audit_logs(document_id, created_at desc);
create index if not exists document_audit_logs_employee_idx
  on public.document_audit_logs(employee_id, created_at desc);

create table if not exists public.document_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  employee_id uuid,
  category_id uuid,
  classification text not null check (classification in ('invalid', 'duplicate', 'mistaken_upload')),
  reason text not null check (length(btrim(reason)) > 0),
  requested_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  storage_cleanup_status text not null default 'pending' check (storage_cleanup_status in ('pending', 'completed', 'failed')),
  cleanup_error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists document_deletion_tombstones_request_unique
  on public.document_deletion_tombstones(requested_by, request_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  resource_type text,
  resource_id uuid,
  source_event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_recipient_event_unique
  on public.notifications(recipient_user_id, source_event_key);
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, created_at desc)
  where read_at is null;

create or replace function public.prevent_document_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if current_setting('app.document_workflow', true) <> 'on' then
    raise exception 'DOCUMENT_VERSION_STALE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists document_category_versions_immutable on public.document_category_versions;
create trigger document_category_versions_immutable
before update or delete on public.document_category_versions
for each row execute function public.prevent_document_immutable_mutation();

drop trigger if exists document_category_fields_immutable on public.document_category_fields;
create trigger document_category_fields_immutable
before update or delete on public.document_category_fields
for each row execute function public.prevent_document_immutable_mutation();

drop trigger if exists employee_document_versions_immutable on public.employee_document_versions;
create trigger employee_document_versions_immutable
before update or delete on public.employee_document_versions
for each row execute function public.prevent_document_immutable_mutation();

drop trigger if exists document_reviews_immutable on public.document_reviews;
create trigger document_reviews_immutable
before update or delete on public.document_reviews
for each row execute function public.prevent_document_immutable_mutation();

drop trigger if exists document_audit_logs_immutable on public.document_audit_logs;
create trigger document_audit_logs_immutable
before update or delete on public.document_audit_logs
for each row execute function public.prevent_document_immutable_mutation();

drop trigger if exists document_deletion_tombstones_immutable on public.document_deletion_tombstones;
create trigger document_deletion_tombstones_immutable
before update or delete on public.document_deletion_tombstones
for each row execute function public.prevent_document_immutable_mutation();

create or replace function public.validate_employee_document_active_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.active_version_id is not null and not exists (
    select 1
    from public.employee_document_versions v
    where v.id = new.active_version_id
      and v.document_id = new.id
      and v.review_status = 'approved'
  ) then
    raise exception 'DOCUMENT_ACTIVE_VERSION_CONFLICT';
  end if;
  return new;
end;
$$;

drop trigger if exists employee_documents_active_version_guard on public.employee_documents;
create constraint trigger employee_documents_active_version_guard
after insert or update of active_version_id on public.employee_documents
deferrable initially deferred
for each row execute function public.validate_employee_document_active_version();

create or replace function public.assert_safe_document_audit_payload(p_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_payload, '{}'::jsonb)::text ~* '"(signed_url|storage_path|service_role|raw_file|access_token)"[[:space:]]*:' then
    raise exception 'DOCUMENT_INVALID_METADATA';
  end if;
end;
$$;

create or replace function public.guard_document_audit_payload()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_safe_document_audit_payload(new.summary);
  return new;
end;
$$;

drop trigger if exists document_audit_payload_guard on public.document_audit_logs;
create trigger document_audit_payload_guard
before insert on public.document_audit_logs
for each row execute function public.guard_document_audit_payload();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  15 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.document_categories enable row level security;
alter table public.document_category_versions enable row level security;
alter table public.document_category_fields enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employee_document_versions enable row level security;
alter table public.document_reviews enable row level security;
alter table public.document_requirements enable row level security;
alter table public.document_requirement_targets enable row level security;
alter table public.document_permission_grants enable row level security;
alter table public.document_upload_sessions enable row level security;
alter table public.document_upload_session_files enable row level security;
alter table public.document_lifecycle_actions enable row level security;
alter table public.document_audit_logs enable row level security;
alter table public.document_deletion_tombstones enable row level security;
alter table public.notifications enable row level security;

revoke all on public.document_categories from authenticated;
revoke all on public.document_category_versions from authenticated;
revoke all on public.document_category_fields from authenticated;
revoke all on public.employee_documents from authenticated;
revoke all on public.employee_document_versions from authenticated;
revoke all on public.document_reviews from authenticated;
revoke all on public.document_requirements from authenticated;
revoke all on public.document_requirement_targets from authenticated;
revoke all on public.document_permission_grants from authenticated;
revoke all on public.document_upload_sessions from authenticated;
revoke all on public.document_upload_session_files from authenticated;
revoke all on public.document_lifecycle_actions from authenticated;
revoke all on public.document_audit_logs from authenticated;
revoke all on public.document_deletion_tombstones from authenticated;
revoke all on public.notifications from authenticated;

grant select on public.document_categories to authenticated;
grant select on public.document_category_versions to authenticated;
grant select on public.document_category_fields to authenticated;
grant select on public.employee_documents to authenticated;
grant select on public.document_permission_grants to authenticated;
grant select on public.notifications to authenticated;

drop policy if exists document_categories_safe_select on public.document_categories;
create policy document_categories_safe_select on public.document_categories
for select to authenticated
using (
  public.is_hr_admin()
  or exists (
    select 1
    from public.document_category_versions v
    where v.category_id = document_categories.id
      and v.version_number = (
        select max(v2.version_number)
        from public.document_category_versions v2
        where v2.category_id = document_categories.id
      )
      and v.default_visibility = 'employee_hr'
      and v.employee_upload_enabled
  )
);

drop policy if exists document_category_versions_safe_select on public.document_category_versions;
create policy document_category_versions_safe_select on public.document_category_versions
for select to authenticated
using (
  public.is_hr_admin()
  or (
    default_visibility = 'employee_hr'
    and employee_upload_enabled
    and exists (
      select 1 from public.document_categories c
      where c.id = category_id and c.archived_at is null
    )
  )
);

drop policy if exists document_category_fields_safe_select on public.document_category_fields;
create policy document_category_fields_safe_select on public.document_category_fields
for select to authenticated
using (
  public.is_hr_admin()
  or (
    employee_visible
    and exists (
      select 1 from public.document_category_versions v
      join public.document_categories c on c.id = v.category_id
      where v.id = category_version_id
        and v.default_visibility = 'employee_hr'
        and v.employee_upload_enabled
        and c.archived_at is null
    )
  )
);

drop policy if exists employee_documents_safe_select on public.employee_documents;
create policy employee_documents_safe_select on public.employee_documents
for select to authenticated
using (
  public.is_hr_admin()
  or exists (
    select 1 from public.employees e
    join public.document_category_versions v on v.category_id = employee_documents.category_id
    where e.id = employee_documents.employee_id
      and e.profile_id = auth.uid()
      and v.version_number = (
        select max(v2.version_number)
        from public.document_category_versions v2
        where v2.category_id = employee_documents.category_id
      )
      and coalesce(employee_documents.visibility_override, v.default_visibility) = 'employee_hr'
  )
);

drop policy if exists document_permission_grants_own_select on public.document_permission_grants;
create policy document_permission_grants_own_select on public.document_permission_grants
for select to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
for select to authenticated
using (recipient_user_id = auth.uid());

create or replace view public.document_current_category_versions
with (security_invoker = true)
as
select
  c.id as category_id,
  c.code,
  c.archived_at,
  v.id as version_id,
  v.version_number,
  v.name,
  v.description,
  v.default_visibility,
  v.employee_upload_enabled,
  v.cardinality,
  v.allowed_mime_types,
  v.expiration_mode,
  v.default_validity_months,
  v.expiring_soon_days,
  v.retention_months_after_separation,
  v.created_at,
  f.id as field_id,
  f.field_key,
  f.label as field_label,
  f.field_type,
  f.is_required as field_required,
  f.select_options,
  f.employee_visible,
  f.display_order
from public.document_categories c
join public.document_category_versions v
  on v.category_id = c.id
 and v.version_number = (
   select max(v2.version_number)
   from public.document_category_versions v2
   where v2.category_id = c.id
 )
left join public.document_category_fields f on f.category_version_id = v.id;

create or replace view public.document_employee_safe_list
with (security_invoker = true)
as
select
  d.id as document_id,
  d.employee_id,
  d.category_id,
  d.active_version_id,
  d.archived_at,
  d.updated_at
from public.employee_documents d;

create or replace view public.document_hr_review_queue
with (security_invoker = true)
as
select
  v.document_id,
  v.id as version_id,
  d.employee_id,
  d.category_id,
  v.review_status,
  v.submitted_at,
  v.updated_at as expected_updated_at
from public.employee_document_versions v
join public.employee_documents d on d.id = v.document_id
where v.review_status in ('pending_review', 'replacement_requested');

create or replace view public.document_active_requirement_rules
with (security_invoker = true)
as
select
  r.id as requirement_id,
  r.category_id,
  r.required_count,
  r.expired_satisfies,
  r.effective_from,
  r.effective_to,
  r.created_at,
  t.target_type,
  t.target_id
from public.document_requirements r
join public.document_requirement_targets t on t.requirement_id = r.id
where r.archived_at is null;

grant select on public.document_current_category_versions to authenticated;
grant select on public.document_employee_safe_list to authenticated;
revoke all on public.document_hr_review_queue from authenticated;
revoke all on public.document_active_requirement_rules from authenticated;


-- Stable workflow errors exposed by the document domain:
-- DOCUMENT_PERMISSION_DENIED DOCUMENT_CATEGORY_NOT_FOUND DOCUMENT_CATEGORY_ARCHIVED
-- DOCUMENT_CATEGORY_STALE DOCUMENT_INVALID_VISIBILITY DOCUMENT_INVALID_METADATA
-- DOCUMENT_INVALID_FILE DOCUMENT_FILE_TOO_LARGE DOCUMENT_FILE_COUNT_EXCEEDED
-- DOCUMENT_CARDINALITY_CONFLICT DOCUMENT_UPLOAD_SESSION_INVALID DOCUMENT_UPLOAD_SESSION_EXPIRED
-- DOCUMENT_UPLOAD_INCOMPLETE DOCUMENT_VERSION_STALE DOCUMENT_INVALID_STATUS
-- DOCUMENT_SELF_REVIEW_FORBIDDEN DOCUMENT_REVIEW_ALREADY_COMPLETED
-- DOCUMENT_REJECTION_REASON_REQUIRED DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED
-- DOCUMENT_ACTIVE_VERSION_CONFLICT DOCUMENT_REQUIREMENT_CONFLICT
-- DOCUMENT_PERMISSION_GRANT_INVALID DOCUMENT_ARCHIVED DOCUMENT_DELETE_REASON_REQUIRED
-- DOCUMENT_ACCESS_DENIED DOCUMENT_NOT_PREVIEWABLE DOCUMENT_NOT_FOUND

create or replace function public.current_document_actor()
returns table(user_id uuid, role text, employee_id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.role::text, e.id
  from public.profiles p
  left join public.employees e on e.profile_id = p.id and e.archived_at is null
  where p.id = auth.uid()
$$;

create or replace function public.has_document_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'super_admin'
        or (
          p.role = 'hr_admin'
          and exists (
            select 1
            from public.document_permission_grants g
            where g.user_id = p.id
              and g.permission_code = p_permission
              and g.revoked_at is null
          )
        )
      )
  )
$$;

create or replace function public.write_document_audit(
  p_action text,
  p_employee_id uuid,
  p_category_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_request_id uuid,
  p_summary jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  perform public.assert_safe_document_audit_payload(coalesce(p_summary, '{}'::jsonb));
  insert into public.document_audit_logs(
    id, actor_user_id, action, employee_id, category_id, document_id,
    document_version_id, request_id, summary, created_at
  ) values (
    v_id, auth.uid(), p_action, p_employee_id, p_category_id, p_document_id,
    p_version_id, p_request_id, coalesce(p_summary, '{}'::jsonb), now()
  );
  return v_id;
end;
$$;

create or replace function public.create_document_notification(
  p_recipient_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_resource_type text,
  p_resource_id uuid,
  p_source_event_key text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications(
    id, recipient_user_id, type, title, body, resource_type, resource_id,
    source_event_key, created_at
  ) values (
    gen_random_uuid(), p_recipient_user_id, p_type, p_title, p_body,
    p_resource_type, p_resource_id, p_source_event_key, now()
  )
  on conflict (recipient_user_id, source_event_key)
  do update set source_event_key = excluded.source_event_key
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.document_prior_action_result(
  p_action text,
  p_request_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.result
  from public.document_lifecycle_actions a
  where a.actor_user_id = auth.uid()
    and a.action = p_action
    and a.request_id = p_request_id
  limit 1
$$;

create or replace function public.insert_document_category_fields(
  p_category_version_id uuid,
  p_fields jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_field jsonb;
  v_options text[];
begin
  if jsonb_typeof(coalesce(p_fields, '[]'::jsonb)) <> 'array' then
    raise exception 'DOCUMENT_INVALID_METADATA';
  end if;
  for v_field in select value from jsonb_array_elements(coalesce(p_fields, '[]'::jsonb)) loop
    v_options := array(
      select jsonb_array_elements_text(coalesce(v_field -> 'selectOptions', '[]'::jsonb))
    );
    insert into public.document_category_fields(
      category_version_id, field_key, label, field_type, is_required,
      select_options, employee_visible, display_order
    ) values (
      p_category_version_id,
      btrim(v_field ->> 'fieldKey'),
      btrim(v_field ->> 'label'),
      v_field ->> 'fieldType',
      coalesce((v_field ->> 'isRequired')::boolean, false),
      v_options,
      coalesce((v_field ->> 'employeeVisible')::boolean, true),
      (v_field ->> 'displayOrder')::integer
    );
  end loop;
exception
  when unique_violation or check_violation or invalid_text_representation then
    raise exception 'DOCUMENT_INVALID_METADATA';
end;
$$;

create or replace function public.create_document_category(
  p_code text,
  p_name text,
  p_description text,
  p_default_visibility text,
  p_employee_upload_enabled boolean,
  p_cardinality text,
  p_allowed_mime_types text[],
  p_expiration_mode text,
  p_default_validity_months integer,
  p_expiring_soon_days integer,
  p_retention_months_after_separation integer,
  p_change_reason text,
  p_fields jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_category_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  select * into v_actor from public.current_document_actor();
  if not public.has_document_permission('documents.manage') then
    raise exception 'DOCUMENT_PERMISSION_DENIED';
  end if;
  if p_default_visibility = 'super_admin_only' and v_actor.role <> 'super_admin' then
    raise exception 'DOCUMENT_INVALID_VISIBILITY';
  end if;
  if p_request_id is null then raise exception 'DOCUMENT_INVALID_METADATA'; end if;
  select result into v_result
  from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'create_document_category' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  if p_code !~ '^[a-z][a-z0-9_]{2,63}$'
     or length(btrim(coalesce(p_name, ''))) = 0
     or p_default_visibility not in ('employee_hr', 'hr_only', 'super_admin_only')
     or p_cardinality not in ('single', 'multiple')
     or p_expiration_mode not in ('required', 'optional', 'disabled')
     or coalesce(cardinality(p_allowed_mime_types), 0) = 0
     or length(btrim(coalesce(p_change_reason, ''))) = 0 then
    raise exception 'DOCUMENT_INVALID_METADATA';
  end if;
  insert into public.document_categories(id, code, created_by)
  values (v_category_id, p_code, auth.uid());
  insert into public.document_category_versions(
    id, category_id, version_number, name, description, default_visibility,
    employee_upload_enabled, cardinality, allowed_mime_types, expiration_mode,
    default_validity_months, expiring_soon_days, retention_months_after_separation,
    change_reason, created_by
  ) values (
    v_version_id, v_category_id, 1, btrim(p_name), nullif(btrim(p_description), ''),
    p_default_visibility, coalesce(p_employee_upload_enabled, false), p_cardinality,
    p_allowed_mime_types, p_expiration_mode, p_default_validity_months,
    coalesce(p_expiring_soon_days, 30), p_retention_months_after_separation,
    btrim(p_change_reason), auth.uid()
  );
  perform public.insert_document_category_fields(v_version_id, p_fields);
  v_result := jsonb_build_object('category_id', v_category_id, 'version_id', v_version_id, 'version_number', 1);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'create_document_category', p_request_id, v_category_id::text, v_result);
  perform public.write_document_audit('document_category_created', null, v_category_id, null, null, p_request_id,
    jsonb_build_object('code', p_code, 'version_number', 1));
  return v_result;
exception
  when unique_violation then raise exception 'DOCUMENT_CATEGORY_STALE';
  when check_violation then raise exception 'DOCUMENT_INVALID_METADATA';
end;
$$;

create or replace function public.create_document_category_version(
  p_category_id uuid,
  p_expected_version_number integer,
  p_name text,
  p_description text,
  p_default_visibility text,
  p_employee_upload_enabled boolean,
  p_cardinality text,
  p_allowed_mime_types text[],
  p_expiration_mode text,
  p_default_validity_months integer,
  p_expiring_soon_days integer,
  p_retention_months_after_separation integer,
  p_change_reason text,
  p_fields jsonb,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_category public.document_categories%rowtype;
  v_current integer;
  v_version_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  select * into v_actor from public.current_document_actor();
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'create_document_category_version' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_category from public.document_categories where id = p_category_id for update;
  if not found then raise exception 'DOCUMENT_CATEGORY_NOT_FOUND'; end if;
  if v_category.archived_at is not null then raise exception 'DOCUMENT_CATEGORY_ARCHIVED'; end if;
  select max(version_number) into v_current from public.document_category_versions where category_id = p_category_id;
  if v_current is distinct from p_expected_version_number then raise exception 'DOCUMENT_CATEGORY_STALE'; end if;
  if p_default_visibility = 'super_admin_only' and v_actor.role <> 'super_admin' then raise exception 'DOCUMENT_INVALID_VISIBILITY'; end if;
  if length(btrim(coalesce(p_change_reason, ''))) = 0 then raise exception 'DOCUMENT_INVALID_METADATA'; end if;
  insert into public.document_category_versions(
    id, category_id, version_number, name, description, default_visibility,
    employee_upload_enabled, cardinality, allowed_mime_types, expiration_mode,
    default_validity_months, expiring_soon_days, retention_months_after_separation,
    change_reason, created_by
  ) values (
    v_version_id, p_category_id, v_current + 1, btrim(p_name), nullif(btrim(p_description), ''),
    p_default_visibility, coalesce(p_employee_upload_enabled, false), p_cardinality,
    p_allowed_mime_types, p_expiration_mode, p_default_validity_months,
    coalesce(p_expiring_soon_days, 30), p_retention_months_after_separation,
    btrim(p_change_reason), auth.uid()
  );
  perform public.insert_document_category_fields(v_version_id, p_fields);
  v_result := jsonb_build_object('category_id', p_category_id, 'version_id', v_version_id, 'version_number', v_current + 1);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'create_document_category_version', p_request_id, p_category_id::text, v_result);
  perform public.write_document_audit('document_category_version_created', null, p_category_id, null, null, p_request_id,
    jsonb_build_object('version_number', v_current + 1));
  return v_result;
exception
  when unique_violation then raise exception 'DOCUMENT_CATEGORY_STALE';
  when check_violation then raise exception 'DOCUMENT_INVALID_METADATA';
end;
$$;

create or replace function public.archive_document_category(
  p_category_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'archive_document_category' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  update public.document_categories set archived_at = coalesce(archived_at, now()), archived_by = auth.uid(), updated_at = now()
  where id = p_category_id returning jsonb_build_object('category_id', id, 'archived', true) into v_result;
  if v_result is null then raise exception 'DOCUMENT_CATEGORY_NOT_FOUND'; end if;
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'archive_document_category', p_request_id, p_category_id::text, v_result);
  perform public.write_document_audit('document_category_archived', null, p_category_id, null, null, p_request_id, '{}'::jsonb);
  return v_result;
end;
$$;

create or replace function public.restore_document_category(
  p_category_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'restore_document_category' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  update public.document_categories set archived_at = null, archived_by = null, updated_at = now()
  where id = p_category_id returning jsonb_build_object('category_id', id, 'archived', false) into v_result;
  if v_result is null then raise exception 'DOCUMENT_CATEGORY_NOT_FOUND'; end if;
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'restore_document_category', p_request_id, p_category_id::text, v_result);
  perform public.write_document_audit('document_category_restored', null, p_category_id, null, null, p_request_id, '{}'::jsonb);
  return v_result;
end;
$$;

create or replace function public.validate_document_requirement_target(
  p_target_type text,
  p_target_id text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_target_type = 'all_active_employees' then
    if p_target_id is not null then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  elsif p_target_type = 'department' then
    if not exists (select 1 from public.departments where id::text = p_target_id and is_active) then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  elsif p_target_type = 'job_title' then
    if not exists (select 1 from public.job_titles where id::text = p_target_id and is_active) then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  elsif p_target_type = 'employment_type' then
    if p_target_id not in ('full_time', 'part_time', 'contract', 'intern') then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  elsif p_target_type = 'employee' then
    if not exists (select 1 from public.employees where id::text = p_target_id and archived_at is null) then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  else
    raise exception 'DOCUMENT_REQUIREMENT_CONFLICT';
  end if;
end;
$$;

create or replace function public.create_document_requirement(
  p_category_id uuid,
  p_required_count integer,
  p_expired_satisfies boolean,
  p_effective_from date,
  p_effective_to date,
  p_target_type text,
  p_target_id text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requirement_id uuid := gen_random_uuid();
  v_cardinality text;
  v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'create_document_requirement' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select v.cardinality into v_cardinality
  from public.document_categories c
  join public.document_category_versions v on v.category_id = c.id
  where c.id = p_category_id and c.archived_at is null
  order by v.version_number desc limit 1;
  if v_cardinality is null then raise exception 'DOCUMENT_CATEGORY_NOT_FOUND'; end if;
  if p_required_count < 1 or (v_cardinality = 'single' and p_required_count <> 1)
     or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'DOCUMENT_REQUIREMENT_CONFLICT';
  end if;
  perform public.validate_document_requirement_target(p_target_type, p_target_id);
  if exists (
    select 1
    from public.document_requirements r
    join public.document_requirement_targets t on t.requirement_id = r.id
    where r.category_id = p_category_id and r.archived_at is null
      and t.target_type = p_target_type and t.target_id is not distinct from p_target_id
      and daterange(r.effective_from, coalesce(r.effective_to + 1, 'infinity'::date), '[)')
          && daterange(p_effective_from, coalesce(p_effective_to + 1, 'infinity'::date), '[)')
  ) then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT'; end if;
  insert into public.document_requirements(
    id, category_id, required_count, expired_satisfies, effective_from,
    effective_to, created_by
  ) values (
    v_requirement_id, p_category_id, p_required_count, coalesce(p_expired_satisfies, false),
    p_effective_from, p_effective_to, auth.uid()
  );
  insert into public.document_requirement_targets(requirement_id, target_type, target_id)
  values (v_requirement_id, p_target_type, p_target_id);
  v_result := jsonb_build_object('requirement_id', v_requirement_id);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'create_document_requirement', p_request_id, v_requirement_id::text, v_result);
  perform public.write_document_audit('document_requirement_created', null, p_category_id, null, null, p_request_id,
    jsonb_build_object('requirement_id', v_requirement_id, 'target_type', p_target_type));
  return v_result;
end;
$$;

create or replace function public.revise_document_requirement(
  p_requirement_id uuid,
  p_required_count integer,
  p_expired_satisfies boolean,
  p_effective_from date,
  p_effective_to date,
  p_target_type text,
  p_target_id text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old public.document_requirements%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'revise_document_requirement' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_old from public.document_requirements where id = p_requirement_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  perform public.validate_document_requirement_target(p_target_type, p_target_id);
  update public.document_requirements set archived_at = now(), archived_by = auth.uid() where id = p_requirement_id;
  insert into public.document_requirements(
    id, category_id, required_count, expired_satisfies, effective_from, effective_to,
    supersedes_requirement_id, created_by
  ) values (
    v_new_id, v_old.category_id, p_required_count, coalesce(p_expired_satisfies, false),
    p_effective_from, p_effective_to, p_requirement_id, auth.uid()
  );
  insert into public.document_requirement_targets(requirement_id, target_type, target_id)
  values (v_new_id, p_target_type, p_target_id);
  v_result := jsonb_build_object('requirement_id', v_new_id, 'supersedes_requirement_id', p_requirement_id);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'revise_document_requirement', p_request_id, v_new_id::text, v_result);
  perform public.write_document_audit('document_requirement_revised', null, v_old.category_id, null, null, p_request_id,
    jsonb_build_object('requirement_id', v_new_id, 'supersedes_requirement_id', p_requirement_id));
  return v_result;
exception when check_violation then raise exception 'DOCUMENT_REQUIREMENT_CONFLICT';
end;
$$;

create or replace function public.archive_document_requirement(
  p_requirement_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb; v_category_id uuid;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'archive_document_requirement' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  update public.document_requirements set archived_at = coalesce(archived_at, now()), archived_by = auth.uid()
  where id = p_requirement_id returning category_id into v_category_id;
  if v_category_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_result := jsonb_build_object('requirement_id', p_requirement_id, 'archived', true);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'archive_document_requirement', p_request_id, p_requirement_id::text, v_result);
  perform public.write_document_audit('document_requirement_archived', null, v_category_id, null, null, p_request_id,
    jsonb_build_object('requirement_id', p_requirement_id));
  return v_result;
end;
$$;

create or replace function public.restore_document_requirement(
  p_requirement_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb; v_category_id uuid;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'restore_document_requirement' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  update public.document_requirements set archived_at = null, archived_by = null
  where id = p_requirement_id returning category_id into v_category_id;
  if v_category_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_result := jsonb_build_object('requirement_id', p_requirement_id, 'archived', false);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'restore_document_requirement', p_request_id, p_requirement_id::text, v_result);
  perform public.write_document_audit('document_requirement_restored', null, v_category_id, null, null, p_request_id,
    jsonb_build_object('requirement_id', p_requirement_id));
  return v_result;
end;
$$;

create or replace function public.grant_document_permission(
  p_user_id uuid,
  p_permission_code text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'grant_document_permission' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  if p_permission_code not in ('documents.review', 'documents.manage')
     or not exists (select 1 from public.profiles where id = p_user_id and role = 'hr_admin') then
    raise exception 'DOCUMENT_PERMISSION_GRANT_INVALID';
  end if;
  insert into public.document_permission_grants(id, user_id, permission_code, granted_by, granted_at, request_id)
  values (gen_random_uuid(), p_user_id, p_permission_code, auth.uid(), now(), p_request_id)
  on conflict (user_id, permission_code) where revoked_at is null do nothing;
  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'permissions', coalesce((select jsonb_agg(permission_code order by permission_code)
      from public.document_permission_grants where user_id = p_user_id and revoked_at is null), '[]'::jsonb)
  );
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'grant_document_permission', p_request_id, p_user_id::text || ':' || p_permission_code, v_result);
  perform public.write_document_audit('document_permission_granted', null, null, null, null, p_request_id,
    jsonb_build_object('target_user_id', p_user_id, 'permission_code', p_permission_code));
  return v_result;
end;
$$;

create or replace function public.revoke_document_permission(
  p_user_id uuid,
  p_permission_code text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.profiles where id = p_user_id for update;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'revoke_document_permission' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  if p_permission_code not in ('documents.review', 'documents.manage') then raise exception 'DOCUMENT_PERMISSION_GRANT_INVALID'; end if;
  update public.document_permission_grants
  set revoked_at = now(), revoked_by = auth.uid()
  where user_id = p_user_id and permission_code = p_permission_code and revoked_at is null;
  v_result := jsonb_build_object(
    'user_id', p_user_id,
    'permissions', coalesce((select jsonb_agg(permission_code order by permission_code)
      from public.document_permission_grants where user_id = p_user_id and revoked_at is null), '[]'::jsonb)
  );
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'revoke_document_permission', p_request_id, p_user_id::text || ':' || p_permission_code, v_result);
  perform public.write_document_audit('document_permission_revoked', null, null, null, null, p_request_id,
    jsonb_build_object('target_user_id', p_user_id, 'permission_code', p_permission_code));
  return v_result;
end;
$$;


create or replace function public.create_document_upload_session(
  p_employee_id uuid,
  p_category_id uuid,
  p_category_version_id uuid,
  p_source text,
  p_save_as_draft boolean,
  p_replacement_document_id uuid,
  p_supersedes_version_id uuid,
  p_visibility_override text,
  p_common_metadata jsonb,
  p_manifest jsonb,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_category record;
  v_session_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_file jsonb;
  v_count integer;
  v_mime text;
  v_name text;
  v_size bigint;
  v_client_key text;
  v_extension text;
  v_display_extension text;
  v_file_id uuid;
  v_document_id uuid;
  v_version_id uuid;
  v_existing_document_id uuid;
  v_result jsonb;
  v_rank_default integer;
  v_rank_override integer;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.user_id is null then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  if p_source not in ('employee', 'hr') then raise exception 'DOCUMENT_INVALID_METADATA'; end if;
  if p_idempotency_key is null then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;

  select jsonb_build_object(
    'session_id', s.id,
    'expires_at', s.expires_at,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'client_file_key', f.client_file_key,
        'storage_path', f.storage_path,
        'expected_mime_type', f.mime_type,
        'expected_size_bytes', f.expected_size_bytes,
        'safe_filename', f.safe_filename
      ) order by f.created_at)
      from public.document_upload_session_files f where f.session_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.document_upload_sessions s
  where s.actor_user_id = auth.uid() and s.idempotency_key = p_idempotency_key;
  if v_result is not null then return v_result; end if;

  select
    c.id as category_id,
    c.archived_at,
    v.id as version_id,
    v.version_number,
    v.default_visibility,
    v.employee_upload_enabled,
    v.cardinality,
    v.allowed_mime_types
  into v_category
  from public.document_categories c
  join public.document_category_versions v on v.category_id = c.id
  where c.id = p_category_id and v.id = p_category_version_id
    and v.version_number = (
      select max(v2.version_number) from public.document_category_versions v2 where v2.category_id = c.id
    )
  for update of c;
  if not found then
    if exists (select 1 from public.document_categories where id = p_category_id) then
      raise exception 'DOCUMENT_CATEGORY_STALE';
    end if;
    raise exception 'DOCUMENT_CATEGORY_NOT_FOUND';
  end if;
  if v_category.archived_at is not null then raise exception 'DOCUMENT_CATEGORY_ARCHIVED'; end if;

  if p_source = 'employee' then
    if v_actor.employee_id is distinct from p_employee_id or not v_category.employee_upload_enabled then
      raise exception 'DOCUMENT_PERMISSION_DENIED';
    end if;
    if p_visibility_override is not null then raise exception 'DOCUMENT_INVALID_VISIBILITY'; end if;
  else
    if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  end if;

  v_rank_default := case v_category.default_visibility when 'employee_hr' then 0 when 'hr_only' then 1 else 2 end;
  v_rank_override := case coalesce(p_visibility_override, v_category.default_visibility) when 'employee_hr' then 0 when 'hr_only' then 1 else 2 end;
  if v_rank_override < v_rank_default then raise exception 'DOCUMENT_INVALID_VISIBILITY'; end if;
  if coalesce(p_visibility_override, v_category.default_visibility) = 'super_admin_only' and v_actor.role <> 'super_admin' then
    raise exception 'DOCUMENT_INVALID_VISIBILITY';
  end if;

  if jsonb_typeof(coalesce(p_manifest, 'null'::jsonb)) <> 'array' then raise exception 'DOCUMENT_INVALID_FILE'; end if;
  v_count := jsonb_array_length(p_manifest);
  if v_count < 1 then raise exception 'DOCUMENT_INVALID_FILE'; end if;
  if v_count > 10 then raise exception 'DOCUMENT_FILE_COUNT_EXCEEDED'; end if;
  if v_category.cardinality = 'single' and v_count <> 1 then raise exception 'DOCUMENT_CARDINALITY_CONFLICT'; end if;
  if p_replacement_document_id is not null and v_count <> 1 then raise exception 'DOCUMENT_CARDINALITY_CONFLICT'; end if;

  if p_replacement_document_id is not null then
    select d.id into v_existing_document_id
    from public.employee_documents d
    where d.id = p_replacement_document_id
      and d.employee_id = p_employee_id
      and d.category_id = p_category_id
      and d.archived_at is null
    for update;
    if v_existing_document_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
    if p_supersedes_version_id is not null and not exists (
      select 1 from public.employee_document_versions v
      where v.id = p_supersedes_version_id and v.document_id = v_existing_document_id
    ) then raise exception 'DOCUMENT_VERSION_STALE'; end if;
  elsif v_category.cardinality = 'single' then
    select d.id into v_existing_document_id
    from public.employee_documents d
    where d.employee_id = p_employee_id and d.category_id = p_category_id and d.archived_at is null
    for update;
    if v_existing_document_id is not null and p_source = 'employee' then
      raise exception 'DOCUMENT_CARDINALITY_CONFLICT';
    end if;
  end if;

  insert into public.document_upload_sessions(
    id, actor_user_id, employee_id, category_id, category_version_id, source,
    status, save_as_draft, replacement_document_id, supersedes_version_id,
    visibility_override, common_metadata, manifest_count, idempotency_key, expires_at
  ) values (
    v_session_id, auth.uid(), p_employee_id, p_category_id, p_category_version_id,
    p_source, 'pending', coalesce(p_save_as_draft, false), p_replacement_document_id,
    p_supersedes_version_id, p_visibility_override, coalesce(p_common_metadata, '{}'::jsonb),
    v_count, p_idempotency_key, v_expires_at
  );

  for v_file in select value from jsonb_array_elements(p_manifest) loop
    v_client_key := btrim(v_file ->> 'clientFileKey');
    v_name := btrim(v_file ->> 'name');
    v_mime := v_file ->> 'type';
    begin
      v_size := (v_file ->> 'size')::bigint;
    exception when invalid_text_representation then raise exception 'DOCUMENT_INVALID_FILE'; end;
    if length(v_client_key) = 0 or length(v_name) = 0 then raise exception 'DOCUMENT_INVALID_FILE'; end if;
    if v_size < 1 or v_size > 15 * 1024 * 1024 then raise exception 'DOCUMENT_FILE_TOO_LARGE'; end if;
    if not (v_mime = any(v_category.allowed_mime_types)) then raise exception 'DOCUMENT_INVALID_FILE'; end if;
    v_display_extension := lower(split_part(v_name, '.', array_length(string_to_array(v_name, '.'), 1)));
    v_extension := case v_mime
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
      else null
    end;
    if v_extension is null then raise exception 'DOCUMENT_INVALID_FILE'; end if;
    if (v_mime = 'image/jpeg' and v_display_extension not in ('jpg', 'jpeg'))
       or (v_mime <> 'image/jpeg' and v_display_extension <> v_extension) then
      raise exception 'DOCUMENT_INVALID_FILE';
    end if;
    v_file_id := gen_random_uuid();
    v_document_id := coalesce(v_existing_document_id, gen_random_uuid());
    v_version_id := gen_random_uuid();
    insert into public.document_upload_session_files(
      id, session_id, client_file_key, planned_document_id, planned_version_id,
      original_filename, safe_filename, mime_type, expected_size_bytes,
      extension, storage_path
    ) values (
      v_file_id, v_session_id, v_client_key, v_document_id, v_version_id,
      v_name,
      lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9._-]+', '-', 'g'), '(^-+|-+$)', '', 'g')),
      v_mime, v_size, v_extension,
      'documents/' || v_document_id || '/versions/' || v_version_id || '/' || v_file_id || '.' || v_extension
    );
    if v_category.cardinality = 'multiple' and p_replacement_document_id is null then
      v_existing_document_id := null;
    end if;
  end loop;

  v_result := jsonb_build_object(
    'session_id', v_session_id,
    'expires_at', v_expires_at,
    'files', (
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'client_file_key', f.client_file_key,
        'storage_path', f.storage_path,
        'expected_mime_type', f.mime_type,
        'expected_size_bytes', f.expected_size_bytes,
        'safe_filename', f.safe_filename
      ) order by f.created_at)
      from public.document_upload_session_files f where f.session_id = v_session_id
    )
  );
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'create_document_upload_session', p_idempotency_key, v_session_id::text,
    jsonb_build_object('session_id', v_session_id, 'expires_at', v_expires_at));
  perform public.write_document_audit('document_upload_session_created', p_employee_id, p_category_id, null, null,
    p_idempotency_key, jsonb_build_object('session_id', v_session_id, 'file_count', v_count, 'source', p_source));
  return v_result;
exception
  when unique_violation then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID';
end;
$$;

create or replace function public.finalize_document_upload_internal(
  p_session_id uuid,
  p_request_id uuid,
  p_expected_source text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session public.document_upload_sessions%rowtype;
  v_category record;
  v_file public.document_upload_session_files%rowtype;
  v_status text;
  v_version_number integer;
  v_result jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_employee_profile_id uuid;
  v_reviewer record;
  v_title text;
  v_tags text[];
begin
  select * into v_session
  from public.document_upload_sessions
  where id = p_session_id
  for update;
  if not found or v_session.actor_user_id <> auth.uid() or v_session.source <> p_expected_source then
    raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.status = 'finalized' then
    select result into v_result from public.document_lifecycle_actions
    where actor_user_id = auth.uid()
      and action = 'finalize_' || p_expected_source || '_document_upload'
      and request_id = p_request_id;
    if v_result is not null then return v_result; end if;
    raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID';
  end if;
  if v_session.status <> 'pending' then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
  if now() >= v_session.expires_at then
    update public.document_upload_sessions set status = 'expired' where id = v_session.id;
    raise exception 'DOCUMENT_UPLOAD_SESSION_EXPIRED';
  end if;
  if exists (
    select 1 from public.document_upload_session_files
    where session_id = v_session.id and (verified_at is null or sha256 is null)
  ) then raise exception 'DOCUMENT_UPLOAD_INCOMPLETE'; end if;

  select v.cardinality, v.default_visibility into v_category
  from public.document_category_versions v where v.id = v_session.category_version_id;
  if not found then raise exception 'DOCUMENT_CATEGORY_STALE'; end if;
  if p_expected_source = 'employee' then
    v_status := case when v_session.save_as_draft then 'draft' else 'pending_review' end;
  else
    v_status := case when v_session.save_as_draft then 'draft' else 'approved' end;
  end if;
  perform set_config('app.document_workflow', 'on', true);

  for v_file in
    select * from public.document_upload_session_files where session_id = v_session.id order by created_at
  loop
    if not exists (select 1 from public.employee_documents where id = v_file.planned_document_id) then
      insert into public.employee_documents(
        id, employee_id, category_id, cardinality_snapshot, visibility_override, created_by
      ) values (
        v_file.planned_document_id, v_session.employee_id, v_session.category_id,
        v_category.cardinality, v_session.visibility_override, auth.uid()
      );
    else
      update public.employee_documents
      set visibility_override = coalesce(v_session.visibility_override, visibility_override), updated_at = now()
      where id = v_file.planned_document_id and archived_at is null;
      if not found then raise exception 'DOCUMENT_ARCHIVED'; end if;
    end if;
    select coalesce(max(version_number), 0) + 1 into v_version_number
    from public.employee_document_versions where document_id = v_file.planned_document_id;
    v_title := coalesce(nullif(btrim(v_session.common_metadata ->> 'title'), ''), v_file.safe_filename);
    v_tags := array(select jsonb_array_elements_text(coalesce(v_session.common_metadata -> 'tags', '[]'::jsonb)));
    insert into public.employee_document_versions(
      id, document_id, category_version_id, version_number, source, review_status,
      supersedes_version_id, original_filename, safe_filename, mime_type, size_bytes,
      sha256, storage_path, title, reference_number, issue_date, expiration_date,
      issuing_organization, notes, tags, custom_metadata, submitted_by, submitted_at
    ) values (
      v_file.planned_version_id, v_file.planned_document_id, v_session.category_version_id,
      v_version_number, p_expected_source, v_status, v_session.supersedes_version_id,
      v_file.original_filename, v_file.safe_filename, v_file.mime_type,
      v_file.expected_size_bytes, v_file.sha256, v_file.storage_path, v_title,
      nullif(btrim(v_session.common_metadata ->> 'referenceNumber'), ''),
      nullif(v_session.common_metadata ->> 'issueDate', '')::date,
      nullif(v_session.common_metadata ->> 'expirationDate', '')::date,
      nullif(btrim(v_session.common_metadata ->> 'issuingOrganization'), ''),
      nullif(btrim(v_session.common_metadata ->> 'notes'), ''),
      v_tags, coalesce(v_session.common_metadata -> 'customMetadata', '{}'::jsonb),
      auth.uid(), case when v_status = 'draft' then null else now() end
    );
    if v_status = 'approved' then
      update public.employee_documents
      set active_version_id = v_file.planned_version_id, updated_at = now()
      where id = v_file.planned_document_id;
    end if;
    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'document_id', v_file.planned_document_id,
      'version_id', v_file.planned_version_id,
      'status', v_status
    ));
    perform public.write_document_audit(
      case when p_expected_source = 'employee' then 'employee_document_finalized' else 'hr_document_finalized' end,
      v_session.employee_id, v_session.category_id, v_file.planned_document_id,
      v_file.planned_version_id, p_request_id,
      jsonb_build_object('source', p_expected_source, 'status', v_status, 'version_number', v_version_number)
    );

    if v_status = 'pending_review' then
      for v_reviewer in
        select p.id
        from public.profiles p
        where p.role = 'super_admin'
           or (p.role = 'hr_admin' and exists (
             select 1 from public.document_permission_grants g
             where g.user_id = p.id and g.permission_code = 'documents.review' and g.revoked_at is null
           ))
      loop
        perform public.create_document_notification(
          v_reviewer.id, 'document_submission_received', 'Document submitted for review',
          'An employee document is ready for review.', 'employee_document',
          v_file.planned_document_id, 'document_submission_received:' || v_file.planned_version_id
        );
      end loop;
    elsif v_status = 'approved' then
      select profile_id into v_employee_profile_id from public.employees where id = v_session.employee_id;
      if v_employee_profile_id is not null then
        perform public.create_document_notification(
          v_employee_profile_id, 'document_activated', 'Document added',
          'HR added an approved document to your record.', 'employee_document',
          v_file.planned_document_id, 'document_activated:' || v_file.planned_version_id
        );
      end if;
    end if;
  end loop;

  update public.document_upload_sessions
  set status = 'finalized', finalized_at = now()
  where id = v_session.id;
  v_result := jsonb_build_object('session_id', v_session.id, 'documents', v_documents);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (
    auth.uid(), 'finalize_' || p_expected_source || '_document_upload', p_request_id,
    v_session.id::text, v_result
  );
  return v_result;
exception
  when unique_violation then raise exception 'DOCUMENT_CARDINALITY_CONFLICT';
  when check_violation or invalid_text_representation then raise exception 'DOCUMENT_INVALID_METADATA';
end;
$$;

create or replace function public.finalize_employee_document_upload(
  p_session_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  perform 1 from public.document_upload_sessions where id = p_session_id for update;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'finalize_employee_document_upload' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  return public.finalize_document_upload_internal(p_session_id, p_request_id, 'employee');
end;
$$;

create or replace function public.finalize_hr_document_upload(
  p_session_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform 1 from public.document_upload_sessions where id = p_session_id for update;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'finalize_hr_document_upload' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  return public.finalize_document_upload_internal(p_session_id, p_request_id, 'hr');
end;
$$;

create or replace function public.submit_document_draft(
  p_document_id uuid,
  p_version_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_document public.employee_documents%rowtype; v_result jsonb; v_reviewer record;
begin
  select * into v_actor from public.current_document_actor();
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'submit_document_draft' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_document.employee_id is distinct from v_actor.employee_id then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform set_config('app.document_workflow', 'on', true);
  update public.employee_document_versions
  set review_status = 'pending_review', submitted_at = now(), updated_at = now()
  where id = p_version_id and document_id = p_document_id and source = 'employee' and review_status = 'draft';
  if not found then raise exception 'DOCUMENT_INVALID_STATUS'; end if;
  for v_reviewer in
    select p.id from public.profiles p
    where p.role = 'super_admin' or (p.role = 'hr_admin' and exists (
      select 1 from public.document_permission_grants g
      where g.user_id = p.id and g.permission_code = 'documents.review' and g.revoked_at is null
    ))
  loop
    perform public.create_document_notification(v_reviewer.id, 'document_submission_received',
      'Document submitted for review', 'An employee document is ready for review.',
      'employee_document', p_document_id, 'document_submission_received:' || p_version_id);
  end loop;
  v_result := jsonb_build_object('document_id', p_document_id, 'version_id', p_version_id, 'status', 'pending_review');
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'submit_document_draft', p_request_id, p_version_id::text, v_result);
  perform public.write_document_audit('employee_document_submitted', v_document.employee_id, v_document.category_id,
    p_document_id, p_version_id, p_request_id, jsonb_build_object('status', 'pending_review'));
  return v_result;
end;
$$;

create or replace function public.review_employee_document(
  p_document_id uuid,
  p_version_id uuid,
  p_decision text,
  p_internal_reason text,
  p_employee_message text,
  p_expected_version_updated_at timestamptz,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor record;
  v_document public.employee_documents%rowtype;
  v_version public.employee_document_versions%rowtype;
  v_result jsonb;
  v_employee_profile_id uuid;
begin
  select * into v_actor from public.current_document_actor();
  if not public.has_document_permission('documents.review') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'review_employee_document' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;

  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  select * into v_version
  from public.employee_document_versions
  where id = p_version_id and document_id = p_document_id
  for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_actor.employee_id is not null and v_actor.employee_id = v_document.employee_id then
    raise exception 'DOCUMENT_SELF_REVIEW_FORBIDDEN';
  end if;
  if v_version.updated_at is distinct from p_expected_version_updated_at then raise exception 'DOCUMENT_VERSION_STALE'; end if;
  if v_version.review_status <> 'pending_review' then
    if exists (select 1 from public.document_reviews where document_version_id = p_version_id) then
      raise exception 'DOCUMENT_REVIEW_ALREADY_COMPLETED';
    end if;
    raise exception 'DOCUMENT_INVALID_STATUS';
  end if;
  if p_decision not in ('approved', 'rejected', 'replacement_requested') then raise exception 'DOCUMENT_INVALID_STATUS'; end if;
  if p_decision in ('rejected', 'replacement_requested') and length(btrim(coalesce(p_internal_reason, ''))) = 0 then
    raise exception 'DOCUMENT_REJECTION_REASON_REQUIRED';
  end if;
  if p_decision = 'replacement_requested' and length(btrim(coalesce(p_employee_message, ''))) = 0 then
    raise exception 'DOCUMENT_REPLACEMENT_INSTRUCTIONS_REQUIRED';
  end if;

  perform set_config('app.document_workflow', 'on', true);
  if p_decision = 'approved' then
    update public.employee_document_versions
    set review_status = 'approved', updated_at = now()
    where id = v_version.id;
    update public.employee_documents
    set active_version_id = v_version.id, updated_at = now()
    where id = v_document.id;
  elsif p_decision = 'rejected' then
    update public.employee_document_versions
    set review_status = 'rejected', updated_at = now()
    where id = v_version.id;
  else
    update public.employee_document_versions
    set review_status = 'replacement_requested', updated_at = now()
    where id = v_version.id;
  end if;

  insert into public.document_reviews(
    document_version_id, decision, internal_reason, employee_message,
    reviewer_user_id, request_id
  ) values (
    v_version.id, p_decision, nullif(btrim(p_internal_reason), ''),
    nullif(btrim(p_employee_message), ''), auth.uid(), p_request_id
  );

  select profile_id into v_employee_profile_id from public.employees where id = v_document.employee_id;
  if v_employee_profile_id is not null then
    insert into public.notifications(
      id, recipient_user_id, type, title, body, resource_type, resource_id,
      source_event_key, created_at
    ) values (
      gen_random_uuid(), v_employee_profile_id,
      case p_decision when 'approved' then 'document_approved' when 'rejected' then 'document_rejected' else 'document_replacement_requested' end,
      case p_decision when 'approved' then 'Document approved' when 'rejected' then 'Document rejected' else 'Replacement requested' end,
      case p_decision when 'replacement_requested' then p_employee_message else 'Your document review is complete.' end,
      'employee_document', v_document.id, 'document_review:' || v_version.id, now()
    ) on conflict (recipient_user_id, source_event_key) do nothing;
  end if;

  insert into public.document_audit_logs(
    actor_user_id, action, employee_id, category_id, document_id,
    document_version_id, request_id, summary
  ) values (
    auth.uid(), 'employee_document_reviewed', v_document.employee_id,
    v_document.category_id, v_document.id, v_version.id, p_request_id,
    jsonb_build_object('decision', p_decision)
  );
  v_result := jsonb_build_object('document_id', v_document.id, 'version_id', v_version.id, 'status', p_decision);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'review_employee_document', p_request_id, v_version.id::text, v_result);
  return v_result;
exception
  when unique_violation then raise exception 'DOCUMENT_REVIEW_ALREADY_COMPLETED';
end;
$$;

create or replace function public.restore_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_expected_active_version_id uuid,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_document public.employee_documents%rowtype; v_version public.employee_document_versions%rowtype; v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'restore_document_version' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_document.active_version_id is distinct from p_expected_active_version_id then raise exception 'DOCUMENT_ACTIVE_VERSION_CONFLICT'; end if;
  select * into v_version from public.employee_document_versions
  where id = p_version_id and document_id = p_document_id and review_status = 'approved'
  for update;
  if not found then raise exception 'DOCUMENT_INVALID_STATUS'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'DOCUMENT_INVALID_METADATA'; end if;
  update public.employee_documents set active_version_id = v_version.id, updated_at = now() where id = v_document.id;
  v_result := jsonb_build_object('document_id', v_document.id, 'active_version_id', v_version.id);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'restore_document_version', p_request_id, v_document.id::text, v_result);
  perform public.write_document_audit('document_version_restored', v_document.employee_id, v_document.category_id,
    v_document.id, v_version.id, p_request_id, jsonb_build_object('previous_active_version_id', p_expected_active_version_id));
  return v_result;
end;
$$;

create or replace function public.archive_employee_document(
  p_document_id uuid,
  p_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_document public.employee_documents%rowtype; v_result jsonb;
begin
  select * into v_actor from public.current_document_actor();
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'archive_employee_document' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if not public.has_document_permission('documents.manage') then
    if v_actor.employee_id is distinct from v_document.employee_id
       or v_document.active_version_id is not null
       or not exists (
         select 1 from public.employee_document_versions v
         where v.document_id = v_document.id and v.review_status = 'draft'
       ) then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  end if;
  update public.employee_documents
  set archived_at = coalesce(archived_at, now()), archived_by = auth.uid(),
      archive_reason = nullif(btrim(p_reason), ''), updated_at = now()
  where id = v_document.id;
  v_result := jsonb_build_object('document_id', v_document.id, 'archived', true);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'archive_employee_document', p_request_id, v_document.id::text, v_result);
  perform public.write_document_audit('employee_document_archived', v_document.employee_id, v_document.category_id,
    v_document.id, null, p_request_id, '{}'::jsonb);
  return v_result;
end;
$$;

create or replace function public.restore_employee_document(
  p_document_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_document public.employee_documents%rowtype; v_result jsonb;
begin
  if not public.has_document_permission('documents.manage') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select result into v_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'restore_employee_document' and request_id = p_request_id;
  if v_result is not null then return v_result; end if;
  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  update public.employee_documents
  set archived_at = null, archived_by = null, archive_reason = null, updated_at = now()
  where id = v_document.id;
  v_result := jsonb_build_object('document_id', v_document.id, 'archived', false);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'restore_employee_document', p_request_id, v_document.id::text, v_result);
  perform public.write_document_audit('employee_document_restored', v_document.employee_id, v_document.category_id,
    v_document.id, null, p_request_id, '{}'::jsonb);
  return v_result;
exception when unique_violation then raise exception 'DOCUMENT_CARDINALITY_CONFLICT';
end;
$$;

create or replace function public.permanently_delete_employee_document(
  p_document_id uuid,
  p_classification text,
  p_deletion_reason text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_document public.employee_documents%rowtype;
  v_tombstone_id uuid;
  v_safe_result jsonb;
  v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  if p_classification not in ('invalid', 'duplicate', 'mistaken_upload') then raise exception 'DOCUMENT_INVALID_METADATA'; end if;
  if length(btrim(coalesce(p_deletion_reason, ''))) = 0 then raise exception 'DOCUMENT_DELETE_REASON_REQUIRED'; end if;

  select result into v_safe_result from public.document_lifecycle_actions
  where actor_user_id = auth.uid() and action = 'permanently_delete_employee_document' and request_id = p_request_id;
  if v_safe_result is not null then
    return v_safe_result || jsonb_build_object('storage_paths', coalesce((
      select jsonb_agg(v.storage_path order by v.version_number)
      from public.employee_document_versions v where v.document_id = p_document_id
    ), '[]'::jsonb));
  end if;

  select * into v_document from public.employee_documents where id = p_document_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_tombstone_id := gen_random_uuid();
  perform set_config('app.document_workflow', 'on', true);
  update public.employee_documents
  set archived_at = coalesce(archived_at, now()), archived_by = auth.uid(), updated_at = now()
  where id = v_document.id;
  insert into public.document_deletion_tombstones(
    id, document_id, employee_id, category_id, classification, reason,
    requested_by, request_id
  ) values (
    v_tombstone_id, v_document.id, v_document.employee_id, v_document.category_id,
    p_classification, btrim(p_deletion_reason), auth.uid(), p_request_id
  );
  v_safe_result := jsonb_build_object('document_id', v_document.id, 'tombstone_id', v_tombstone_id);
  insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
  values (auth.uid(), 'permanently_delete_employee_document', p_request_id, v_document.id::text, v_safe_result);
  perform public.write_document_audit('employee_document_deletion_requested', v_document.employee_id,
    v_document.category_id, v_document.id, null, p_request_id,
    jsonb_build_object('classification', p_classification, 'tombstone_id', v_tombstone_id));
  v_result := v_safe_result || jsonb_build_object('storage_paths', coalesce((
    select jsonb_agg(v.storage_path order by v.version_number)
    from public.employee_document_versions v where v.document_id = v_document.id
  ), '[]'::jsonb));
  return v_result;
end;
$$;

create or replace function public.complete_permanent_document_deletion(
  p_tombstone_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_tombstone public.document_deletion_tombstones%rowtype; v_result jsonb;
begin
  if not public.is_super_admin() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform set_config('app.document_workflow', 'on', true);
  select * into v_tombstone from public.document_deletion_tombstones where id = p_tombstone_id for update;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_tombstone.storage_cleanup_status = 'completed' then
    return jsonb_build_object('tombstone_id', v_tombstone.id, 'completed', true);
  end if;
  delete from public.document_reviews where document_version_id in (
    select id from public.employee_document_versions where document_id = v_tombstone.document_id
  );
  delete from public.employee_document_versions where document_id = v_tombstone.document_id;
  delete from public.employee_documents where id = v_tombstone.document_id;
  update public.document_deletion_tombstones
  set storage_cleanup_status = 'completed', completed_at = now(), cleanup_error_code = null
  where id = v_tombstone.id;
  v_result := jsonb_build_object('tombstone_id', v_tombstone.id, 'completed', true);
  return v_result;
end;
$$;

create or replace function public.fail_permanent_document_deletion(
  p_tombstone_id uuid,
  p_error_code text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  perform set_config('app.document_workflow', 'on', true);
  update public.document_deletion_tombstones
  set storage_cleanup_status = 'failed', cleanup_error_code = left(coalesce(p_error_code, 'cleanup_failed'), 120)
  where id = p_tombstone_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  return jsonb_build_object('tombstone_id', p_tombstone_id, 'completed', false);
end;
$$;


create or replace function public.document_employee_compliance_rows(p_employee_id uuid)
returns table(
  category_id uuid,
  category_name text,
  required_count integer,
  approved_count integer,
  status text,
  expiration_status text,
  nearest_expiration_date date,
  employee_upload_enabled boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with employee_row as (
    select e.id, e.department_id, e.job_title_id, e.employment_type::text as employment_type
    from public.employees e
    where e.id = p_employee_id
      and e.archived_at is null
      and e.employment_status in ('active', 'probation', 'on_leave')
  ), current_versions as (
    select distinct on (v.category_id)
      v.category_id, v.name, v.employee_upload_enabled, v.expiring_soon_days
    from public.document_category_versions v
    join public.document_categories c on c.id = v.category_id and c.archived_at is null
    order by v.category_id, v.version_number desc, v.created_at desc
  ), candidates as (
    select
      r.id as requirement_id,
      r.category_id,
      r.required_count,
      r.expired_satisfies,
      r.effective_from,
      r.created_at,
      t.target_type,
      t.target_id,
      row_number() over (
        partition by p_employee_id, r.category_id
        order by
          case t.target_type
            when 'employee' then 5
            when 'job_title' then 4
            when 'department' then 3
            when 'employment_type' then 2
            when 'all_active_employees' then 1
          end desc,
          r.effective_from desc,
          r.created_at desc,
          r.id desc
      ) as precedence_rank
    from public.document_requirements r
    join public.document_requirement_targets t on t.requirement_id = r.id
    cross join employee_row e
    where r.archived_at is null
      and r.effective_from <= current_date
      and (r.effective_to is null or r.effective_to >= current_date)
      and (
        t.target_type = 'all_active_employees'
        or (t.target_type = 'employee' and t.target_id = e.id::text)
        or (t.target_type = 'job_title' and t.target_id = e.job_title_id::text)
        or (t.target_type = 'department' and t.target_id = e.department_id::text)
        or (t.target_type = 'employment_type' and t.target_id = e.employment_type)
      )
  ), selected as (
    select * from candidates where precedence_rank = 1
  ), document_counts as (
    select
      s.category_id,
      count(d.id) filter (where av.id is not null)::integer as approved_count,
      count(d.id) filter (
        where av.id is not null
          and (av.expiration_date is null or av.expiration_date > current_date + cv.expiring_soon_days)
      )::integer as approved_valid_count,
      count(d.id) filter (
        where av.id is not null and av.expiration_date between current_date and current_date + cv.expiring_soon_days
      )::integer as approved_expiring_count,
      count(d.id) filter (
        where av.id is not null and av.expiration_date < current_date
      )::integer as approved_expired_count,
      count(d.id) filter (where latest.review_status = 'pending_review')::integer as pending_count,
      count(d.id) filter (where latest.review_status = 'replacement_requested')::integer as replacement_count,
      min(av.expiration_date) filter (where av.id is not null) as nearest_expiration_date
    from selected s
    join current_versions cv on cv.category_id = s.category_id
    left join public.employee_documents d
      on d.employee_id = p_employee_id and d.category_id = s.category_id and d.archived_at is null
    left join public.employee_document_versions av on av.id = d.active_version_id and av.review_status = 'approved'
    left join lateral (
      select v.review_status
      from public.employee_document_versions v
      where v.document_id = d.id
      order by v.version_number desc
      limit 1
    ) latest on true
    group by s.category_id
  )
  select
    s.category_id,
    cv.name as category_name,
    s.required_count,
    coalesce(dc.approved_count, 0),
    case
      when coalesce(dc.approved_valid_count, 0) >= s.required_count then 'approved'
      when coalesce(dc.approved_valid_count, 0) + coalesce(dc.approved_expiring_count, 0) >= s.required_count then 'expiring_soon'
      when s.expired_satisfies and coalesce(dc.approved_valid_count, 0) + coalesce(dc.approved_expiring_count, 0) + coalesce(dc.approved_expired_count, 0) >= s.required_count then 'approved'
      when coalesce(dc.pending_count, 0) > 0 then 'pending_review'
      when coalesce(dc.replacement_count, 0) > 0 then 'replacement_requested'
      when coalesce(dc.approved_expired_count, 0) > 0 then 'expired'
      else 'missing'
    end as status,
    case
      when dc.nearest_expiration_date is null then 'no_expiration'
      when dc.nearest_expiration_date < current_date then 'expired'
      when dc.nearest_expiration_date <= current_date + cv.expiring_soon_days then 'expiring_soon'
      else 'valid'
    end as expiration_status,
    dc.nearest_expiration_date,
    cv.employee_upload_enabled
  from selected s
  join current_versions cv on cv.category_id = s.category_id
  left join document_counts dc on dc.category_id = s.category_id
  order by cv.name, s.category_id
$$;

create or replace function public.get_employee_document_compliance(p_employee_id uuid default null)
returns table(
  category_id uuid,
  category_name text,
  required_count integer,
  approved_count integer,
  status text,
  expiration_status text,
  nearest_expiration_date date,
  employee_upload_enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_employee_id uuid;
begin
  select * into v_actor from public.current_document_actor();
  v_employee_id := coalesce(p_employee_id, v_actor.employee_id);
  if v_employee_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_actor.employee_id is distinct from v_employee_id and v_actor.role not in ('hr_admin', 'super_admin') then
    raise exception 'DOCUMENT_PERMISSION_DENIED';
  end if;
  return query select * from public.document_employee_compliance_rows(v_employee_id);
end;
$$;

create or replace function public.get_manager_document_compliance()
returns table(
  employee_id uuid,
  employee_name text,
  overall_status text,
  missing_count integer,
  pending_review_count integer,
  expiring_soon_count integer,
  expired_count integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_manager_id uuid;
begin
  select e.id into v_manager_id
  from public.employees e
  where e.profile_id = auth.uid()
    and e.archived_at is null
    and e.employment_status in ('active', 'probation', 'on_leave');
  if v_manager_id is null then return; end if;
  return query
  select
    e.id as employee_id,
    btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as employee_name,
    case
      when count(*) filter (where c.status = 'missing') > 0 then 'missing'
      when count(*) filter (where c.status = 'expired') > 0 then 'expired'
      when count(*) filter (where c.status in ('pending_review', 'replacement_requested')) > 0 then 'pending_review'
      when count(*) filter (where c.status = 'expiring_soon') > 0 then 'expiring_soon'
      else 'approved'
    end as overall_status,
    count(*) filter (where c.status = 'missing')::integer as missing_count,
    count(*) filter (where c.status in ('pending_review', 'replacement_requested'))::integer as pending_review_count,
    count(*) filter (where c.status = 'expiring_soon')::integer as expiring_soon_count,
    count(*) filter (where c.status = 'expired')::integer as expired_count
  from public.employees e
  join lateral public.document_employee_compliance_rows(e.id) c on true
  where e.manager_id = v_manager_id
    and e.archived_at is null
    and e.employment_status in ('active', 'probation', 'on_leave')
  group by e.id, e.first_name, e.last_name
  order by employee_name, employee_id;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = auth.uid();
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
end;
$$;

-- Editable prototype category identities and version-one defaults.
do $$
declare
  v_row record;
  v_category_id uuid;
  v_allowed text[];
begin
  for v_row in
    select * from (values
      ('employment_contract', 'Employment Contract', 'employee_hr', 'single', false, 'optional', null::integer, 30, true),
      ('government_id', 'Government ID', 'employee_hr', 'multiple', true, 'optional', null::integer, 30, false),
      ('birth_certificate', 'Birth Certificate', 'employee_hr', 'single', true, 'optional', null::integer, 30, false),
      ('training_certificate', 'Training Certificate', 'employee_hr', 'multiple', true, 'required', 12, 30, false),
      ('professional_license', 'Professional License', 'employee_hr', 'multiple', true, 'required', 12, 30, false),
      ('medical_record', 'Medical Record', 'hr_only', 'multiple', true, 'optional', null::integer, 30, false),
      ('disciplinary_record', 'Disciplinary Record', 'hr_only', 'multiple', false, 'optional', null::integer, 30, false),
      ('investigation_record', 'Investigation Record', 'super_admin_only', 'multiple', false, 'optional', null::integer, 30, false),
      ('other_employment_form', 'Other Employment Form', 'employee_hr', 'multiple', true, 'optional', null::integer, 30, true)
    ) as seed(code, name, visibility, cardinality, employee_upload, expiration_mode, validity_months, expiring_days, allow_docx)
  loop
    insert into public.document_categories(code, created_by)
    values (v_row.code, null)
    on conflict (code) do update set code = excluded.code
    returning id into v_category_id;
    v_allowed := array['application/pdf', 'image/jpeg', 'image/png'];
    if v_row.allow_docx then
      v_allowed := array_append(v_allowed, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    end if;
    if not exists (select 1 from public.document_category_versions where category_id = v_category_id) then
      insert into public.document_category_versions(
        category_id, version_number, name, description, default_visibility,
        employee_upload_enabled, cardinality, allowed_mime_types, expiration_mode,
        default_validity_months, expiring_soon_days, retention_months_after_separation,
        change_reason, created_by
      ) values (
        v_category_id, 1, v_row.name, 'Editable prototype category', v_row.visibility,
        v_row.employee_upload, v_row.cardinality, v_allowed, v_row.expiration_mode,
        v_row.validity_months, v_row.expiring_days, 60, 'Initial prototype configuration', null
      );
    end if;
  end loop;
end;
$$;

-- Internal helpers are never directly executable by browser roles.
revoke all on function public.current_document_actor() from public, anon, authenticated;
revoke all on function public.has_document_permission(text) from public, anon, authenticated;
revoke all on function public.write_document_audit(text,uuid,uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.create_document_notification(uuid,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.document_prior_action_result(text,uuid) from public, anon, authenticated;
revoke all on function public.insert_document_category_fields(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.validate_document_requirement_target(text,text) from public, anon, authenticated;
revoke all on function public.finalize_document_upload_internal(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.document_employee_compliance_rows(uuid) from public, anon, authenticated;

-- Public authenticated document workflows.
revoke all on function public.create_document_category(text,text,text,text,boolean,text,text[],text,integer,integer,integer,text,jsonb,uuid) from public, anon;
grant execute on function public.create_document_category(text,text,text,text,boolean,text,text[],text,integer,integer,integer,text,jsonb,uuid) to authenticated;
revoke all on function public.create_document_category_version(uuid,integer,text,text,text,boolean,text,text[],text,integer,integer,integer,text,jsonb,uuid) from public, anon;
grant execute on function public.create_document_category_version(uuid,integer,text,text,text,boolean,text,text[],text,integer,integer,integer,text,jsonb,uuid) to authenticated;
revoke all on function public.archive_document_category(uuid,uuid) from public, anon;
grant execute on function public.archive_document_category(uuid,uuid) to authenticated;
revoke all on function public.restore_document_category(uuid,uuid) from public, anon;
grant execute on function public.restore_document_category(uuid,uuid) to authenticated;
revoke all on function public.create_document_requirement(uuid,integer,boolean,date,date,text,text,uuid) from public, anon;
grant execute on function public.create_document_requirement(uuid,integer,boolean,date,date,text,text,uuid) to authenticated;
revoke all on function public.revise_document_requirement(uuid,integer,boolean,date,date,text,text,uuid) from public, anon;
grant execute on function public.revise_document_requirement(uuid,integer,boolean,date,date,text,text,uuid) to authenticated;
revoke all on function public.archive_document_requirement(uuid,uuid) from public, anon;
grant execute on function public.archive_document_requirement(uuid,uuid) to authenticated;
revoke all on function public.restore_document_requirement(uuid,uuid) from public, anon;
grant execute on function public.restore_document_requirement(uuid,uuid) to authenticated;
revoke all on function public.grant_document_permission(uuid,text,uuid) from public, anon;
grant execute on function public.grant_document_permission(uuid,text,uuid) to authenticated;
revoke all on function public.revoke_document_permission(uuid,text,uuid) from public, anon;
grant execute on function public.revoke_document_permission(uuid,text,uuid) to authenticated;
revoke all on function public.create_document_upload_session(uuid,uuid,uuid,text,boolean,uuid,uuid,text,jsonb,jsonb,uuid) from public, anon;
grant execute on function public.create_document_upload_session(uuid,uuid,uuid,text,boolean,uuid,uuid,text,jsonb,jsonb,uuid) to authenticated;
revoke all on function public.finalize_employee_document_upload(uuid,uuid) from public, anon;
grant execute on function public.finalize_employee_document_upload(uuid,uuid) to authenticated;
revoke all on function public.finalize_hr_document_upload(uuid,uuid) from public, anon;
grant execute on function public.finalize_hr_document_upload(uuid,uuid) to authenticated;
revoke all on function public.submit_document_draft(uuid,uuid,uuid) from public, anon;
grant execute on function public.submit_document_draft(uuid,uuid,uuid) to authenticated;
revoke all on function public.review_employee_document(uuid,uuid,text,text,text,timestamptz,uuid) from public, anon;
grant execute on function public.review_employee_document(uuid,uuid,text,text,text,timestamptz,uuid) to authenticated;
revoke all on function public.restore_document_version(uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function public.restore_document_version(uuid,uuid,uuid,text,uuid) to authenticated;
revoke all on function public.archive_employee_document(uuid,text,uuid) from public, anon;
grant execute on function public.archive_employee_document(uuid,text,uuid) to authenticated;
revoke all on function public.restore_employee_document(uuid,uuid) from public, anon;
grant execute on function public.restore_employee_document(uuid,uuid) to authenticated;
revoke all on function public.permanently_delete_employee_document(uuid,text,text,uuid) from public, anon;
grant execute on function public.permanently_delete_employee_document(uuid,text,text,uuid) to authenticated;
revoke all on function public.complete_permanent_document_deletion(uuid,uuid) from public, anon;
grant execute on function public.complete_permanent_document_deletion(uuid,uuid) to authenticated;
revoke all on function public.fail_permanent_document_deletion(uuid,text,uuid) from public, anon;
grant execute on function public.fail_permanent_document_deletion(uuid,text,uuid) to authenticated;
revoke all on function public.get_employee_document_compliance(uuid) from public, anon;
grant execute on function public.get_employee_document_compliance(uuid) to authenticated;
revoke all on function public.get_manager_document_compliance() from public, anon;
grant execute on function public.get_manager_document_compliance() to authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;



create or replace function public.list_document_permission_grants()
returns table(
  user_id uuid,
  role text,
  permission_code text,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'DOCUMENT_PERMISSION_DENIED';
  end if;
  return query
  select p.id, p.role::text, g.permission_code, g.revoked_at
  from public.profiles p
  left join public.document_permission_grants g
    on g.user_id = p.id and g.revoked_at is null
  where p.role in ('super_admin', 'hr_admin')
  order by p.role desc, p.id, g.permission_code;
end;
$$;

revoke all on function public.list_document_permission_grants() from public, anon;
grant execute on function public.list_document_permission_grants() to authenticated;



create or replace function public.list_document_requirements(
  p_category_id uuid default null,
  p_include_archived boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_document_permission('documents.manage') then
    raise exception 'DOCUMENT_PERMISSION_DENIED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'category_id', r.category_id,
      'category_name', cv.name,
      'required_count', r.required_count,
      'expired_satisfies', r.expired_satisfies,
      'effective_from', r.effective_from,
      'effective_to', r.effective_to,
      'target_type', t.target_type,
      'target_id', t.target_id,
      'supersedes_requirement_id', r.supersedes_requirement_id,
      'archived_at', r.archived_at,
      'created_at', r.created_at
    ) order by r.created_at desc, r.id desc)
    from public.document_requirements r
    join public.document_requirement_targets t on t.requirement_id = r.id
    join lateral (
      select v.name
      from public.document_category_versions v
      where v.category_id = r.category_id
      order by v.version_number desc
      limit 1
    ) cv on true
    where (p_category_id is null or r.category_id = p_category_id)
      and (p_include_archived or r.archived_at is null)
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_document_requirements(uuid,boolean) from public, anon;
grant execute on function public.list_document_requirements(uuid,boolean) to authenticated;



create or replace function public.get_document_upload_session_manifest(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_session public.document_upload_sessions%rowtype;
begin
  select * into v_session
  from public.document_upload_sessions
  where id = p_session_id and actor_user_id = auth.uid()
  for update;
  if not found or v_session.status <> 'pending' then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
  if now() >= v_session.expires_at then
    update public.document_upload_sessions set status = 'expired' where id = p_session_id;
    raise exception 'DOCUMENT_UPLOAD_SESSION_EXPIRED';
  end if;
  return jsonb_build_object(
    'session_id', v_session.id,
    'source', v_session.source,
    'expires_at', v_session.expires_at,
    'files', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id,
        'storage_path', f.storage_path,
        'expected_mime_type', f.mime_type,
        'expected_size_bytes', f.expected_size_bytes
      ) order by f.created_at)
      from public.document_upload_session_files f where f.session_id = v_session.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.mark_document_upload_files_verified(
  p_session_id uuid,
  p_files jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_session public.document_upload_sessions%rowtype; v_file jsonb; v_updated integer := 0;
begin
  select * into v_session from public.document_upload_sessions
  where id = p_session_id and actor_user_id = auth.uid() for update;
  if not found or v_session.status <> 'pending' then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
  if now() >= v_session.expires_at then raise exception 'DOCUMENT_UPLOAD_SESSION_EXPIRED'; end if;
  if jsonb_typeof(coalesce(p_files, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_files) <> v_session.manifest_count then
    raise exception 'DOCUMENT_UPLOAD_INCOMPLETE';
  end if;
  for v_file in select value from jsonb_array_elements(p_files) loop
    if coalesce(v_file ->> 'sha256', '') !~ '^[0-9a-f]{64}$' then raise exception 'DOCUMENT_INVALID_FILE'; end if;
    update public.document_upload_session_files
    set sha256 = v_file ->> 'sha256', verified_at = now()
    where id = (v_file ->> 'fileId')::uuid and session_id = p_session_id;
    if not found then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
    v_updated := v_updated + 1;
  end loop;
  if v_updated <> v_session.manifest_count or exists (
    select 1 from public.document_upload_session_files
    where session_id = p_session_id and (verified_at is null or sha256 is null)
  ) then raise exception 'DOCUMENT_UPLOAD_INCOMPLETE'; end if;
end;
$$;

create or replace function public.cancel_document_upload_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.document_upload_sessions
  set status = 'cancelled'
  where id = p_session_id and actor_user_id = auth.uid() and status = 'pending';
  if not found and not exists (
    select 1 from public.document_upload_sessions
    where id = p_session_id and actor_user_id = auth.uid() and status = 'cancelled'
  ) then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
end;
$$;

create or replace function public.fail_document_upload_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.document_upload_sessions
  set status = 'failed'
  where id = p_session_id and actor_user_id = auth.uid() and status = 'pending';
  if not found and not exists (
    select 1 from public.document_upload_sessions
    where id = p_session_id and actor_user_id = auth.uid() and status = 'failed'
  ) then raise exception 'DOCUMENT_UPLOAD_SESSION_INVALID'; end if;
end;
$$;

revoke all on function public.get_document_upload_session_manifest(uuid) from public, anon;
grant execute on function public.get_document_upload_session_manifest(uuid) to authenticated;
revoke all on function public.mark_document_upload_files_verified(uuid,jsonb) from public, anon;
grant execute on function public.mark_document_upload_files_verified(uuid,jsonb) to authenticated;
revoke all on function public.cancel_document_upload_session(uuid) from public, anon;
grant execute on function public.cancel_document_upload_session(uuid) to authenticated;
revoke all on function public.fail_document_upload_session(uuid) from public, anon;
grant execute on function public.fail_document_upload_session(uuid) to authenticated;

create or replace function public.document_effective_visibility(p_default text, p_override text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_override is null then p_default
    when (case p_override when 'employee_hr' then 0 when 'hr_only' then 1 when 'super_admin_only' then 2 else -1 end)
       >= (case p_default when 'employee_hr' then 0 when 'hr_only' then 1 when 'super_admin_only' then 2 else 99 end)
      then p_override
    else null
  end
$$;

create or replace function public.list_own_documents(
  p_category_id uuid default null,
  p_review_status text default null,
  p_expiration_status text default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.employee_id is null then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.updated_at desc, x.document_id)
    from (
      select
        d.id as document_id,
        case when public.document_effective_visibility(cv.default_visibility, d.visibility_override) = 'employee_hr' then v.title else cv.name end as title,
        cv.name as category_name,
        public.document_effective_visibility(cv.default_visibility, d.visibility_override) as effective_visibility,
        v.review_status,
        case
          when v.expiration_date is null then 'no_expiration'
          when v.expiration_date < current_date then 'expired'
          when v.expiration_date <= current_date + cv.expiring_soon_days then 'expiring_soon'
          else 'valid'
        end as expiration_status,
        case when public.document_effective_visibility(cv.default_visibility, d.visibility_override) = 'employee_hr' then v.issue_date end as issue_date,
        case when public.document_effective_visibility(cv.default_visibility, d.visibility_override) = 'employee_hr' then v.expiration_date end as expiration_date,
        v.version_number,
        v.updated_at,
        (public.document_effective_visibility(cv.default_visibility, d.visibility_override) = 'employee_hr' and d.archived_at is null) as can_access_file
      from public.employee_documents d
      join lateral (
        select vv.* from public.employee_document_versions vv
        where vv.document_id = d.id order by vv.version_number desc limit 1
      ) v on true
      join public.document_category_versions cv on cv.id = v.category_version_id
      where d.employee_id = v_actor.employee_id
        and d.archived_at is null
        and (p_category_id is null or d.category_id = p_category_id)
        and (p_review_status is null or v.review_status = p_review_status)
        and (p_expiration_status is null or case
          when v.expiration_date is null then 'no_expiration'
          when v.expiration_date < current_date then 'expired'
          when v.expiration_date <= current_date + cv.expiring_soon_days then 'expiring_soon'
          else 'valid' end = p_expiration_status)
      order by v.updated_at desc, d.id
      limit greatest(1, least(coalesce(p_page_size, 25), 100))
      offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_page_size, 25), 100))
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_own_document_detail(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_document public.employee_documents%rowtype; v_latest record; v_visibility text;
begin
  select * into v_actor from public.current_document_actor();
  select * into v_document from public.employee_documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  if v_actor.employee_id is distinct from v_document.employee_id then raise exception 'DOCUMENT_ACCESS_DENIED'; end if;
  select v.*, cv.name as category_name, cv.default_visibility, cv.expiring_soon_days
  into v_latest
  from public.employee_document_versions v
  join public.document_category_versions cv on cv.id = v.category_version_id
  where v.document_id = v_document.id order by v.version_number desc limit 1;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_visibility := public.document_effective_visibility(v_latest.default_visibility, v_document.visibility_override);
  if v_visibility is null then raise exception 'DOCUMENT_INVALID_VISIBILITY'; end if;
  return jsonb_build_object(
    'id', v_document.id,
    'categoryId', v_document.category_id,
    'categoryName', v_latest.category_name,
    'title', case when v_visibility = 'employee_hr' then v_latest.title else v_latest.category_name end,
    'visibility', v_visibility,
    'archivedAt', v_document.archived_at,
    'latestStatus', v_latest.review_status,
    'employeeUploadEnabled', (
      select cv2.employee_upload_enabled from public.document_category_versions cv2
      where cv2.id = v_latest.category_version_id
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'versionNumber', v.version_number,
        'reviewStatus', v.review_status,
        'submittedAt', v.submitted_at,
        'createdAt', v.created_at,
        'title', case when v_visibility = 'employee_hr' then v.title else v_latest.category_name end,
        'referenceNumber', case when v_visibility = 'employee_hr' then v.reference_number end,
        'issueDate', case when v_visibility = 'employee_hr' then v.issue_date end,
        'expirationDate', case when v_visibility = 'employee_hr' then v.expiration_date end,
        'issuingOrganization', case when v_visibility = 'employee_hr' then v.issuing_organization end,
        'notes', case when v_visibility = 'employee_hr' then v.notes end,
        'tags', case when v_visibility = 'employee_hr' then to_jsonb(v.tags) else '[]'::jsonb end,
        'customMetadata', case when v_visibility = 'employee_hr' then coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(v.custom_metadata) e
          join public.document_category_fields f
            on f.category_version_id = v.category_version_id and f.field_key = e.key and f.employee_visible
        ), '{}'::jsonb) else '{}'::jsonb end,
        'employeeMessage', r.employee_message,
        'mimeType', case when v_visibility = 'employee_hr' then v.mime_type end,
        'canAccessFile', (v_visibility = 'employee_hr' and v_document.archived_at is null)
      ) order by v.version_number desc)
      from public.employee_document_versions v
      left join public.document_reviews r on r.document_version_id = v.id
      where v.document_id = v_document.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_employee_documents_for_hr(
  p_employee_id uuid,
  p_include_archived boolean default false,
  p_category_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.role not in ('hr_admin', 'super_admin') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'documentId', d.id,
      'categoryId', d.category_id,
      'categoryName', cv.name,
      'title', v.title,
      'effectiveVisibility', public.document_effective_visibility(cv.default_visibility, d.visibility_override),
      'reviewStatus', v.review_status,
      'expirationDate', v.expiration_date,
      'versionNumber', v.version_number,
      'activeVersionId', d.active_version_id,
      'archivedAt', d.archived_at,
      'updatedAt', v.updated_at
    ) order by v.updated_at desc, d.id)
    from public.employee_documents d
    join lateral (select vv.* from public.employee_document_versions vv where vv.document_id = d.id order by vv.version_number desc limit 1) v on true
    join public.document_category_versions cv on cv.id = v.category_version_id
    where d.employee_id = p_employee_id
      and (p_include_archived or d.archived_at is null)
      and (p_category_id is null or d.category_id = p_category_id)
      and (public.document_effective_visibility(cv.default_visibility, d.visibility_override) <> 'super_admin_only' or v_actor.role = 'super_admin')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_document_detail_for_hr(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_document public.employee_documents%rowtype; v_latest record; v_visibility text;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.role not in ('hr_admin', 'super_admin') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  select * into v_document from public.employee_documents where id = p_document_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  select v.*, cv.name as category_name, cv.default_visibility into v_latest
  from public.employee_document_versions v join public.document_category_versions cv on cv.id = v.category_version_id
  where v.document_id = v_document.id order by v.version_number desc limit 1;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_visibility := public.document_effective_visibility(v_latest.default_visibility, v_document.visibility_override);
  if v_visibility = 'super_admin_only' and v_actor.role <> 'super_admin' then raise exception 'DOCUMENT_ACCESS_DENIED'; end if;
  return jsonb_build_object(
    'id', v_document.id,
    'employeeId', v_document.employee_id,
    'categoryId', v_document.category_id,
    'categoryName', v_latest.category_name,
    'visibility', v_visibility,
    'archivedAt', v_document.archived_at,
    'activeVersionId', v_document.active_version_id,
    'categoryVersionSnapshot', (
      select jsonb_build_object(
        'id', cv.id,
        'versionNumber', cv.version_number,
        'name', cv.name,
        'description', cv.description,
        'defaultVisibility', cv.default_visibility,
        'employeeUploadEnabled', cv.employee_upload_enabled,
        'cardinality', cv.cardinality,
        'allowedMimeTypes', to_jsonb(cv.allowed_mime_types),
        'expirationMode', cv.expiration_mode,
        'defaultValidityMonths', cv.default_validity_months,
        'expiringSoonDays', cv.expiring_soon_days,
        'fields', coalesce((
          select jsonb_agg(jsonb_build_object(
            'fieldKey', f.field_key, 'label', f.label, 'fieldType', f.field_type,
            'isRequired', f.is_required, 'employeeVisible', f.employee_visible,
            'displayOrder', f.display_order
          ) order by f.display_order)
          from public.document_category_fields f where f.category_version_id = cv.id
        ), '[]'::jsonb)
      )
      from public.document_category_versions cv where cv.id = v_latest.category_version_id
    ),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'versionNumber', v.version_number, 'source', v.source,
        'reviewStatus', v.review_status, 'supersedesVersionId', v.supersedes_version_id,
        'title', v.title, 'referenceNumber', v.reference_number, 'issueDate', v.issue_date,
        'expirationDate', v.expiration_date, 'issuingOrganization', v.issuing_organization,
        'notes', v.notes, 'tags', v.tags, 'customMetadata', v.custom_metadata,
        'mimeType', v.mime_type, 'sizeBytes', v.size_bytes, 'submittedAt', v.submitted_at,
        'createdAt', v.created_at, 'updatedAt', v.updated_at,
        'employeeMessage', r.employee_message, 'internalReason', r.internal_reason,
        'reviewDecision', r.decision, 'reviewedAt', r.reviewed_at,
        'canAccessFile', true
      ) order by v.version_number desc)
      from public.employee_document_versions v left join public.document_reviews r on r.document_version_id = v.id
      where v.document_id = v_document.id
    ), '[]'::jsonb),
    'auditHistory', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'summary', a.summary, 'createdAt', a.created_at) order by a.created_at desc)
      from public.document_audit_logs a where a.document_id = v_document.id
    ), '[]'::jsonb),
    'compliance', coalesce((
      select to_jsonb(c) from public.document_employee_compliance_rows(v_document.employee_id) c
      where c.category_id = v_document.category_id limit 1
    ), '{}'::jsonb)
  );
end;
$$;

create or replace function public.list_recent_document_activity(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.role not in ('hr_admin', 'super_admin') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'documentId', a.document_id, 'employeeId', a.employee_id,
      'employeeName', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
      'categoryName', cv.name, 'action', a.action, 'summary', a.summary, 'occurredAt', a.created_at
    ) order by a.created_at desc)
    from (
      select * from public.document_audit_logs order by created_at desc limit greatest(1, least(coalesce(p_limit, 10), 50))
    ) a
    left join public.employees e on e.id = a.employee_id
    left join public.document_categories c on c.id = a.category_id
    left join lateral (
      select v.name from public.document_category_versions v where v.category_id = c.id order by v.version_number desc limit 1
    ) cv on true
  ), '[]'::jsonb);
end;
$$;

create or replace function public.authorize_document_file_access(
  p_version_id uuid,
  p_disposition text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record; v_row record; v_visibility text; v_action text;
begin
  if p_disposition not in ('preview', 'download') then raise exception 'DOCUMENT_ACCESS_DENIED'; end if;
  select * into v_actor from public.current_document_actor();
  select v.*, d.employee_id, d.category_id, d.visibility_override, d.archived_at,
         cv.default_visibility
  into v_row
  from public.employee_document_versions v
  join public.employee_documents d on d.id = v.document_id
  join public.document_category_versions cv on cv.id = v.category_version_id
  where v.id = p_version_id;
  if not found then raise exception 'DOCUMENT_NOT_FOUND'; end if;
  v_visibility := public.document_effective_visibility(v_row.default_visibility, v_row.visibility_override);
  if v_visibility is null then raise exception 'DOCUMENT_INVALID_VISIBILITY'; end if;
  if p_disposition = 'preview' and v_row.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then
    raise exception 'DOCUMENT_NOT_PREVIEWABLE';
  end if;
  if v_actor.role = 'super_admin' then null;
  elsif v_actor.role = 'hr_admin' and v_visibility in ('employee_hr', 'hr_only') then null;
  elsif v_actor.employee_id = v_row.employee_id and v_visibility = 'employee_hr' and v_row.archived_at is null then null;
  else raise exception 'DOCUMENT_ACCESS_DENIED';
  end if;

  v_action := case p_disposition when 'preview' then 'preview_link_issued' else 'download_link_issued' end;
  if not exists (
    select 1 from public.document_lifecycle_actions
    where actor_user_id = auth.uid() and action = 'document_file_access' and request_id = p_request_id
  ) then
    insert into public.document_lifecycle_actions(actor_user_id, action, request_id, target_key, result)
    values (auth.uid(), 'document_file_access', p_request_id, p_version_id::text,
      jsonb_build_object('version_id', p_version_id, 'disposition', p_disposition));
    perform public.write_document_audit(v_action, v_row.employee_id, v_row.category_id, v_row.document_id,
      p_version_id, p_request_id, jsonb_build_object('disposition', p_disposition));
  end if;
  return jsonb_build_object(
    'bucket', 'employee-documents', 'path', v_row.storage_path, 'filename', v_row.safe_filename,
    'mime_type', v_row.mime_type, 'expires_in', 60
  );
end;
$$;

revoke all on function public.document_effective_visibility(text,text) from public, anon, authenticated;
revoke all on function public.list_own_documents(uuid,text,text,integer,integer) from public, anon;
grant execute on function public.list_own_documents(uuid,text,text,integer,integer) to authenticated;
revoke all on function public.get_own_document_detail(uuid) from public, anon;
grant execute on function public.get_own_document_detail(uuid) to authenticated;
revoke all on function public.list_employee_documents_for_hr(uuid,boolean,uuid) from public, anon;
grant execute on function public.list_employee_documents_for_hr(uuid,boolean,uuid) to authenticated;
revoke all on function public.get_document_detail_for_hr(uuid) from public, anon;
grant execute on function public.get_document_detail_for_hr(uuid) to authenticated;
revoke all on function public.list_recent_document_activity(integer) from public, anon;
grant execute on function public.list_recent_document_activity(integer) to authenticated;
revoke all on function public.authorize_document_file_access(uuid,text,uuid) from public, anon;
grant execute on function public.authorize_document_file_access(uuid,text,uuid) to authenticated;

create or replace function public.list_document_review_queue(
  p_status text default 'pending_review',
  p_category_id uuid default null,
  p_employee_query text default null,
  p_submitted_from date default null,
  p_submitted_to date default null,
  p_expiration text default null,
  p_page integer default 1,
  p_page_size integer default 25
) returns table(
  document_id uuid,
  version_id uuid,
  employee_id uuid,
  employee_name text,
  category_id uuid,
  category_name text,
  title text,
  submitted_at timestamptz,
  expiration_date date,
  review_status text,
  expected_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_document_permission('documents.review') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  if p_status not in ('pending_review', 'replacement_requested') then raise exception 'DOCUMENT_INVALID_STATUS'; end if;
  return query
  select
    d.id, v.id, d.employee_id,
    btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
    d.category_id, cv.name, v.title, v.submitted_at, v.expiration_date,
    v.review_status, v.updated_at
  from public.employee_document_versions v
  join public.employee_documents d on d.id = v.document_id and d.archived_at is null
  join public.employees e on e.id = d.employee_id and e.archived_at is null
  join public.document_category_versions cv on cv.id = v.category_version_id
  where v.review_status = p_status
    and (p_category_id is null or d.category_id = p_category_id)
    and (p_employee_query is null or (
      coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '') || ' ' || coalesce(e.employee_number, '')
    ) ilike '%' || btrim(p_employee_query) || '%')
    and (p_submitted_from is null or v.submitted_at::date >= p_submitted_from)
    and (p_submitted_to is null or v.submitted_at::date <= p_submitted_to)
    and (p_expiration is null or case
      when v.expiration_date is null then 'none'
      when v.expiration_date < current_date then 'expired'
      when v.expiration_date <= current_date + cv.expiring_soon_days then 'expiring_soon'
      else 'valid' end = p_expiration)
    and (public.document_effective_visibility(cv.default_visibility, d.visibility_override) <> 'super_admin_only'
      or public.is_super_admin())
  order by v.submitted_at asc nulls last, v.id
  limit greatest(1, least(coalesce(p_page_size, 25), 100))
  offset (greatest(coalesce(p_page, 1), 1) - 1) * greatest(1, least(coalesce(p_page_size, 25), 100));
end;
$$;

create or replace function public.get_document_review_detail(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_document_permission('documents.review') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  return public.get_document_detail_for_hr(p_document_id);
end;
$$;

revoke all on function public.list_document_review_queue(text,uuid,text,date,date,text,integer,integer) from public, anon;
grant execute on function public.list_document_review_queue(text,uuid,text,date,date,text,integer,integer) to authenticated;
revoke all on function public.get_document_review_detail(uuid) from public, anon;
grant execute on function public.get_document_review_detail(uuid) to authenticated;


create or replace function public.get_document_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_actor record;
begin
  select * into v_actor from public.current_document_actor();
  if v_actor.role not in ('hr_admin', 'super_admin') then raise exception 'DOCUMENT_PERMISSION_DENIED'; end if;
  return jsonb_build_object(
    'pendingReviewCount', (
      select count(*) from public.employee_document_versions v
      join public.employee_documents d on d.id = v.document_id and d.archived_at is null
      where v.review_status = 'pending_review'
    ),
    'missingDocumentCount', (
      select count(*) from public.employees e
      join lateral public.document_employee_compliance_rows(e.id) c on true
      where e.archived_at is null and c.status = 'missing'
    ),
    'expiringSoonCount', (
      select count(*) from public.employees e
      join lateral public.document_employee_compliance_rows(e.id) c on true
      where e.archived_at is null and c.status = 'expiring_soon'
    ),
    'expiredCount', (
      select count(*) from public.employees e
      join lateral public.document_employee_compliance_rows(e.id) c on true
      where e.archived_at is null and c.status = 'expired'
    ),
    'recentUploads', coalesce((
      select jsonb_agg(to_jsonb(x) order by x."occurredAt" desc)
      from (
        select a.id, a.document_id as "documentId", a.employee_id as "employeeId",
          btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as "employeeName",
          coalesce(cv.name, 'Document') as "categoryName", coalesce(v.title, cv.name, 'Document') as title,
          a.action, a.created_at as "occurredAt"
        from public.document_audit_logs a
        left join public.employees e on e.id = a.employee_id
        left join public.document_categories c on c.id = a.category_id
        left join lateral (select vv.name from public.document_category_versions vv where vv.category_id = c.id order by vv.version_number desc limit 1) cv on true
        left join public.employee_document_versions v on v.id = a.document_version_id
        where a.action in ('employee_document_finalized', 'hr_document_finalized', 'employee_document_submitted')
        order by a.created_at desc limit 8
      ) x
    ), '[]'::jsonb),
    'recentDecisions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x."occurredAt" desc)
      from (
        select a.id, a.document_id as "documentId", a.employee_id as "employeeId",
          btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as "employeeName",
          coalesce(cv.name, 'Document') as "categoryName", coalesce(v.title, cv.name, 'Document') as title,
          a.action, a.created_at as "occurredAt"
        from public.document_audit_logs a
        left join public.employees e on e.id = a.employee_id
        left join public.document_categories c on c.id = a.category_id
        left join lateral (select vv.name from public.document_category_versions vv where vv.category_id = c.id order by vv.version_number desc limit 1) cv on true
        left join public.employee_document_versions v on v.id = a.document_version_id
        where a.action in ('employee_document_reviewed', 'document_version_restored', 'employee_document_archived', 'employee_document_restored')
        order by a.created_at desc limit 8
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_document_admin_dashboard() from public, anon;
grant execute on function public.get_document_admin_dashboard() to authenticated;

notify pgrst, 'reload schema';
commit;
