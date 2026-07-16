begin;

create extension if not exists pgcrypto;

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint leave_types_code_unique unique (code),
  constraint leave_types_code_check check (code ~ '^[A-Z][A-Z0-9-]{1,49}$')
);

create table if not exists public.leave_type_versions (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  revision_number integer not null,
  effective_from date not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_paid boolean not null,
  is_balance_tracked boolean not null,
  default_annual_units numeric(6,1) not null default 0,
  carryover_enabled boolean not null default false,
  carryover_cap_units numeric(6,1),
  employee_note_required boolean not null default false,
  document_required boolean not null default false,
  document_required_min_units numeric(6,1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  change_reason text,
  constraint leave_type_versions_revision_unique unique (leave_type_id, revision_number),
  constraint leave_type_versions_effective_unique unique (leave_type_id, effective_from),
  constraint leave_type_versions_name_check check (char_length(btrim(name)) between 1 and 100),
  constraint leave_type_versions_description_check check (description is null or char_length(description) <= 1000),
  constraint leave_type_versions_paid_check check (not is_paid or is_balance_tracked),
  constraint leave_type_versions_default_units_check check (
    default_annual_units >= 0
    and default_annual_units * 2 = trunc(default_annual_units * 2)
    and (is_balance_tracked or default_annual_units = 0)
  ),
  constraint leave_type_versions_carryover_check check (
    (is_balance_tracked or (not carryover_enabled and carryover_cap_units is null))
    and (carryover_enabled or carryover_cap_units is null)
    and (carryover_cap_units is null or (
      carryover_cap_units > 0
      and carryover_cap_units * 2 = trunc(carryover_cap_units * 2)
    ))
  ),
  constraint leave_type_versions_document_check check (
    document_required
    or document_required_min_units is null
  ),
  constraint leave_type_versions_document_units_check check (
    document_required_min_units is null
    or (
      document_required_min_units > 0
      and document_required_min_units * 2 = trunc(document_required_min_units * 2)
    )
  ),
  constraint leave_type_versions_reason_check check (change_reason is null or char_length(change_reason) <= 1000)
);

create table if not exists public.employee_leave_year_settings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null,
  is_excluded boolean not null default false,
  annual_allocation_override_units numeric(6,1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz,
  private_reason text,
  constraint employee_leave_year_setting_unique unique (employee_id, leave_type_id, leave_year),
  constraint employee_leave_year_setting_year_check check (leave_year between 2000 and 2200),
  constraint employee_leave_year_setting_units_check check (
    annual_allocation_override_units is null
    or (
      annual_allocation_override_units >= 0
      and annual_allocation_override_units * 2 = trunc(annual_allocation_override_units * 2)
    )
  ),
  constraint employee_leave_year_setting_reason_check check (private_reason is null or char_length(private_reason) <= 1000)
);

create table if not exists public.leave_request_groups (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_source text not null,
  active_revision_id uuid,
  current_status text not null default 'draft',
  replaces_request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  superseded_by_request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_request_groups_source_check check (created_source in ('employee', 'hr')),
  constraint leave_request_groups_status_check check (current_status in (
    'draft','pending','approved','rejected','withdrawn','cancelled','superseded'
  )),
  constraint leave_request_groups_replacement_check check (
    replaces_request_group_id is null or replaces_request_group_id <> id
  )
);

create table if not exists public.leave_request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete cascade,
  revision_number integer not null,
  leave_type_version_id uuid not null references public.leave_type_versions(id) on delete restrict,
  leave_year integer not null,
  start_date date not null,
  end_date date not null,
  duration_mode text not null,
  employee_note text,
  requested_units numeric(6,1) not null,
  submitted_chargeable_units numeric(6,1) not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  submitted_at timestamptz,
  frozen_at timestamptz,
  constraint leave_request_revisions_revision_unique unique (request_group_id, revision_number),
  constraint leave_request_revisions_dates_check check (
    start_date <= end_date
    and extract(year from start_date)::integer = leave_year
    and extract(year from end_date)::integer = leave_year
  ),
  constraint leave_request_revisions_duration_check check (
    duration_mode in ('full_day','first_half','second_half')
    and (duration_mode = 'full_day' or start_date = end_date)
  ),
  constraint leave_request_revisions_note_check check (employee_note is null or char_length(employee_note) <= 1000),
  constraint leave_request_revisions_units_check check (
    requested_units > 0
    and requested_units * 2 = trunc(requested_units * 2)
    and submitted_chargeable_units >= 0
    and submitted_chargeable_units * 2 = trunc(submitted_chargeable_units * 2)
  )
);

alter table public.leave_request_groups
  add constraint leave_request_groups_active_revision_fkey
  foreign key (active_revision_id)
  references public.leave_request_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.leave_request_days (
  id uuid primary key default gen_random_uuid(),
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete restrict,
  leave_date date not null,
  active_revision_id uuid,
  created_at timestamptz not null default now(),
  constraint leave_request_days_unique unique (request_revision_id, leave_date)
);

create table if not exists public.leave_request_day_revisions (
  id uuid primary key default gen_random_uuid(),
  request_day_id uuid not null references public.leave_request_days(id) on delete restrict,
  revision_number integer not null,
  schedule_assignment_id uuid references public.employee_schedule_assignments(id) on delete restrict,
  schedule_version_id uuid references public.work_schedule_versions(id) on delete restrict,
  holiday_version_id uuid references public.holiday_calendar_versions(id) on delete restrict,
  attendance_calculation_revision_id uuid references public.attendance_calculation_revisions(id) on delete restrict,
  is_scheduled_workday boolean not null,
  is_rest_day boolean not null,
  is_holiday boolean not null,
  is_chargeable boolean not null,
  chargeable_units numeric(2,1) not null,
  leave_classification text not null,
  half_day_boundary_at timestamptz,
  conflict_state text,
  calculation_source text not null,
  calculated_by uuid references public.profiles(id) on delete set null,
  calculated_at timestamptz not null default now(),
  recalculation_reason text,
  constraint leave_request_day_revisions_unique unique (request_day_id, revision_number),
  constraint leave_request_day_units_check check (
    chargeable_units in (0, 0.5, 1)
    and is_chargeable = (chargeable_units > 0)
  ),
  constraint leave_request_day_classification_check check (leave_classification in (
    'paid_leave','unpaid_leave','non_chargeable_holiday','non_chargeable_rest_day',
    'non_chargeable_no_schedule','attendance_precedence'
  )),
  constraint leave_request_day_source_check check (calculation_source in (
    'submission','approval_refresh','attendance_recalculation','schedule_recalculation','holiday_recalculation','cancellation'
  )),
  constraint leave_request_day_reason_check check (recalculation_reason is null or char_length(recalculation_reason) <= 1000)
);

alter table public.leave_request_days
  add constraint leave_request_days_active_revision_fkey
  foreign key (active_revision_id)
  references public.leave_request_day_revisions(id)
  on delete restrict
  deferrable initially deferred;

create table if not exists public.leave_request_actions (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete restrict,
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete restrict,
  action_type text not null,
  from_status text,
  to_status text not null,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_role text not null,
  action_reason text,
  review_note text,
  created_at timestamptz not null default now(),
  constraint leave_request_actions_type_check check (action_type in (
    'created','submitted','approved','rejected','withdrawn','cancelled','superseded'
  )),
  constraint leave_request_actions_status_check check (
    (from_status is null or from_status in ('draft','pending','approved','rejected','withdrawn','cancelled','superseded'))
    and to_status in ('draft','pending','approved','rejected','withdrawn','cancelled','superseded')
  ),
  constraint leave_request_actions_private_text_check check (
    (action_reason is null or char_length(action_reason) <= 1000)
    and (review_note is null or char_length(review_note) <= 1000)
  )
);

create table if not exists public.leave_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_group_id uuid not null references public.leave_request_groups(id) on delete cascade,
  request_revision_id uuid not null references public.leave_request_revisions(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  frozen_at timestamptz,
  constraint leave_request_attachment_filename_check check (char_length(original_filename) between 1 and 255),
  constraint leave_request_attachment_mime_check check (mime_type in ('application/pdf','image/jpeg','image/png')),
  constraint leave_request_attachment_size_check check (size_bytes between 1 and 10485760)
);

create table if not exists public.leave_balance_accounts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_year integer not null,
  created_at timestamptz not null default now(),
  constraint leave_balance_account_unique unique (employee_id, leave_type_id, leave_year),
  constraint leave_balance_account_year_check check (leave_year between 2000 and 2200)
);

create table if not exists public.leave_balance_ledger (
  id uuid primary key default gen_random_uuid(),
  balance_account_id uuid not null references public.leave_balance_accounts(id) on delete restrict,
  entry_type text not null,
  units numeric(6,1) not null,
  effective_date date not null,
  expires_on date,
  source_entry_id uuid references public.leave_balance_ledger(id) on delete restrict,
  reversal_of_entry_id uuid references public.leave_balance_ledger(id) on delete restrict,
  request_group_id uuid references public.leave_request_groups(id) on delete restrict,
  request_day_revision_id uuid references public.leave_request_day_revisions(id) on delete restrict,
  generation_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  private_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint leave_balance_ledger_generation_unique unique (generation_key),
  constraint leave_balance_ledger_type_check check (entry_type in (
    'annual_allocation','carryover','hr_adjustment_credit','hr_adjustment_debit',
    'approved_leave_charge','cancellation_restoration','attendance_conflict_release',
    'recalculation_charge','recalculation_release'
  )),
  constraint leave_balance_ledger_units_check check (
    units <> 0 and units * 2 = trunc(units * 2)
  ),
  constraint leave_balance_ledger_sign_check check (
    (entry_type in ('annual_allocation','carryover','hr_adjustment_credit','cancellation_restoration','attendance_conflict_release','recalculation_release') and units > 0)
    or (entry_type in ('hr_adjustment_debit','approved_leave_charge','recalculation_charge') and units < 0)
  ),
  constraint leave_balance_ledger_reason_check check (private_reason is null or char_length(private_reason) <= 1000)
);

create table if not exists public.leave_attendance_conflicts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  request_group_id uuid not null references public.leave_request_groups(id) on delete restrict,
  request_day_id uuid not null references public.leave_request_days(id) on delete restrict,
  leave_day_revision_id uuid not null references public.leave_request_day_revisions(id) on delete restrict,
  attendance_calculation_revision_id uuid references public.attendance_calculation_revisions(id) on delete restrict,
  conflict_type text not null,
  status text not null default 'open',
  automatic_balance_action text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_type text,
  private_resolution_note text,
  constraint leave_conflict_type_check check (conflict_type in (
    'full_day_completed_attendance','full_day_incomplete_attendance','half_day_covered_time_overlap',
    'schedule_recalculation_failed','holiday_recalculation_failed','insufficient_balance_after_recalculation'
  )),
  constraint leave_conflict_status_check check (status in ('open','resolved','superseded')),
  constraint leave_conflict_note_check check (private_resolution_note is null or char_length(private_resolution_note) <= 1000)
);

create index if not exists leave_type_versions_effective_idx
  on public.leave_type_versions(leave_type_id, effective_from desc, revision_number desc);
create index if not exists employee_leave_year_settings_year_idx
  on public.employee_leave_year_settings(leave_year, leave_type_id, employee_id);
create index if not exists leave_request_groups_employee_status_idx
  on public.leave_request_groups(employee_id, current_status, updated_at desc);
create index if not exists leave_request_revisions_dates_idx
  on public.leave_request_revisions(leave_year, start_date, end_date);
create index if not exists leave_request_days_date_idx
  on public.leave_request_days(leave_date, request_revision_id);
create index if not exists leave_request_day_revisions_active_context_idx
  on public.leave_request_day_revisions(request_day_id, revision_number desc);
create index if not exists leave_balance_ledger_account_expiration_idx
  on public.leave_balance_ledger(balance_account_id, expires_on, created_at, id);
create index if not exists leave_balance_ledger_request_idx
  on public.leave_balance_ledger(request_group_id, request_day_revision_id);
create index if not exists leave_conflicts_queue_idx
  on public.leave_attendance_conflicts(status, conflict_type, created_at desc);

create or replace view public.leave_current_day_state
with (security_invoker = true)
as
select
  day.id as request_day_id,
  day.request_revision_id,
  day.leave_date,
  revision.id as request_day_revision_id,
  revision.revision_number,
  revision.schedule_assignment_id,
  revision.schedule_version_id,
  revision.holiday_version_id,
  revision.attendance_calculation_revision_id,
  revision.is_scheduled_workday,
  revision.is_rest_day,
  revision.is_holiday,
  revision.is_chargeable,
  revision.chargeable_units,
  revision.leave_classification,
  revision.half_day_boundary_at,
  revision.conflict_state,
  revision.calculation_source,
  revision.calculated_by,
  revision.calculated_at,
  revision.recalculation_reason
from public.leave_request_days as day
join public.leave_request_day_revisions as revision
  on revision.id = day.active_revision_id;

create or replace view public.leave_pending_reservations
with (security_invoker = true)
as
select
  request_group.employee_id,
  version.leave_type_id,
  request_revision.leave_year,
  sum(day_revision.chargeable_units)::numeric(10,1) as reserved_units
from public.leave_request_groups as request_group
join public.leave_request_revisions as request_revision
  on request_revision.id = request_group.active_revision_id
join public.leave_type_versions as version
  on version.id = request_revision.leave_type_version_id
join public.leave_request_days as day
  on day.request_revision_id = request_revision.id
join public.leave_request_day_revisions as day_revision
  on day_revision.id = day.active_revision_id
where request_group.current_status = 'pending'
  and day_revision.is_chargeable
  and version.is_balance_tracked
group by request_group.employee_id, version.leave_type_id, request_revision.leave_year;

create or replace function public.write_leave_audit(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(coalesce(p_safe_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'LEAVE_AUDIT_PAYLOAD_INVALID';
  end if;
  return public.write_employee_audit(
    p_employee_id,
    p_action,
    p_entity_type,
    p_entity_id,
    '[]'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    coalesce(p_safe_metadata, '{}'::jsonb),
    'application',
    auth.uid()
  );
end;
$$;

revoke all on function public.write_leave_audit(uuid,text,text,uuid,jsonb)
from public, anon, authenticated;

create or replace function public.prevent_leave_immutable_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
end;
$$;

create trigger prevent_leave_type_version_mutation
before update or delete on public.leave_type_versions
for each row execute function public.prevent_leave_immutable_mutation();
create or replace function public.prevent_leave_request_day_identity_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if new.id is distinct from old.id
     or new.request_revision_id is distinct from old.request_revision_id
     or new.leave_date is distinct from old.leave_date
     or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if new.active_revision_id is not null
     and not exists (
       select 1
       from public.leave_request_day_revisions as day_revision
       where day_revision.id = new.active_revision_id
         and day_revision.request_day_id = old.id
     ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_ACTIVE_REVISION_MISMATCH';
  end if;

  return new;
end;
$$;

create trigger protect_leave_request_day_identity
before update or delete on public.leave_request_days
for each row execute function public.prevent_leave_request_day_identity_mutation();
create trigger prevent_leave_request_day_revision_mutation
before update or delete on public.leave_request_day_revisions
for each row execute function public.prevent_leave_immutable_mutation();
create or replace function public.prevent_submitted_leave_request_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE' then
    select current_status into v_status
    from public.leave_request_groups
    where id = old.request_group_id;

    if v_status = 'draft' then
      return old;
    end if;
  end if;

  raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
end;
$$;

create trigger prevent_leave_request_action_mutation
before update or delete on public.leave_request_actions
for each row execute function public.prevent_submitted_leave_request_action_mutation();
create trigger prevent_leave_balance_ledger_mutation
before update or delete on public.leave_balance_ledger
for each row execute function public.prevent_leave_immutable_mutation();

create or replace function public.prevent_submitted_leave_attachment_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if old.frozen_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  select current_status into v_status
  from public.leave_request_groups
  where id = old.request_group_id;

  if v_status is not null and v_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if new.id is distinct from old.id
     or new.request_group_id is distinct from old.request_group_id
     or new.request_revision_id is distinct from old.request_revision_id
     or new.storage_path is distinct from old.storage_path
     or new.original_filename is distinct from old.original_filename
     or new.mime_type is distinct from old.mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.uploaded_by is distinct from old.uploaded_by
     or new.uploaded_at is distinct from old.uploaded_at
     or new.frozen_at is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  return new;
end;
$$;

create trigger prevent_submitted_leave_attachment_mutation
before update or delete on public.leave_request_attachments
for each row execute function public.prevent_submitted_leave_attachment_mutation();

revoke all on function public.prevent_submitted_leave_attachment_mutation()
from public, anon, authenticated;

revoke all on function public.prevent_leave_immutable_mutation()
from public, anon, authenticated;

revoke all on function public.prevent_leave_request_day_identity_mutation()
from public, anon, authenticated;

revoke all on function public.prevent_submitted_leave_request_action_mutation()
from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-documents',
  'leave-documents',
  false,
  10 * 1024 * 1024,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_leave_storage_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_hr_admin()
    or exists (
      select 1
      from public.leave_request_attachments as attachment
      join public.leave_request_groups as request_group
        on request_group.id = attachment.request_group_id
      where attachment.storage_path = p_object_name
        and request_group.employee_id = public.current_employee_id()
    )
    or exists (
      select 1
      from public.leave_request_groups as request_group
      join public.leave_request_revisions as request_revision
        on request_revision.id = request_group.active_revision_id
      where request_group.employee_id = public.current_employee_id()
        and request_group.current_status = 'draft'
        and p_object_name like request_group.employee_id::text || '/' || request_group.id::text || '/%'
    );
$$;

revoke all on function public.can_access_leave_storage_object(text)
from public, anon;
grant execute on function public.can_access_leave_storage_object(text)
to authenticated;

create policy "Authorized users read leave documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
);
create policy "Authorized users upload draft leave documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
);
create policy "Authorized users delete draft leave documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'leave-documents'
  and public.can_access_leave_storage_object(name)
  and exists (
    select 1
    from public.leave_request_groups as request_group
    where request_group.current_status = 'draft'
      and name like request_group.employee_id::text || '/' || request_group.id::text || '/%'
  )
);

alter table public.leave_types enable row level security;
alter table public.leave_type_versions enable row level security;
alter table public.employee_leave_year_settings enable row level security;
alter table public.leave_request_groups enable row level security;
alter table public.leave_request_revisions enable row level security;
alter table public.leave_request_days enable row level security;
alter table public.leave_request_day_revisions enable row level security;
alter table public.leave_request_actions enable row level security;
alter table public.leave_request_attachments enable row level security;
alter table public.leave_balance_accounts enable row level security;
alter table public.leave_balance_ledger enable row level security;
alter table public.leave_attendance_conflicts enable row level security;

create policy "HR views leave types"
on public.leave_types for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave type versions"
on public.leave_type_versions for select to authenticated
using (public.is_hr_admin());
create policy "HR views employee leave year settings"
on public.employee_leave_year_settings for select to authenticated
using (public.is_hr_admin());

create policy "Authorized users view leave request groups"
on public.leave_request_groups for select to authenticated
using (public.is_hr_admin() or employee_id = public.current_employee_id());
create policy "Authorized users view leave request revisions"
on public.leave_request_revisions for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request days"
on public.leave_request_days for select to authenticated
using (
  exists (
    select 1
    from public.leave_request_revisions as request_revision
    join public.leave_request_groups as request_group
      on request_group.id = request_revision.request_group_id
    where request_revision.id = request_revision_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request day revisions"
on public.leave_request_day_revisions for select to authenticated
using (
  exists (
    select 1
    from public.leave_request_days as request_day
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_day.request_revision_id
    join public.leave_request_groups as request_group
      on request_group.id = request_revision.request_group_id
    where request_day.id = request_day_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave request actions"
on public.leave_request_actions for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "Authorized users view leave attachments"
on public.leave_request_attachments for select to authenticated
using (
  exists (
    select 1 from public.leave_request_groups as request_group
    where request_group.id = request_group_id
      and (public.is_hr_admin() or request_group.employee_id = public.current_employee_id())
  )
);
create policy "HR views leave balance accounts"
on public.leave_balance_accounts for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave ledger"
on public.leave_balance_ledger for select to authenticated
using (public.is_hr_admin());
create policy "HR views leave conflicts"
on public.leave_attendance_conflicts for select to authenticated
using (public.is_hr_admin());

revoke all on public.leave_current_day_state from public, anon;
revoke all on public.leave_pending_reservations from public, anon;
grant select on public.leave_current_day_state to authenticated;
grant select on public.leave_pending_reservations to authenticated;

create or replace function public.normalize_leave_code(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select trim(both '-' from regexp_replace(upper(btrim(coalesce(p_value, ''))), '[^A-Z0-9]+', '-', 'g'));
$$;

create or replace function public.normalize_leave_private_text(
  p_value text,
  p_required boolean default false
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
declare
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if p_required and v_value is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PRIVATE_TEXT_REQUIRED';
  end if;
  if v_value is not null and char_length(v_value) > 1000 then
    raise exception using errcode = 'P0001', message = 'LEAVE_PRIVATE_TEXT_TOO_LONG';
  end if;
  return v_value;
end;
$$;

create or replace function public.resolve_leave_type_version(
  p_leave_type_id uuid,
  p_effective_date date
)
returns table (
  leave_type_version_id uuid,
  leave_type_id uuid,
  revision_number integer,
  effective_from date,
  name text,
  description text,
  is_active boolean,
  is_paid boolean,
  is_balance_tracked boolean,
  default_annual_units numeric,
  carryover_enabled boolean,
  carryover_cap_units numeric,
  employee_note_required boolean,
  document_required boolean,
  document_required_min_units numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    version.id,
    version.leave_type_id,
    version.revision_number,
    version.effective_from,
    version.name,
    version.description,
    version.is_active,
    version.is_paid,
    version.is_balance_tracked,
    version.default_annual_units,
    version.carryover_enabled,
    version.carryover_cap_units,
    version.employee_note_required,
    version.document_required,
    version.document_required_min_units
  from public.leave_type_versions as version
  where version.leave_type_id = p_leave_type_id
    and version.effective_from <= p_effective_date
  order by version.effective_from desc, version.revision_number desc
  limit 1;
$$;

revoke all on function public.normalize_leave_code(text) from public, anon, authenticated;
revoke all on function public.normalize_leave_private_text(text, boolean) from public, anon, authenticated;
revoke all on function public.resolve_leave_type_version(uuid, date) from public, anon;
grant execute on function public.resolve_leave_type_version(uuid, date) to authenticated;

create or replace function public.create_leave_type_version(
  p_leave_type_id uuid,
  p_effective_from date,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_is_paid boolean,
  p_is_balance_tracked boolean,
  p_default_annual_units numeric,
  p_carryover_enabled boolean,
  p_carryover_cap_units numeric,
  p_employee_note_required boolean,
  p_document_required boolean,
  p_document_required_min_units numeric,
  p_change_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_change_reason, false);
  v_revision_number integer;
  v_version_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_type_id is null or p_effective_from is null or char_length(v_name) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_is_paid and not p_is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_default_annual_units is null
     or p_default_annual_units < 0
     or p_default_annual_units * 2 <> trunc(p_default_annual_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_is_balance_tracked and (
    p_default_annual_units <> 0
    or p_carryover_enabled
    or p_carryover_cap_units is not null
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_carryover_enabled and p_carryover_cap_units is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_carryover_cap_units is not null and (
    p_carryover_cap_units <= 0
    or p_carryover_cap_units * 2 <> trunc(p_carryover_cap_units * 2)
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if not p_document_required and p_document_required_min_units is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_document_required_min_units is not null and (
    p_document_required_min_units <= 0
    or p_document_required_min_units * 2 <> trunc(p_document_required_min_units * 2)
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;
  if p_effective_from <= public.company_attendance_date(now()) and v_reason is null
     and exists (select 1 from public.leave_type_versions where leave_type_id = p_leave_type_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CHANGE_REASON_REQUIRED';
  end if;

  perform 1 from public.leave_types where id = p_leave_type_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_NOT_FOUND';
  end if;

  select coalesce(max(revision_number), 0) + 1
    into v_revision_number
  from public.leave_type_versions
  where leave_type_id = p_leave_type_id;

  insert into public.leave_type_versions (
    leave_type_id, revision_number, effective_from, name, description,
    is_active, is_paid, is_balance_tracked, default_annual_units,
    carryover_enabled, carryover_cap_units, employee_note_required,
    document_required, document_required_min_units, created_by, change_reason
  ) values (
    p_leave_type_id, v_revision_number, p_effective_from, v_name,
    v_description, p_is_active, p_is_paid,
    p_is_balance_tracked, p_default_annual_units, p_carryover_enabled,
    p_carryover_cap_units, p_employee_note_required, p_document_required,
    p_document_required_min_units, v_actor, v_reason
  ) returning id into v_version_id;

  perform public.write_leave_audit(
    null,
    'leave_type.version_created',
    'leave_type',
    p_leave_type_id,
    jsonb_build_object(
      'leave_type_id', p_leave_type_id,
      'leave_type_version_id', v_version_id,
      'revision_number', v_revision_number,
      'effective_from', p_effective_from,
      'is_active', p_is_active,
      'is_paid', p_is_paid,
      'is_balance_tracked', p_is_balance_tracked
    )
  );
  return v_version_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_EFFECTIVE_DATE_EXISTS';
end;
$$;

create or replace function public.create_leave_type(
  p_code text,
  p_effective_from date,
  p_name text,
  p_description text,
  p_is_active boolean,
  p_is_paid boolean,
  p_is_balance_tracked boolean,
  p_default_annual_units numeric,
  p_carryover_enabled boolean,
  p_carryover_cap_units numeric,
  p_employee_note_required boolean,
  p_document_required boolean,
  p_document_required_min_units numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text := public.normalize_leave_code(p_code);
  v_leave_type_id uuid;
  v_version_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if char_length(v_code) < 2 or char_length(v_code) > 50 then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INVALID';
  end if;

  insert into public.leave_types (code, created_by)
  values (v_code, v_actor)
  returning id into v_leave_type_id;

  v_version_id := public.create_leave_type_version(
    v_leave_type_id,
    p_effective_from,
    p_name,
    p_description,
    p_is_active,
    p_is_paid,
    p_is_balance_tracked,
    p_default_annual_units,
    p_carryover_enabled,
    p_carryover_cap_units,
    p_employee_note_required,
    p_document_required,
    p_document_required_min_units,
    null
  );

  perform public.write_leave_audit(
    null,
    'leave_type.created',
    'leave_type',
    v_leave_type_id,
    jsonb_build_object(
      'leave_type_id', v_leave_type_id,
      'leave_type_version_id', v_version_id,
      'code', v_code
    )
  );
  return v_leave_type_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_CODE_EXISTS';
end;
$$;

create or replace function public.archive_leave_type(
  p_leave_type_id uuid,
  p_effective_from date,
  p_change_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current record;
  v_version_id uuid;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  select * into v_current
  from public.resolve_leave_type_version(p_leave_type_id, p_effective_from);
  if v_current.leave_type_version_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_NOT_FOUND';
  end if;
  v_version_id := public.create_leave_type_version(
    p_leave_type_id,
    p_effective_from,
    v_current.name,
    v_current.description,
    false,
    v_current.is_paid,
    v_current.is_balance_tracked,
    v_current.default_annual_units,
    v_current.carryover_enabled,
    v_current.carryover_cap_units,
    v_current.employee_note_required,
    v_current.document_required,
    v_current.document_required_min_units,
    public.normalize_leave_private_text(p_change_reason, true)
  );
  perform public.write_leave_audit(
    null,
    'leave_type.archived',
    'leave_type',
    p_leave_type_id,
    jsonb_build_object('leave_type_id', p_leave_type_id, 'leave_type_version_id', v_version_id)
  );
  return v_version_id;
end;
$$;

revoke all on function public.create_leave_type(
  text,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric
) from public, anon;
revoke all on function public.create_leave_type_version(
  uuid,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric,text
) from public, anon;
revoke all on function public.archive_leave_type(uuid,date,text) from public, anon;
grant execute on function public.create_leave_type(
  text,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric
) to authenticated;
grant execute on function public.create_leave_type_version(
  uuid,date,text,text,boolean,boolean,boolean,numeric,boolean,numeric,boolean,boolean,numeric,text
) to authenticated;
grant execute on function public.archive_leave_type(uuid,date,text) to authenticated;

create or replace function public.get_active_leave_type_options(p_effective_date date)
returns table (
  leave_type_id uuid,
  code text,
  leave_type_version_id uuid,
  name text,
  is_paid boolean,
  is_balance_tracked boolean,
  employee_note_required boolean,
  document_required boolean,
  document_required_min_units numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select stable.id, stable.code, resolved.leave_type_version_id, resolved.name,
         resolved.is_paid, resolved.is_balance_tracked,
         resolved.employee_note_required, resolved.document_required,
         resolved.document_required_min_units
  from public.leave_types as stable
  cross join lateral public.resolve_leave_type_version(stable.id, p_effective_date) as resolved
  where resolved.is_active
  order by resolved.name, stable.code;
$$;
revoke all on function public.get_active_leave_type_options(date) from public, anon;
grant execute on function public.get_active_leave_type_options(date) to authenticated;

create or replace function public.get_or_create_leave_balance_account(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
begin
  if p_employee_id is null or p_leave_type_id is null or p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_BALANCE_ACCOUNT_INVALID';
  end if;

  insert into public.leave_balance_accounts (employee_id, leave_type_id, leave_year)
  values (p_employee_id, p_leave_type_id, p_leave_year)
  on conflict (employee_id, leave_type_id, leave_year)
  do update set employee_id = excluded.employee_id
  returning id into v_account_id;

  perform 1
  from public.leave_balance_accounts
  where id = v_account_id
  for update;

  return v_account_id;
end;
$$;

create or replace function public.get_leave_source_remaining(
  p_source_entry_id uuid,
  p_as_of_date date
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select least(
    source.units,
    greatest(
      0,
      source.units + coalesce(sum(linked.units) filter (
        where linked.effective_date <= p_as_of_date
      ), 0)
    )
  )::numeric(10,1)
  from public.leave_balance_ledger as source
  left join public.leave_balance_ledger as linked
    on linked.source_entry_id = source.id
  where source.id = p_source_entry_id
    and source.units > 0
    and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
    and source.effective_date <= p_as_of_date
    and (source.expires_on is null or source.expires_on >= p_as_of_date)
  group by source.id, source.units;
$$;

create or replace function public.get_leave_balance(
  p_balance_account_id uuid,
  p_as_of_date date
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(public.get_leave_source_remaining(source.id, p_as_of_date)), 0)::numeric(10,1)
  from public.leave_balance_ledger as source
  where source.balance_account_id = p_balance_account_id
    and source.units > 0
    and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
    and source.effective_date <= p_as_of_date
    and (source.expires_on is null or source.expires_on >= p_as_of_date);
$$;

create or replace function public.consume_leave_balance(
  p_balance_account_id uuid,
  p_units numeric,
  p_entry_type text,
  p_effective_date date,
  p_request_group_id uuid,
  p_request_day_revision_id uuid,
  p_created_by uuid,
  p_private_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_remaining numeric := p_units;
  v_available numeric;
  v_take numeric;
  v_source record;
  v_created uuid[] := '{}'::uuid[];
  v_entry_id uuid;
begin
  if p_units is null or p_units <= 0 or p_units * 2 <> trunc(p_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_UNITS_INVALID';
  end if;
  if p_effective_date is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;
  if p_entry_type not in ('approved_leave_charge','hr_adjustment_debit','recalculation_charge') then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;

  perform 1
  from public.leave_balance_accounts
  where id = p_balance_account_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_BALANCE_ACCOUNT_NOT_FOUND';
  end if;

  for v_source in
    select source.*
    from public.leave_balance_ledger as source
    where source.balance_account_id = p_balance_account_id
      and source.units > 0
      and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
      and source.effective_date <= p_effective_date
      and (source.expires_on is null or source.expires_on >= p_effective_date)
      and public.get_leave_source_remaining(source.id, p_effective_date) > 0
    order by source.expires_on asc nulls last, source.created_at asc, source.id asc
    for update
  loop
    exit when v_remaining = 0;
    v_available := public.get_leave_source_remaining(v_source.id, p_effective_date);
    v_take := least(v_remaining, v_available);

    insert into public.leave_balance_ledger (
      balance_account_id, entry_type, units, effective_date, source_entry_id,
      request_group_id, request_day_revision_id, created_by, private_reason, metadata
    ) values (
      p_balance_account_id, p_entry_type, -v_take, p_effective_date, v_source.id,
      p_request_group_id, p_request_day_revision_id, p_created_by,
      public.normalize_leave_private_text(p_private_reason, false), coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_entry_id;

    v_created := array_append(v_created, v_entry_id);
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
  end if;

  return v_created;
end;
$$;

create or replace function public.restore_leave_charge(
  p_negative_entry_id uuid,
  p_entry_type text,
  p_created_by uuid,
  p_private_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_effective_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_account_id uuid;
  v_charge public.leave_balance_ledger%rowtype;
  v_source public.leave_balance_ledger%rowtype;
  v_restoration_id uuid;
  v_already_restored numeric;
  v_units numeric;
begin
  if p_entry_type not in ('cancellation_restoration','attendance_conflict_release','recalculation_release') then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_INVALID';
  end if;

  -- Ledger rows are immutable, so read the account identity first and acquire
  -- the same account lock order used by consume_leave_balance before locking
  -- the charge and source rows.
  select balance_account_id into v_account_id
  from public.leave_balance_ledger
  where id = p_negative_entry_id
    and units < 0
    and entry_type in ('approved_leave_charge','recalculation_charge');

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_ENTRY_NOT_FOUND';
  end if;

  perform 1
  from public.leave_balance_accounts
  where id = v_account_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_BALANCE_ACCOUNT_NOT_FOUND';
  end if;

  select * into strict v_charge
  from public.leave_balance_ledger
  where id = p_negative_entry_id
  for update;

  select * into v_source
  from public.leave_balance_ledger
  where id = v_charge.source_entry_id
    and units > 0
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_LEDGER_SOURCE_NOT_FOUND';
  end if;

  select coalesce(sum(units), 0)
    into v_already_restored
  from public.leave_balance_ledger
  where reversal_of_entry_id = v_charge.id;

  v_units := least(abs(v_charge.units), greatest(0, abs(v_charge.units) - v_already_restored));
  if v_units = 0 then
    return null;
  end if;

  insert into public.leave_balance_ledger (
    balance_account_id, entry_type, units, effective_date, expires_on,
    source_entry_id, reversal_of_entry_id, request_group_id,
    request_day_revision_id, created_by, private_reason, metadata
  ) values (
    v_charge.balance_account_id, p_entry_type, v_units,
    coalesce(p_effective_date, public.company_attendance_date(now())),
    v_source.expires_on, v_source.id,
    v_charge.id, v_charge.request_group_id, v_charge.request_day_revision_id,
    p_created_by, public.normalize_leave_private_text(p_private_reason, false),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_restoration_id;

  return v_restoration_id;
end;
$$;

revoke all on function public.get_or_create_leave_balance_account(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.get_leave_balance(uuid,date) from public, anon, authenticated;
revoke all on function public.get_leave_source_remaining(uuid,date) from public, anon, authenticated;
revoke all on function public.consume_leave_balance(uuid,numeric,text,date,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.restore_leave_charge(uuid,text,uuid,text,jsonb,date) from public, anon, authenticated;

create or replace function public.upsert_employee_leave_year_setting(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_is_excluded boolean,
  p_annual_allocation_override_units numeric,
  p_private_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_private_reason, true);
  v_id uuid;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_employee_id is null or p_leave_type_id is null
     or p_leave_year not between 2000 and 2200
     or (p_annual_allocation_override_units is not null and (
       p_annual_allocation_override_units < 0
       or p_annual_allocation_override_units * 2 <> trunc(p_annual_allocation_override_units * 2)
     )) then
    raise exception using errcode = 'P0001', message = 'LEAVE_SETTING_INVALID';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_EMPLOYEE_NOT_FOUND';
  end if;
  if not exists (select 1 from public.leave_types where id = p_leave_type_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.leave_balance_accounts as account
    join public.leave_balance_ledger as ledger on ledger.balance_account_id = account.id
    where account.employee_id = p_employee_id
      and account.leave_type_id = p_leave_type_id
      and account.leave_year = p_leave_year
      and ledger.entry_type = 'annual_allocation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_ALLOCATION_ALREADY_GENERATED';
  end if;

  insert into public.employee_leave_year_settings (
    employee_id, leave_type_id, leave_year, is_excluded,
    annual_allocation_override_units, created_by, private_reason
  ) values (
    p_employee_id, p_leave_type_id, p_leave_year, p_is_excluded,
    p_annual_allocation_override_units, v_actor, v_reason
  )
  on conflict (employee_id, leave_type_id, leave_year) do update
  set is_excluded = excluded.is_excluded,
      annual_allocation_override_units = excluded.annual_allocation_override_units,
      updated_by = v_actor,
      updated_at = now(),
      private_reason = v_reason
  returning id into v_id;

  perform public.write_leave_audit(
    p_employee_id,
    'leave_balance.setting_changed',
    'leave_allocation',
    v_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type_id', p_leave_type_id,
      'leave_year', p_leave_year,
      'is_excluded', p_is_excluded,
      'has_override', p_annual_allocation_override_units is not null
    )
  );

  return v_id;
end;
$$;
revoke all on function public.upsert_employee_leave_year_setting(uuid,uuid,integer,boolean,numeric,text) from public, anon;
grant execute on function public.upsert_employee_leave_year_setting(uuid,uuid,integer,boolean,numeric,text) to authenticated;

create or replace function public.preview_leave_year_opening(p_leave_year integer)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_version_id uuid,
  leave_type_name text,
  result_type text,
  allocation_units numeric,
  carryover_units numeric,
  carryover_cap_applied boolean,
  exception_code text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
  end if;

  return query
  with eligible as (
    select
      employee.id as employee_id,
      employee.employee_number,
      concat_ws(' ', employee.first_name, employee.last_name) as employee_name,
      stable.id as leave_type_id,
      stable.code as leave_type_code,
      policy.leave_type_version_id,
      policy.name as leave_type_name,
      setting.is_excluded,
      setting.annual_allocation_override_units,
      policy.default_annual_units,
      policy.carryover_enabled,
      policy.carryover_cap_units
    from public.employees as employee
    cross join public.leave_types as stable
    cross join lateral public.resolve_leave_type_version(
      stable.id,
      make_date(p_leave_year, 1, 1)
    ) as policy
    left join public.employee_leave_year_settings as setting
      on setting.employee_id = employee.id
     and setting.leave_type_id = stable.id
     and setting.leave_year = p_leave_year
    where employee.hire_date <= make_date(p_leave_year, 1, 1)
      and employee.archived_at is null
      and employee.employment_status in ('active','probation','on_leave')
      and policy.is_active
      and policy.is_balance_tracked
  ), carry as (
    select
      eligible.employee_id,
      eligible.leave_type_id,
      coalesce(sum(public.get_leave_source_remaining(
        source.id,
        make_date(p_leave_year - 1, 12, 31)
      )), 0)::numeric(10,1) as origin_remaining
    from eligible
    left join public.leave_balance_accounts as account
      on account.employee_id = eligible.employee_id
     and account.leave_type_id = eligible.leave_type_id
     and account.leave_year = p_leave_year - 1
    left join public.leave_balance_ledger as source
      on source.balance_account_id = account.id
     and source.units > 0
     and source.entry_type <> 'carryover'
     and source.entry_type in ('annual_allocation','hr_adjustment_credit')
    group by eligible.employee_id, eligible.leave_type_id
  )
  select
    eligible.employee_id,
    eligible.employee_number,
    eligible.employee_name,
    eligible.leave_type_id,
    eligible.leave_type_code,
    eligible.leave_type_version_id,
    eligible.leave_type_name,
    case
      when coalesce(eligible.is_excluded, false) then 'excluded'
      when eligible.annual_allocation_override_units is not null then 'override'
      else 'default'
    end::text,
    case
      when coalesce(eligible.is_excluded, false) then 0
      else coalesce(eligible.annual_allocation_override_units, eligible.default_annual_units)
    end::numeric,
    case
      when coalesce(eligible.is_excluded, false) or not eligible.carryover_enabled then 0
      when eligible.carryover_cap_units is null then carry.origin_remaining
      else least(carry.origin_remaining, eligible.carryover_cap_units)
    end::numeric,
    eligible.carryover_cap_units is not null
      and carry.origin_remaining > eligible.carryover_cap_units,
    null::text
  from eligible
  join carry
    on carry.employee_id = eligible.employee_id
   and carry.leave_type_id = eligible.leave_type_id
  order by eligible.employee_name, eligible.leave_type_name;
end;
$$;

create or replace function public.generate_leave_year_opening(p_leave_year integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_row record;
  v_account_id uuid;
  v_created_allocations integer := 0;
  v_created_carryovers integer := 0;
  v_existing integer := 0;
  v_key text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('leave-year:' || p_leave_year::text, 0));

  for v_row in select * from public.preview_leave_year_opening(p_leave_year)
  loop
    if v_row.result_type = 'excluded' then
      continue;
    end if;

    v_account_id := public.get_or_create_leave_balance_account(
      v_row.employee_id,
      v_row.leave_type_id,
      p_leave_year
    );

    if v_row.allocation_units > 0 then
      v_key := format('annual:%s:%s:%s', p_leave_year, v_row.employee_id, v_row.leave_type_id);
      insert into public.leave_balance_ledger (
        balance_account_id, entry_type, units, effective_date,
        generation_key, created_by, metadata
      ) values (
        v_account_id, 'annual_allocation', v_row.allocation_units,
        make_date(p_leave_year, 1, 1), v_key, v_actor,
        jsonb_build_object(
          'leave_type_version_id', v_row.leave_type_version_id,
          'allocation_source', v_row.result_type
        )
      ) on conflict (generation_key) do nothing;

      if found then
        v_created_allocations := v_created_allocations + 1;
      else
        v_existing := v_existing + 1;
      end if;
    end if;

    if v_row.carryover_units > 0 then
      v_key := format('carryover:%s:%s:%s', p_leave_year, v_row.employee_id, v_row.leave_type_id);
      insert into public.leave_balance_ledger (
        balance_account_id, entry_type, units, effective_date, expires_on,
        generation_key, created_by, metadata
      ) values (
        v_account_id, 'carryover', v_row.carryover_units,
        make_date(p_leave_year, 1, 1), make_date(p_leave_year, 12, 31),
        v_key, v_actor,
        jsonb_build_object(
          'leave_type_version_id', v_row.leave_type_version_id,
          'origin_year', p_leave_year - 1,
          'cap_applied', v_row.carryover_cap_applied
        )
      ) on conflict (generation_key) do nothing;

      if found then
        v_created_carryovers := v_created_carryovers + 1;
      else
        v_existing := v_existing + 1;
      end if;
    end if;
  end loop;

  perform public.write_leave_audit(
    null,
    'leave_balance.year_opening_generated',
    'leave_allocation',
    null,
    jsonb_build_object(
      'leave_year', p_leave_year,
      'created_allocations', v_created_allocations,
      'created_carryovers', v_created_carryovers,
      'already_generated', v_existing
    )
  );

  return jsonb_build_object(
    'created_allocations', v_created_allocations,
    'created_carryovers', v_created_carryovers,
    'already_generated', v_existing
  );
exception
  when serialization_failure or deadlock_detected then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
end;
$$;

create or replace function public.generate_individual_leave_allocation(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_effective_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_setting public.employee_leave_year_settings%rowtype;
  v_employee public.employees%rowtype;
  v_policy record;
  v_account_id uuid;
  v_entry_id uuid;
  v_key text;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200
     or p_effective_date is null
     or extract(year from p_effective_date)::integer <> p_leave_year then
    raise exception using errcode = 'P0001', message = 'LEAVE_GENERATION_CONFLICT';
  end if;

  select * into v_employee
  from public.employees
  where id = p_employee_id
  for update;
  if not found
     or v_employee.archived_at is not null
     or v_employee.employment_status not in ('active','probation','on_leave')
     or v_employee.hire_date <= make_date(p_leave_year, 1, 1)
     or v_employee.hire_date > p_effective_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  select * into v_setting
  from public.employee_leave_year_settings
  where employee_id = p_employee_id
    and leave_type_id = p_leave_type_id
    and leave_year = p_leave_year
  for update;
  if not found
     or v_setting.is_excluded
     or v_setting.annual_allocation_override_units is null
     or v_setting.annual_allocation_override_units <= 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_OVERRIDE_REQUIRED';
  end if;

  select * into v_policy
  from public.resolve_leave_type_version(p_leave_type_id, p_effective_date);
  if v_policy.leave_type_version_id is null or not v_policy.is_active or not v_policy.is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  v_account_id := public.get_or_create_leave_balance_account(
    p_employee_id,
    p_leave_type_id,
    p_leave_year
  );
  v_key := format('individual:%s:%s:%s', p_leave_year, p_employee_id, p_leave_type_id);

  insert into public.leave_balance_ledger (
    balance_account_id, entry_type, units, effective_date,
    generation_key, created_by, metadata
  ) values (
    v_account_id, 'annual_allocation', v_setting.annual_allocation_override_units,
    p_effective_date, v_key, v_actor,
    jsonb_build_object(
      'leave_type_version_id', v_policy.leave_type_version_id,
      'allocation_source', 'manual_override'
    )
  ) on conflict (generation_key) do nothing
  returning id into v_entry_id;

  if v_entry_id is null then
    select id into v_entry_id
    from public.leave_balance_ledger
    where generation_key = v_key;
  end if;

  perform public.write_leave_audit(
    p_employee_id,
    'leave_balance.individual_allocation_generated',
    'leave_allocation',
    v_entry_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type_id', p_leave_type_id,
      'leave_year', p_leave_year,
      'effective_date', p_effective_date,
      'units', v_setting.annual_allocation_override_units
    )
  );

  return v_entry_id;
end;
$$;

create or replace function public.create_leave_balance_adjustment(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_units numeric,
  p_reason text
)
returns uuid[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_reason text := public.normalize_leave_private_text(p_reason, false);
  v_account_id uuid;
  v_entry_id uuid;
  v_entries uuid[];
  v_policy record;
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_ADJUSTMENT_REASON_REQUIRED';
  end if;
  if p_leave_year not between 2000 and 2200
     or p_units is null
     or p_units = 0
     or p_units * 2 <> trunc(p_units * 2) then
    raise exception using errcode = 'P0001', message = 'LEAVE_UNITS_INVALID';
  end if;

  select * into v_policy
  from public.resolve_leave_type_version(p_leave_type_id, make_date(p_leave_year, 1, 1));
  if v_policy.leave_type_version_id is null or not v_policy.is_balance_tracked then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  v_account_id := public.get_or_create_leave_balance_account(
    p_employee_id,
    p_leave_type_id,
    p_leave_year
  );

  if p_units > 0 then
    insert into public.leave_balance_ledger (
      balance_account_id, entry_type, units, effective_date,
      created_by, private_reason, metadata
    ) values (
      v_account_id, 'hr_adjustment_credit', p_units,
      public.company_attendance_date(now()), v_actor, v_reason,
      jsonb_build_object('leave_year', p_leave_year)
    ) returning id into v_entry_id;
    v_entries := array[v_entry_id];
  else
    v_entries := public.consume_leave_balance(
      v_account_id,
      abs(p_units),
      'hr_adjustment_debit',
      public.company_attendance_date(now()),
      null,
      null,
      v_actor,
      v_reason,
      jsonb_build_object('leave_year', p_leave_year)
    );
  end if;

  perform public.write_leave_audit(
    p_employee_id,
    'leave_balance.adjusted',
    'leave_balance',
    v_account_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type_id', p_leave_type_id,
      'leave_year', p_leave_year,
      'units', p_units
    )
  );

  return v_entries;
end;
$$;

do $$
begin
  create type public.leave_balance_projection_row as (
    employee_id uuid,
    leave_type_id uuid,
    leave_type_code text,
    leave_type_name text,
    leave_year integer,
    is_paid boolean,
    is_balance_tracked boolean,
    allocated_units numeric,
    carryover_units numeric,
    adjustment_units numeric,
    approved_used_units numeric,
    pending_reserved_units numeric,
    available_units numeric,
    expiring_units numeric,
    expires_on date
  );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.get_leave_balance_projection(
  p_employee_id uuid,
  p_leave_year integer
)
returns setof public.leave_balance_projection_row
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with eligible as (
    select
      employee.id as employee_id,
      stable.id as leave_type_id,
      stable.code as leave_type_code,
      policy.name as leave_type_name,
      policy.is_paid,
      policy.is_balance_tracked,
      account.id as balance_account_id
    from public.employees as employee
    cross join public.leave_types as stable
    cross join lateral public.resolve_leave_type_version(
      stable.id,
      make_date(p_leave_year, 1, 1)
    ) as policy
    left join public.employee_leave_year_settings as setting
      on setting.employee_id = employee.id
     and setting.leave_type_id = stable.id
     and setting.leave_year = p_leave_year
    left join public.leave_balance_accounts as account
      on account.employee_id = employee.id
     and account.leave_type_id = stable.id
     and account.leave_year = p_leave_year
    where (p_employee_id is null or employee.id = p_employee_id)
      and policy.is_active
      and not coalesce(setting.is_excluded, false)
  ), aggregates as (
    select
      eligible.*,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'annual_allocation'), 0)::numeric(10,1) as allocated_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'carryover'), 0)::numeric(10,1) as carryover_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type in ('hr_adjustment_credit','hr_adjustment_debit')), 0)::numeric(10,1) as adjustment_units,
      greatest(0, -coalesce(sum(ledger.units) filter (
        where ledger.entry_type in (
          'approved_leave_charge','recalculation_charge','cancellation_restoration',
          'attendance_conflict_release','recalculation_release'
        )
      ), 0))::numeric(10,1) as approved_used_units
    from eligible
    left join public.leave_balance_ledger as ledger
      on ledger.balance_account_id = eligible.balance_account_id
    group by
      eligible.employee_id,
      eligible.leave_type_id,
      eligible.leave_type_code,
      eligible.leave_type_name,
      eligible.is_paid,
      eligible.is_balance_tracked,
      eligible.balance_account_id
  )
  select (
    aggregates.employee_id,
    aggregates.leave_type_id,
    aggregates.leave_type_code,
    aggregates.leave_type_name,
    p_leave_year,
    aggregates.is_paid,
    aggregates.is_balance_tracked,
    aggregates.allocated_units,
    aggregates.carryover_units,
    aggregates.adjustment_units,
    aggregates.approved_used_units,
    coalesce(reservation.reserved_units, 0)::numeric(10,1),
    case
      when aggregates.is_balance_tracked then
        greatest(
          0,
          coalesce(available.available_units, 0) - coalesce(reservation.reserved_units, 0)
        )::numeric(10,1)
      else null
    end,
    coalesce(expiring.expiring_units, 0)::numeric(10,1),
    expiring.expires_on
  )::public.leave_balance_projection_row
  from aggregates
  left join public.leave_pending_reservations as reservation
    on reservation.employee_id = aggregates.employee_id
   and reservation.leave_type_id = aggregates.leave_type_id
   and reservation.leave_year = p_leave_year
  left join lateral (
    select coalesce(sum(public.get_leave_source_remaining(
      source.id,
      public.company_attendance_date(now())
    )), 0)::numeric(10,1) as available_units
    from public.leave_balance_ledger as source
    where source.balance_account_id = aggregates.balance_account_id
      and source.units > 0
      and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
  ) as available on true
  left join lateral (
    select
      coalesce(sum(public.get_leave_source_remaining(
        source.id,
        public.company_attendance_date(now())
      )), 0)::numeric(10,1) as expiring_units,
      min(source.expires_on) filter (
        where public.get_leave_source_remaining(
          source.id,
          public.company_attendance_date(now())
        ) > 0
      ) as expires_on
    from public.leave_balance_ledger as source
    where source.balance_account_id = aggregates.balance_account_id
      and source.units > 0
      and source.entry_type in ('annual_allocation','carryover','hr_adjustment_credit')
      and source.expires_on is not null
      and source.expires_on >= public.company_attendance_date(now())
  ) as expiring on true
  order by aggregates.leave_type_name, aggregates.leave_type_code;
$$;

create or replace function public.get_my_leave_balances(p_leave_year integer)
returns table (
  employee_id uuid,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_name text,
  leave_year integer,
  is_paid boolean,
  is_balance_tracked boolean,
  allocated_units numeric,
  carryover_units numeric,
  adjustment_units numeric,
  approved_used_units numeric,
  pending_reserved_units numeric,
  available_units numeric,
  expiring_units numeric,
  expires_on date
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid := public.current_employee_id();
begin
  if v_employee_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_YEAR_INVALID';
  end if;
  return query
  select projection.*
  from public.get_leave_balance_projection(v_employee_id, p_leave_year) as projection;
end;
$$;

create or replace function public.get_admin_leave_balances(
  p_leave_year integer,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null
)
returns setof public.leave_balance_projection_row
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_YEAR_INVALID';
  end if;
  return query
  select projection.*
  from public.get_leave_balance_projection(p_employee_id, p_leave_year) as projection
  where p_leave_type_id is null or projection.leave_type_id = p_leave_type_id;
end;
$$;

revoke all on type public.leave_balance_projection_row from public, anon;
grant usage on type public.leave_balance_projection_row to authenticated;

revoke all on function public.get_leave_balance_projection(uuid,integer) from public, anon, authenticated;
revoke all on function public.preview_leave_year_opening(integer) from public, anon;
revoke all on function public.generate_leave_year_opening(integer) from public, anon;
revoke all on function public.generate_individual_leave_allocation(uuid,uuid,integer,date) from public, anon;
revoke all on function public.create_leave_balance_adjustment(uuid,uuid,integer,numeric,text) from public, anon;
revoke all on function public.get_my_leave_balances(integer) from public, anon;
revoke all on function public.get_admin_leave_balances(integer,uuid,uuid) from public, anon;

grant execute on function public.preview_leave_year_opening(integer) to authenticated;
grant execute on function public.generate_leave_year_opening(integer) to authenticated;
grant execute on function public.generate_individual_leave_allocation(uuid,uuid,integer,date) to authenticated;
grant execute on function public.create_leave_balance_adjustment(uuid,uuid,integer,numeric,text) to authenticated;
grant execute on function public.get_my_leave_balances(integer) to authenticated;
grant execute on function public.get_admin_leave_balances(integer,uuid,uuid) to authenticated;

-- Phase 6 Task 5: draft requests, advisory previews, and safe request projections.

-- Draft request groups are the sole exception to immutable action deletion.
-- This permits explicit draft cleanup while preserving all submitted history.
drop trigger if exists prevent_leave_request_action_mutation
on public.leave_request_actions;

create or replace function public.prevent_submitted_leave_action_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1
    from public.leave_request_groups as request_group
    where request_group.id = old.request_group_id
      and request_group.current_status = 'draft'
  ) then
    return old;
  end if;

  raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
end;
$$;

create trigger prevent_submitted_leave_action_mutation
before update or delete on public.leave_request_actions
for each row execute function public.prevent_submitted_leave_action_mutation();

revoke all on function public.prevent_submitted_leave_action_mutation()
from public, anon, authenticated;

create or replace function public.prevent_submitted_leave_revision_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.frozen_at is not null or old.submitted_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  if tg_op = 'DELETE' and exists (
    select 1
    from public.leave_request_groups as request_group
    where request_group.id = old.request_group_id
      and request_group.current_status <> 'draft'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_IMMUTABLE_RECORD';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger prevent_submitted_leave_revision_mutation
before update or delete on public.leave_request_revisions
for each row execute function public.prevent_submitted_leave_revision_mutation();

revoke all on function public.prevent_submitted_leave_revision_mutation()
from public, anon, authenticated;

create or replace function public.resolve_leave_day_context(
  p_employee_id uuid,
  p_leave_type_version_id uuid,
  p_leave_date date,
  p_duration_mode text
)
returns table (
  schedule_assignment_id uuid,
  schedule_version_id uuid,
  schedule_name text,
  holiday_version_id uuid,
  is_scheduled_workday boolean,
  is_rest_day boolean,
  is_holiday boolean,
  is_chargeable boolean,
  chargeable_units numeric,
  leave_classification text,
  half_day_boundary_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_policy public.leave_type_versions%rowtype;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_schedule public.work_schedule_versions%rowtype;
  v_schedule_name text;
  v_holiday_version_id uuid;
  v_weekday text;
  v_workday boolean := false;
  scheduled_start_at timestamptz;
  scheduled_end_at timestamptz;
  v_boundary timestamptz;
begin
  if p_leave_date is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_DATE_RANGE_INVALID';
  end if;
  if p_duration_mode not in ('full_day', 'first_half', 'second_half') then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;

  select * into v_policy
  from public.leave_type_versions
  where id = p_leave_type_version_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date <= p_leave_date
    and (effective_end_date is null or effective_end_date >= p_leave_date)
  order by effective_start_date desc, id desc
  limit 1;

  if found then
    select version.* into v_schedule
    from public.work_schedule_versions as version
    where version.schedule_template_id = v_assignment.schedule_template_id
      and version.effective_date <= p_leave_date
    order by version.effective_date desc, version.id desc
    limit 1;

    if found then
      select template.name into v_schedule_name
      from public.work_schedule_templates as template
      where template.id = v_schedule.schedule_template_id;
    end if;
  end if;

  select holiday.holiday_version_id into v_holiday_version_id
  from public.resolve_active_holiday(p_leave_date) as holiday;

  v_weekday := lower(trim(to_char(p_leave_date::timestamp, 'FMDay')));
  v_workday := v_schedule.id is not null and v_weekday = any(v_schedule.working_days);

  if v_schedule.id is not null and v_workday then
    scheduled_start_at := (p_leave_date + v_schedule.start_time) at time zone 'Asia/Manila';
    scheduled_end_at := (p_leave_date + v_schedule.end_time) at time zone 'Asia/Manila';
    -- The schedule model stores break duration but no break start. Preserve a
    -- deterministic midpoint until a future schedule version adds that field.
    v_boundary := scheduled_start_at + (scheduled_end_at - scheduled_start_at) / 2;
  end if;

  return query
  select
    v_assignment.id,
    v_schedule.id,
    v_schedule_name,
    v_holiday_version_id,
    v_workday,
    v_schedule.id is not null and not v_workday,
    v_holiday_version_id is not null,
    v_workday and v_holiday_version_id is null,
    case
      when not v_workday or v_holiday_version_id is not null then 0::numeric
      when p_duration_mode = 'full_day' then 1::numeric
      else 0.5::numeric
    end,
    case
      when v_holiday_version_id is not null then 'non_chargeable_holiday'
      when v_schedule.id is null then 'non_chargeable_no_schedule'
      when not v_workday then 'non_chargeable_rest_day'
      when v_policy.is_paid then 'paid_leave'
      else 'unpaid_leave'
    end,
    case when p_duration_mode = 'full_day' then null else v_boundary end;
end;
$$;

revoke all on function public.resolve_leave_day_context(uuid,uuid,date,text)
from public, anon, authenticated;

create or replace function public.preview_leave_request(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_exclude_request_group_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_employee_id uuid := public.current_employee_id();
  v_is_hr boolean := public.is_hr_admin();
  v_policy record;
  v_day record;
  v_days jsonb := '[]'::jsonb;
  v_requested numeric;
  v_chargeable numeric := 0;
  v_account_id uuid;
  v_ledger_balance numeric := null;
  v_pending numeric := 0;
  v_company_date date := public.company_attendance_date(now());
begin
  if auth.uid() is null
     or (not v_is_hr and v_actor_employee_id <> p_employee_id) then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  if not exists (
    select 1
    from public.employees as employee
    where employee.id = p_employee_id
      and employee.archived_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_DATE_RANGE_INVALID';
  end if;
  if extract(year from p_start_date) <> extract(year from p_end_date) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CROSSES_YEAR';
  end if;
  if p_duration_mode not in ('full_day', 'first_half', 'second_half')
     or (p_duration_mode <> 'full_day' and p_start_date <> p_end_date) then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;
  if not v_is_hr and (
    p_start_date < v_company_date - 30
    or p_end_date > v_company_date + 365
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_OUTSIDE_DATE_WINDOW';
  end if;

  select * into v_policy
  from public.resolve_leave_type_version(p_leave_type_id, p_start_date);
  if v_policy.leave_type_version_id is null or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  if exists (
    select 1
    from public.employee_leave_year_settings as setting
    where setting.employee_id = p_employee_id
      and setting.leave_type_id = p_leave_type_id
      and setting.leave_year = extract(year from p_start_date)::integer
      and setting.is_excluded
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  for v_day in
    select series.leave_date::date as leave_date, context.*
    from generate_series(p_start_date, p_end_date, interval '1 day') as series(leave_date)
    cross join lateral public.resolve_leave_day_context(
      p_employee_id,
      v_policy.leave_type_version_id,
      series.leave_date::date,
      p_duration_mode
    ) as context
  loop
    v_chargeable := v_chargeable + v_day.chargeable_units;
    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'leave_date', v_day.leave_date,
      'schedule_assignment_id', v_day.schedule_assignment_id,
      'schedule_version_id', v_day.schedule_version_id,
      'schedule_name', v_day.schedule_name,
      'holiday_version_id', v_day.holiday_version_id,
      'is_scheduled_workday', v_day.is_scheduled_workday,
      'is_rest_day', v_day.is_rest_day,
      'is_holiday', v_day.is_holiday,
      'is_chargeable', v_day.is_chargeable,
      'chargeable_units', v_day.chargeable_units,
      'leave_classification', v_day.leave_classification,
      'half_day_boundary_at', v_day.half_day_boundary_at
    ));
  end loop;

  v_requested := ((p_end_date - p_start_date) + 1)
    * case when p_duration_mode = 'full_day' then 1 else 0.5 end;

  if v_policy.is_balance_tracked then
    select account.id into v_account_id
    from public.leave_balance_accounts as account
    where account.employee_id = p_employee_id
      and account.leave_type_id = p_leave_type_id
      and account.leave_year = extract(year from p_start_date)::integer;

    if v_account_id is not null then
      v_ledger_balance := public.get_leave_balance(v_account_id, p_start_date);
    else
      v_ledger_balance := 0;
    end if;

    select coalesce(sum(day_revision.chargeable_units), 0)
      into v_pending
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    join public.leave_type_versions as version
      on version.id = request_revision.leave_type_version_id
    join public.leave_request_days as request_day
      on request_day.request_revision_id = request_revision.id
    join public.leave_request_day_revisions as day_revision
      on day_revision.id = request_day.active_revision_id
    where request_group.employee_id = p_employee_id
      and request_group.current_status = 'pending'
      and request_group.id is distinct from p_exclude_request_group_id
      and version.leave_type_id = p_leave_type_id
      and request_revision.leave_year = extract(year from p_start_date)::integer
      and day_revision.is_chargeable;
  end if;

  return jsonb_build_object(
    'policy_version', to_jsonb(v_policy),
    'days', v_days,
    'requested_units', v_requested,
    'chargeable_units', v_chargeable,
    'ledger_balance', v_ledger_balance,
    'pending_reserved_units', v_pending,
    'available_units', case
      when v_ledger_balance is null then null
      else greatest(0, v_ledger_balance - v_pending)
    end,
    'requires_document', v_policy.document_required
      and (
        v_policy.document_required_min_units is null
        or v_chargeable >= v_policy.document_required_min_units
      )
  );
end;
$$;

revoke all on function public.preview_leave_request(uuid,uuid,date,date,text,uuid)
from public, anon;
grant execute on function public.preview_leave_request(uuid,uuid,date,date,text,uuid)
to authenticated;

create or replace function public.create_leave_draft(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_employee_note text default null,
  p_replaces_request_group_id uuid default null,
  p_created_source text default 'employee'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_actor_employee_id uuid := public.current_employee_id();
  v_preview jsonb;
  v_policy_version_id uuid;
  v_requested_units numeric;
  v_request_group_id uuid;
  v_request_revision_id uuid;
  v_note text := public.normalize_leave_private_text(p_employee_note, false);
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_created_source not in ('employee', 'hr') then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_created_source = 'employee' and v_actor_employee_id <> p_employee_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_created_source = 'hr' and not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if not exists (
    select 1
    from public.employees as employee
    where employee.id = p_employee_id
      and employee.archived_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
  if p_replaces_request_group_id is not null and not exists (
    select 1
    from public.leave_request_groups as replaced
    where replaced.id = p_replaces_request_group_id
      and replaced.employee_id = p_employee_id
      and replaced.current_status in ('withdrawn', 'cancelled')
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;

  v_preview := public.preview_leave_request(
    p_employee_id,
    p_leave_type_id,
    p_start_date,
    p_end_date,
    p_duration_mode,
    null
  );
  v_policy_version_id := (v_preview #>> '{policy_version,leave_type_version_id}')::uuid;
  v_requested_units := (v_preview ->> 'requested_units')::numeric;

  insert into public.leave_request_groups (
    employee_id,
    created_by,
    created_source,
    current_status,
    replaces_request_group_id
  ) values (
    p_employee_id,
    v_profile_id,
    p_created_source,
    'draft',
    p_replaces_request_group_id
  ) returning id into v_request_group_id;

  insert into public.leave_request_revisions (
    request_group_id,
    revision_number,
    leave_type_version_id,
    leave_year,
    start_date,
    end_date,
    duration_mode,
    employee_note,
    requested_units,
    submitted_chargeable_units,
    created_by
  ) values (
    v_request_group_id,
    1,
    v_policy_version_id,
    extract(year from p_start_date)::integer,
    p_start_date,
    p_end_date,
    p_duration_mode,
    v_note,
    v_requested_units,
    0,
    v_profile_id
  ) returning id into v_request_revision_id;

  update public.leave_request_groups
  set active_revision_id = v_request_revision_id,
      updated_at = now()
  where id = v_request_group_id;

  insert into public.leave_request_actions (
    request_group_id,
    request_revision_id,
    action_type,
    from_status,
    to_status,
    actor_profile_id,
    actor_role
  ) values (
    v_request_group_id,
    v_request_revision_id,
    'created',
    null,
    'draft',
    v_profile_id,
    case when p_created_source = 'hr' then 'hr_admin' else 'employee' end
  );

  perform public.write_leave_audit(
    p_employee_id,
    'leave_request_draft_created',
    'leave_request_group',
    v_request_group_id,
    jsonb_build_object(
      'request_revision_id', v_request_revision_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'duration_mode', p_duration_mode,
      'created_source', p_created_source
    )
  );

  return v_request_group_id;
end;
$$;

create or replace function public.update_leave_draft(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_leave_type_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_mode text,
  p_employee_note text default null,
  p_replaces_request_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_group public.leave_request_groups%rowtype;
  v_preview jsonb;
  v_policy_version_id uuid;
  v_requested_units numeric;
  v_note text := public.normalize_leave_private_text(p_employee_note, false);
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if v_group.current_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;
  if v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_replaces_request_group_id = p_request_group_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if p_replaces_request_group_id is not null and not exists (
    select 1
    from public.leave_request_groups as replaced
    where replaced.id = p_replaces_request_group_id
      and replaced.employee_id = v_group.employee_id
      and replaced.current_status in ('withdrawn', 'cancelled')
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;

  v_preview := public.preview_leave_request(
    v_group.employee_id,
    p_leave_type_id,
    p_start_date,
    p_end_date,
    p_duration_mode,
    p_request_group_id
  );
  v_policy_version_id := (v_preview #>> '{policy_version,leave_type_version_id}')::uuid;
  v_requested_units := (v_preview ->> 'requested_units')::numeric;

  update public.leave_request_revisions
  set leave_type_version_id = v_policy_version_id,
      leave_year = extract(year from p_start_date)::integer,
      start_date = p_start_date,
      end_date = p_end_date,
      duration_mode = p_duration_mode,
      employee_note = v_note,
      requested_units = v_requested_units,
      submitted_chargeable_units = 0,
      updated_at = now()
  where id = v_group.active_revision_id;

  update public.leave_request_groups
  set replaces_request_group_id = p_replaces_request_group_id,
      updated_at = now()
  where id = v_group.id;

  return v_group.active_revision_id;
end;
$$;

create or replace function public.delete_leave_draft(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_group public.leave_request_groups%rowtype;
  v_storage_paths text[];
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if v_group.current_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;
  if v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select coalesce(array_agg(attachment.storage_path order by attachment.id), '{}'::text[])
    into v_storage_paths
  from public.leave_request_attachments as attachment
  where attachment.request_group_id = v_group.id;

  delete from public.leave_request_actions
  where request_group_id = v_group.id;

  -- Break the deferred active-revision cycle before cascading the draft delete.
  update public.leave_request_groups
  set active_revision_id = null
  where id = v_group.id;

  delete from public.leave_request_groups
  where id = v_group.id;

  return v_storage_paths;
end;
$$;

revoke all on function public.create_leave_draft(uuid,uuid,date,date,text,text,uuid,text)
from public, anon;
revoke all on function public.update_leave_draft(uuid,uuid,uuid,date,date,text,text,uuid)
from public, anon;
revoke all on function public.delete_leave_draft(uuid,uuid)
from public, anon;

grant execute on function public.create_leave_draft(uuid,uuid,date,date,text,text,uuid,text)
to authenticated;
grant execute on function public.update_leave_draft(uuid,uuid,uuid,date,date,text,text,uuid)
to authenticated;
grant execute on function public.delete_leave_draft(uuid,uuid)
to authenticated;

create or replace function public.get_my_leave_requests(
  p_leave_year integer,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  request_group_id uuid,
  active_revision_id uuid,
  employee_id uuid,
  employee_name text,
  employee_number text,
  department_name text,
  leave_type_name text,
  is_paid boolean,
  is_balance_tracked boolean,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  replaces_request_group_id uuid,
  superseded_by_request_group_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if auth.uid() is null or v_employee_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_YEAR_INVALID';
  end if;
  if p_status is not null and p_status not in (
    'draft','pending','approved','rejected','withdrawn','cancelled','superseded'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;

  return query
  with rows as (
    select
      request_group.id as request_group_id,
      request_group.active_revision_id,
      request_group.employee_id,
      trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
      employee.employee_number,
      department.name as department_name,
      version.name as leave_type_name,
      version.is_paid,
      version.is_balance_tracked,
      request_revision.start_date,
      request_revision.end_date,
      request_revision.duration_mode,
      request_group.current_status as status,
      request_revision.requested_units,
      coalesce(day_totals.chargeable_units, 0)::numeric(10,1) as chargeable_units,
      request_revision.submitted_at,
      review.reviewed_at,
      request_group.replaces_request_group_id,
      request_group.superseded_by_request_group_id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    join public.leave_type_versions as version
      on version.id = request_revision.leave_type_version_id
    join public.employees as employee
      on employee.id = request_group.employee_id
    left join public.departments as department
      on department.id = employee.department_id
    left join lateral (
      select sum(day_revision.chargeable_units)::numeric(10,1) as chargeable_units
      from public.leave_request_days as request_day
      join public.leave_request_day_revisions as day_revision
        on day_revision.id = request_day.active_revision_id
      where request_day.request_revision_id = request_revision.id
    ) as day_totals on true
    left join lateral (
      select action.created_at as reviewed_at
      from public.leave_request_actions as action
      where action.request_group_id = request_group.id
        and action.action_type in ('approved','rejected','cancelled')
      order by action.created_at desc, action.id desc
      limit 1
    ) as review on true
    where request_group.employee_id = v_employee_id
      and request_revision.leave_year = p_leave_year
      and (p_status is null or request_group.current_status = p_status)
  )
  select
    rows.*,
    count(*) over() as total_count
  from rows
  order by rows.start_date desc, rows.request_group_id desc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.get_admin_leave_requests(
  p_leave_year integer,
  p_status text default null,
  p_employee_id uuid default null,
  p_department_id uuid default null,
  p_leave_type_id uuid default null,
  p_start_date date default null,
  p_end_date date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  request_group_id uuid,
  active_revision_id uuid,
  employee_id uuid,
  employee_name text,
  employee_number text,
  department_name text,
  leave_type_name text,
  is_paid boolean,
  is_balance_tracked boolean,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  replaces_request_group_id uuid,
  superseded_by_request_group_id uuid,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'LEAVE_YEAR_INVALID';
  end if;
  if p_status is not null and p_status not in (
    'draft','pending','approved','rejected','withdrawn','cancelled','superseded'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_DATE_RANGE_INVALID';
  end if;

  return query
  with rows as (
    select
      request_group.id as request_group_id,
      request_group.active_revision_id,
      request_group.employee_id,
      trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
      employee.employee_number,
      department.name as department_name,
      version.name as leave_type_name,
      version.is_paid,
      version.is_balance_tracked,
      request_revision.start_date,
      request_revision.end_date,
      request_revision.duration_mode,
      request_group.current_status as status,
      request_revision.requested_units,
      coalesce(day_totals.chargeable_units, 0)::numeric(10,1) as chargeable_units,
      request_revision.submitted_at,
      review.reviewed_at,
      request_group.replaces_request_group_id,
      request_group.superseded_by_request_group_id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    join public.leave_type_versions as version
      on version.id = request_revision.leave_type_version_id
    join public.employees as employee
      on employee.id = request_group.employee_id
    left join public.departments as department
      on department.id = employee.department_id
    left join lateral (
      select sum(day_revision.chargeable_units)::numeric(10,1) as chargeable_units
      from public.leave_request_days as request_day
      join public.leave_request_day_revisions as day_revision
        on day_revision.id = request_day.active_revision_id
      where request_day.request_revision_id = request_revision.id
    ) as day_totals on true
    left join lateral (
      select action.created_at as reviewed_at
      from public.leave_request_actions as action
      where action.request_group_id = request_group.id
        and action.action_type in ('approved','rejected','cancelled')
      order by action.created_at desc, action.id desc
      limit 1
    ) as review on true
    where request_revision.leave_year = p_leave_year
      and (p_status is null or request_group.current_status = p_status)
      and (p_employee_id is null or request_group.employee_id = p_employee_id)
      and (p_department_id is null or employee.department_id = p_department_id)
      and (p_leave_type_id is null or version.leave_type_id = p_leave_type_id)
      and (p_start_date is null or request_revision.end_date >= p_start_date)
      and (p_end_date is null or request_revision.start_date <= p_end_date)
  )
  select
    rows.*,
    count(*) over() as total_count
  from rows
  order by rows.start_date desc, rows.request_group_id desc
  limit v_page_size
  offset (v_page - 1) * v_page_size;
end;
$$;

create or replace function public.get_leave_request_detail(
  p_request_group_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_version public.leave_type_versions%rowtype;
  v_employee public.employees%rowtype;
  v_department_name text;
  v_reviewed_at timestamptz;
  v_days jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_attachments jsonb := '[]'::jsonb;
  v_balance jsonb := null;
  v_other_pending numeric := 0;
  v_chargeable numeric := 0;
  v_fingerprint text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into strict v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id;
  select * into strict v_version
  from public.leave_type_versions
  where id = v_revision.leave_type_version_id;
  select * into strict v_employee
  from public.employees
  where id = v_group.employee_id;
  select department.name into v_department_name
  from public.departments as department
  where department.id = v_employee.department_id;

  select action.created_at into v_reviewed_at
  from public.leave_request_actions as action
  where action.request_group_id = v_group.id
    and action.action_type in ('approved','rejected','cancelled')
  order by action.created_at desc, action.id desc
  limit 1;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'request_day_id', request_day.id,
      'active_day_revision_id', request_day.active_revision_id,
      'leave_date', request_day.leave_date,
      'schedule_name', schedule_template.name,
      'leave_classification', day_revision.leave_classification,
      'chargeable_units', day_revision.chargeable_units,
      'is_holiday', day_revision.is_holiday,
      'is_rest_day', day_revision.is_rest_day,
      'conflict_state', day_revision.conflict_state,
      'half_day_boundary_at', day_revision.half_day_boundary_at
    ) order by request_day.leave_date), '[]'::jsonb),
    coalesce(sum(day_revision.chargeable_units), 0)::numeric(10,1),
    encode(digest(coalesce(string_agg(
      request_day.active_revision_id::text || ':' || day_revision.chargeable_units::text,
      '|' order by request_day.leave_date
    ), ''), 'sha256'), 'hex')
  into v_days, v_chargeable, v_fingerprint
  from public.leave_request_days as request_day
  join public.leave_request_day_revisions as day_revision
    on day_revision.id = request_day.active_revision_id
  left join public.work_schedule_versions as schedule_version
    on schedule_version.id = day_revision.schedule_version_id
  left join public.work_schedule_templates as schedule_template
    on schedule_template.id = schedule_version.schedule_template_id
  where request_day.request_revision_id = v_revision.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', action.id,
    'action_type', action.action_type,
    'from_status', action.from_status,
    'to_status', action.to_status,
    'actor_name', coalesce(profile.display_name, trim(concat_ws(' ', profile.first_name, profile.last_name))),
    'created_at', action.created_at,
    'private_text', coalesce(action.action_reason, action.review_note)
  ) order by action.created_at, action.id), '[]'::jsonb)
  into v_actions
  from public.leave_request_actions as action
  left join public.profiles as profile
    on profile.id = action.actor_profile_id
  where action.request_group_id = v_group.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', attachment.id,
    'request_group_id', attachment.request_group_id,
    'request_revision_id', attachment.request_revision_id,
    'original_filename', attachment.original_filename,
    'mime_type', attachment.mime_type,
    'size_bytes', attachment.size_bytes,
    'uploaded_at', attachment.uploaded_at,
    'frozen_at', attachment.frozen_at
  ) order by attachment.uploaded_at, attachment.id), '[]'::jsonb)
  into v_attachments
  from public.leave_request_attachments as attachment
  where attachment.request_group_id = v_group.id;

  select to_jsonb(projection)
    into v_balance
  from public.get_leave_balance_projection(v_group.employee_id, v_revision.leave_year) as projection
  where projection.leave_type_id = v_version.leave_type_id
  limit 1;

  select coalesce(sum(day_revision.chargeable_units), 0)::numeric(10,1)
    into v_other_pending
  from public.leave_request_groups as other_group
  join public.leave_request_revisions as other_revision
    on other_revision.id = other_group.active_revision_id
  join public.leave_type_versions as other_version
    on other_version.id = other_revision.leave_type_version_id
  join public.leave_request_days as request_day
    on request_day.request_revision_id = other_revision.id
  join public.leave_request_day_revisions as day_revision
    on day_revision.id = request_day.active_revision_id
  where other_group.employee_id = v_group.employee_id
    and other_group.id <> v_group.id
    and other_group.current_status = 'pending'
    and other_version.leave_type_id = v_version.leave_type_id
    and other_revision.leave_year = v_revision.leave_year
    and day_revision.is_chargeable;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'request_group_id', v_group.id,
      'active_revision_id', v_revision.id,
      'employee_id', v_employee.id,
      'employee_name', trim(concat_ws(' ', v_employee.first_name, v_employee.last_name)),
      'employee_number', v_employee.employee_number,
      'department_name', v_department_name,
      'leave_type_id', v_version.leave_type_id,
      'leave_type_version_id', v_version.id,
      'leave_type_name', v_version.name,
      'is_paid', v_version.is_paid,
      'is_balance_tracked', v_version.is_balance_tracked,
      'leave_year', v_revision.leave_year,
      'start_date', v_revision.start_date,
      'end_date', v_revision.end_date,
      'duration_mode', v_revision.duration_mode,
      'status', v_group.current_status,
      'employee_note', v_revision.employee_note,
      'requested_units', v_revision.requested_units,
      'submitted_at', v_revision.submitted_at,
      'reviewed_at', v_reviewed_at,
      'replaces_request_group_id', v_group.replaces_request_group_id,
      'superseded_by_request_group_id', v_group.superseded_by_request_group_id
    ),
    'days', v_days,
    'actions', v_actions,
    'attachments', v_attachments,
    'balance', v_balance,
    'other_pending_reserved_units', v_other_pending,
    'current_chargeable_units', v_chargeable,
    'day_fingerprint', v_fingerprint
  );
end;
$$;

revoke all on function public.get_my_leave_requests(integer,text,integer,integer)
from public, anon;
revoke all on function public.get_admin_leave_requests(integer,text,uuid,uuid,uuid,date,date,integer,integer)
from public, anon;
revoke all on function public.get_leave_request_detail(uuid)
from public, anon;

grant execute on function public.get_my_leave_requests(integer,text,integer,integer)
to authenticated;
grant execute on function public.get_admin_leave_requests(integer,text,uuid,uuid,uuid,date,date,integer,integer)
to authenticated;
grant execute on function public.get_leave_request_detail(uuid)
to authenticated;

-- Phase 6 Task 6: private draft attachment lifecycle.

create or replace function public.prepare_leave_attachment(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_attachment_id uuid,
  p_original_filename text,
  p_mime_type text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_filename text := nullif(btrim(coalesce(p_original_filename, '')), '');
  v_extension text;
  v_path text;
  v_count integer;
begin
  if auth.uid() is null or p_attachment_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found
     or v_group.current_status <> 'draft'
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> v_employee_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_filename is null or char_length(v_filename) > 255 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  select count(*) into v_count
  from public.leave_request_attachments
  where request_group_id = p_request_group_id;
  if v_count >= 5 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  v_extension := lower(split_part(
    v_filename,
    '.',
    array_length(string_to_array(v_filename, '.'), 1)
  ));
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
     or (p_mime_type = 'application/pdf' and v_extension <> 'pdf')
     or (p_mime_type = 'image/jpeg' and v_extension not in ('jpg', 'jpeg'))
     or (p_mime_type = 'image/png' and v_extension <> 'png') then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  v_path := v_group.employee_id::text
    || '/' || v_group.id::text
    || '/' || p_attachment_id::text
    || '.' || v_extension;
  return v_path;
end;
$$;

create or replace function public.finalize_leave_attachment(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_attachment_id uuid,
  p_storage_path text,
  p_original_filename text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_employee_id uuid := public.current_employee_id();
  v_object record;
  v_filename text := nullif(btrim(coalesce(p_original_filename, '')), '');
  v_extension text;
  v_mime_type text;
  v_size_bytes bigint;
  v_count integer;
begin
  if auth.uid() is null or p_attachment_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found
     or v_group.current_status <> 'draft'
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> v_employee_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_filename is null or char_length(v_filename) > 255 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  select count(*) into v_count
  from public.leave_request_attachments
  where request_group_id = p_request_group_id;
  if v_count >= 5 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  if p_storage_path not like (
    v_group.employee_id::text
    || '/' || v_group.id::text
    || '/' || p_attachment_id::text
    || '.%'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  select object_row.metadata, object_row.name
    into v_object
  from storage.objects as object_row
  where object_row.bucket_id = 'leave-documents'
    and object_row.name = p_storage_path;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  v_size_bytes := coalesce((v_object.metadata ->> 'size')::bigint, 0);
  v_mime_type := coalesce(v_object.metadata ->> 'mimetype', '');
  v_extension := lower(split_part(
    v_filename,
    '.',
    array_length(string_to_array(v_filename, '.'), 1)
  ));

  if v_size_bytes not between 1 and 10485760
     or v_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
     or (v_mime_type = 'application/pdf' and v_extension <> 'pdf')
     or (v_mime_type = 'image/jpeg' and v_extension not in ('jpg', 'jpeg'))
     or (v_mime_type = 'image/png' and v_extension <> 'png')
     or lower(split_part(p_storage_path, '.', array_length(string_to_array(p_storage_path, '.'), 1))) <> v_extension then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  insert into public.leave_request_attachments (
    id,
    request_group_id,
    request_revision_id,
    storage_path,
    original_filename,
    mime_type,
    size_bytes,
    uploaded_by
  ) values (
    p_attachment_id,
    p_request_group_id,
    p_expected_revision_id,
    p_storage_path,
    v_filename,
    v_mime_type,
    v_size_bytes,
    auth.uid()
  );

  return p_attachment_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
end;
$$;

create or replace function public.delete_leave_attachment(
  p_attachment_id uuid,
  p_expected_revision_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attachment public.leave_request_attachments%rowtype;
  v_group public.leave_request_groups%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_attachment
  from public.leave_request_attachments
  where id = p_attachment_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = v_attachment.request_group_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  if v_group.current_status <> 'draft'
     or v_group.active_revision_id is distinct from p_expected_revision_id
     or v_attachment.request_revision_id is distinct from p_expected_revision_id
     or v_attachment.frozen_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_INVALID_STATUS';
  end if;
  if not public.is_hr_admin() and v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  delete from public.leave_request_attachments
  where id = p_attachment_id;
  return v_attachment.storage_path;
end;
$$;

create or replace function public.get_leave_attachment_download(
  p_attachment_id uuid
)
returns table (
  storage_path text,
  original_filename text,
  mime_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  return query
  select
    attachment.storage_path,
    attachment.original_filename,
    attachment.mime_type
  from public.leave_request_attachments as attachment
  join public.leave_request_groups as request_group
    on request_group.id = attachment.request_group_id
  where attachment.id = p_attachment_id
    and (
      public.is_hr_admin()
      or request_group.employee_id = public.current_employee_id()
    );

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
end;
$$;

revoke all on function public.prepare_leave_attachment(uuid,uuid,uuid,text,text)
from public, anon;
revoke all on function public.finalize_leave_attachment(uuid,uuid,uuid,text,text)
from public, anon;
revoke all on function public.delete_leave_attachment(uuid,uuid)
from public, anon;
revoke all on function public.get_leave_attachment_download(uuid)
from public, anon;

grant execute on function public.prepare_leave_attachment(uuid,uuid,uuid,text,text)
to authenticated;
grant execute on function public.finalize_leave_attachment(uuid,uuid,uuid,text,text)
to authenticated;
grant execute on function public.delete_leave_attachment(uuid,uuid)
to authenticated;
grant execute on function public.get_leave_attachment_download(uuid)
to authenticated;

-- Phase 6 Task 7: atomic leave submission and logical reservations.

create or replace function public.leave_duration_overlaps(
  p_left text,
  p_right text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_left = 'full_day' or p_right = 'full_day' or p_left = p_right;
$$;

create or replace function public.validate_leave_eligibility(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_leave_year integer,
  p_policy_version_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee public.employees%rowtype;
  v_setting public.employee_leave_year_settings%rowtype;
  v_policy public.leave_type_versions%rowtype;
begin
  select * into v_employee
  from public.employees
  where id = p_employee_id;

  if not found
     or v_employee.archived_at is not null
     or v_employee.employment_status in ('inactive', 'terminated') then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  select * into v_policy
  from public.leave_type_versions
  where id = p_policy_version_id;

  if not found
     or v_policy.leave_type_id <> p_leave_type_id
     or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  select * into v_setting
  from public.employee_leave_year_settings
  where employee_id = p_employee_id
    and leave_type_id = p_leave_type_id
    and leave_year = p_leave_year;

  if found and v_setting.is_excluded then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  if v_policy.is_balance_tracked and not exists (
    select 1
    from public.leave_balance_accounts
    where employee_id = p_employee_id
      and leave_type_id = p_leave_type_id
      and leave_year = p_leave_year
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;
end;
$$;

create or replace function public.submit_leave_request_internal(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_allow_date_override boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text := coalesce(public.current_user_role()::text, 'employee');
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_employee public.employees%rowtype;
  v_leave_type_id uuid;
  v_policy record;
  v_day record;
  v_request_day_id uuid;
  v_day_revision_id uuid;
  v_chargeable numeric(10,1) := 0;
  v_requested numeric(10,1);
  v_company_date date := public.company_attendance_date(now());
  v_account_id uuid;
  v_ledger_balance numeric(10,1) := 0;
  v_pending numeric(10,1) := 0;
  v_attachment_count integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found
     or v_group.current_status <> 'draft'
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  select * into v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id
    and request_group_id = v_group.id
  for update;

  if not found or v_revision.frozen_at is not null or v_revision.submitted_at is not null then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  -- The employee row is the first cross-request lock. All submissions for an
  -- employee serialize here before overlap, balance, and reservation checks.
  select * into v_employee
  from public.employees
  where id = v_group.employee_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  if v_revision.start_date is null
     or v_revision.end_date is null
     or v_revision.start_date > v_revision.end_date then
    raise exception using errcode = 'P0001', message = 'LEAVE_DATE_RANGE_INVALID';
  end if;

  if not p_allow_date_override and (
    v_revision.start_date < v_company_date - 30
    or v_revision.end_date > v_company_date + 365
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_OUTSIDE_DATE_WINDOW';
  end if;

  if extract(year from v_revision.start_date)::integer
     <> extract(year from v_revision.end_date)::integer then
    raise exception using errcode = 'P0001', message = 'LEAVE_CROSSES_YEAR';
  end if;

  if v_revision.duration_mode not in ('full_day', 'first_half', 'second_half')
     or (
       v_revision.duration_mode <> 'full_day'
       and v_revision.start_date <> v_revision.end_date
     ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_HALF_DAY_RANGE_INVALID';
  end if;

  select version.leave_type_id into v_leave_type_id
  from public.leave_type_versions as version
  where version.id = v_revision.leave_type_version_id;

  if v_leave_type_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  select * into v_policy
  from public.resolve_leave_type_version(v_leave_type_id, v_revision.start_date);

  if v_policy.leave_type_version_id is null or not v_policy.is_active then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  perform public.validate_leave_eligibility(
    v_group.employee_id,
    v_policy.leave_type_id,
    v_revision.leave_year,
    v_policy.leave_type_version_id
  );

  perform request_group.id
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  where request_group.employee_id = v_group.employee_id
    and request_group.id <> p_request_group_id
    and request_group.current_status in ('pending','approved')
    and daterange(request_revision.start_date, request_revision.end_date, '[]')
      && daterange(v_revision.start_date, v_revision.end_date, '[]')
    and public.leave_duration_overlaps(
      request_revision.duration_mode,
      v_revision.duration_mode
    )
  order by request_group.id
  for update of request_group;

  if found then
    raise exception using errcode = 'P0001', message = 'LEAVE_OVERLAP';
  end if;

  -- Request-day rows do not exist for drafts. Failed submissions roll back
  -- their inserts, so immutable snapshots can be inserted without cleanup.
  for v_day in
    select series.leave_date::date as leave_date, context.*
    from generate_series(
      v_revision.start_date,
      v_revision.end_date,
      interval '1 day'
    ) as series(leave_date)
    cross join lateral public.resolve_leave_day_context(
      v_group.employee_id,
      v_policy.leave_type_version_id,
      series.leave_date::date,
      v_revision.duration_mode
    ) as context
  loop
    insert into public.leave_request_days (
      request_revision_id,
      leave_date
    ) values (
      v_revision.id,
      v_day.leave_date
    )
    returning id into v_request_day_id;

    insert into public.leave_request_day_revisions (
      request_day_id,
      revision_number,
      schedule_assignment_id,
      schedule_version_id,
      holiday_version_id,
      is_scheduled_workday,
      is_rest_day,
      is_holiday,
      is_chargeable,
      chargeable_units,
      leave_classification,
      half_day_boundary_at,
      calculation_source,
      calculated_by
    ) values (
      v_request_day_id,
      1,
      v_day.schedule_assignment_id,
      v_day.schedule_version_id,
      v_day.holiday_version_id,
      v_day.is_scheduled_workday,
      v_day.is_rest_day,
      v_day.is_holiday,
      v_day.is_chargeable,
      v_day.chargeable_units,
      v_day.leave_classification,
      v_day.half_day_boundary_at,
      'submission',
      v_actor
    )
    returning id into v_day_revision_id;

    update public.leave_request_days
    set active_revision_id = v_day_revision_id
    where id = v_request_day_id;

    v_chargeable := v_chargeable + v_day.chargeable_units;
  end loop;

  if v_chargeable = 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_NO_CHARGEABLE_DAYS';
  end if;

  if v_policy.employee_note_required
     and nullif(btrim(coalesce(v_revision.employee_note, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOTE_REQUIRED';
  end if;

  select count(*) into v_attachment_count
  from public.leave_request_attachments
  where request_group_id = v_group.id
    and request_revision_id = v_revision.id;

  if v_attachment_count > 5 then
    raise exception using errcode = 'P0001', message = 'LEAVE_ATTACHMENT_INVALID';
  end if;

  if v_policy.document_required
     and (
       v_policy.document_required_min_units is null
       or v_chargeable >= v_policy.document_required_min_units
     )
     and v_attachment_count = 0 then
    raise exception using errcode = 'P0001', message = 'LEAVE_DOCUMENT_REQUIRED';
  end if;

  if v_policy.is_balance_tracked then
    -- Eligibility guarantees the account already exists; this helper locks it.
    v_account_id := public.get_or_create_leave_balance_account(
      v_group.employee_id,
      v_policy.leave_type_id,
      v_revision.leave_year
    );
    v_ledger_balance := public.get_leave_balance(v_account_id, v_revision.start_date);

    -- The current group is still a draft, so it is absent from the aggregate
    -- reservation view. The detailed fallback retains an explicit group
    -- exclusion for safe reuse during later revalidation workflows.
    if exists (
      select 1
      from public.leave_pending_reservations as reservation
      where reservation.employee_id = v_group.employee_id
        and reservation.leave_type_id = v_policy.leave_type_id
        and reservation.leave_year = v_revision.leave_year
    ) then
      select coalesce(sum(day_revision.chargeable_units), 0)
        into v_pending
      from public.leave_request_groups as request_group
      join public.leave_request_revisions as request_revision
        on request_revision.id = request_group.active_revision_id
      join public.leave_request_days as request_day
        on request_day.request_revision_id = request_revision.id
      join public.leave_request_day_revisions as day_revision
        on day_revision.id = request_day.active_revision_id
      join public.leave_type_versions as policy
        on policy.id = request_revision.leave_type_version_id
      where request_group.employee_id = v_group.employee_id
        and request_group.id <> p_request_group_id
        and request_group.current_status = 'pending'
        and policy.leave_type_id = v_policy.leave_type_id
        and request_revision.leave_year = v_revision.leave_year
        and day_revision.is_chargeable;
    end if;

    if v_ledger_balance - v_pending < v_chargeable then
      raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
    end if;
  end if;

  v_requested := ((v_revision.end_date - v_revision.start_date) + 1)
    * case when v_revision.duration_mode = 'full_day' then 1 else 0.5 end;

  update public.leave_request_revisions
  set leave_type_version_id = v_policy.leave_type_version_id,
      requested_units = v_requested,
      submitted_chargeable_units = v_chargeable,
      submitted_at = now(),
      frozen_at = now(),
      updated_at = now()
  where id = v_revision.id;

  update public.leave_request_attachments
  set frozen_at = now()
  where request_group_id = v_group.id
    and request_revision_id = v_revision.id;

  update public.leave_request_groups
  set current_status = 'pending',
      updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id,
    request_revision_id,
    action_type,
    from_status,
    to_status,
    actor_profile_id,
    actor_role
  ) values (
    v_group.id,
    v_revision.id,
    'submitted',
    'draft',
    'pending',
    v_actor,
    v_actor_role
  );

  perform public.write_leave_audit(
    v_group.employee_id,
    'leave_request.submitted',
    'leave_request',
    v_group.id,
    jsonb_build_object(
      'request_group_id', v_group.id,
      'request_revision_id', v_revision.id,
      'leave_type_id', v_policy.leave_type_id,
      'leave_type_version_id', v_policy.leave_type_version_id,
      'leave_year', v_revision.leave_year,
      'start_date', v_revision.start_date,
      'end_date', v_revision.end_date,
      'requested_units', v_requested,
      'chargeable_units', v_chargeable,
      'status', 'pending'
    )
  );

  return v_group.id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
end;
$$;

create or replace function public.submit_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id;

  if not found or v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  return public.submit_leave_request_internal(
    p_request_group_id,
    p_expected_revision_id,
    false
  );
end;
$$;

create or replace function public.create_hr_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  return public.submit_leave_request_internal(
    p_request_group_id,
    p_expected_revision_id,
    true
  );
end;
$$;

revoke all on function public.leave_duration_overlaps(text,text)
from public, anon, authenticated;
revoke all on function public.validate_leave_eligibility(uuid,uuid,integer,uuid)
from public, anon, authenticated;
revoke all on function public.submit_leave_request_internal(uuid,uuid,boolean)
from public, anon, authenticated;
revoke all on function public.submit_leave_request(uuid,uuid)
from public, anon;
revoke all on function public.create_hr_leave_request(uuid,uuid)
from public, anon;

grant execute on function public.submit_leave_request(uuid,uuid)
to authenticated;
grant execute on function public.create_hr_leave_request(uuid,uuid)
to authenticated;

-- Phase 6 Task 8: immutable request review and terminal lifecycle actions.

-- Phase 6 Task 9: leave-aware attendance classification and conflicts.

alter table public.attendance_calculation_revisions
  drop constraint if exists calculation_revision_status_check;
alter table public.attendance_calculation_revisions
  add constraint calculation_revision_status_check
  check (base_status in (
    'present',
    'absent',
    'holiday',
    'missing_clock_out',
    'rest_day_worked',
    'unscheduled_attendance',
    'paid_leave',
    'unpaid_leave'
  ));

create or replace function public.get_approved_leave_day(
  p_employee_id uuid,
  p_work_date date
)
returns table (
  request_group_id uuid,
  request_revision_id uuid,
  request_day_id uuid,
  leave_day_revision_id uuid,
  duration_mode text,
  is_paid boolean,
  is_balance_tracked boolean,
  chargeable_units numeric,
  half_day_boundary_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    request_group.id,
    request_revision.id,
    request_day.id,
    day_revision.id,
    request_revision.duration_mode,
    policy.is_paid,
    policy.is_balance_tracked,
    day_revision.chargeable_units,
    day_revision.half_day_boundary_at
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy
    on policy.id = request_revision.leave_type_version_id
  join public.leave_request_days as request_day
    on request_day.request_revision_id = request_revision.id
   and request_day.leave_date = p_work_date
  join public.leave_request_day_revisions as day_revision
    on day_revision.id = request_day.active_revision_id
  where request_group.employee_id = p_employee_id
    and request_group.current_status = 'approved'
    and day_revision.chargeable_units > 0
  order by request_group.created_at desc, request_group.id desc
  limit 1
$$;

revoke all on function public.get_approved_leave_day(uuid,date)
from public, anon, authenticated;

create unique index if not exists leave_conflicts_open_identity_idx
on public.leave_attendance_conflicts (
  request_day_id,
  leave_day_revision_id,
  coalesce(attendance_calculation_revision_id, '00000000-0000-0000-0000-000000000000'::uuid),
  conflict_type
)
where status = 'open';

create or replace function public.upsert_leave_attendance_conflict(
  p_employee_id uuid,
  p_request_group_id uuid,
  p_request_day_id uuid,
  p_leave_day_revision_id uuid,
  p_attendance_calculation_revision_id uuid,
  p_conflict_type text,
  p_automatic_balance_action text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_conflict_type not in (
    'full_day_completed_attendance',
    'full_day_incomplete_attendance',
    'half_day_covered_time_overlap',
    'schedule_recalculation_failed',
    'holiday_recalculation_failed',
    'insufficient_balance_after_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_TYPE_INVALID';
  end if;

  update public.leave_attendance_conflicts
  set status = 'superseded'
  where request_day_id = p_request_day_id
    and status = 'open'
    and conflict_type <> p_conflict_type
    and (
      (
        p_conflict_type in (
          'full_day_completed_attendance',
          'full_day_incomplete_attendance',
          'half_day_covered_time_overlap'
        )
        and conflict_type in (
          'full_day_completed_attendance',
          'full_day_incomplete_attendance',
          'half_day_covered_time_overlap'
        )
      )
      or (
        p_conflict_type in (
          'schedule_recalculation_failed',
          'holiday_recalculation_failed',
          'insufficient_balance_after_recalculation'
        )
        and conflict_type in (
          'schedule_recalculation_failed',
          'holiday_recalculation_failed',
          'insufficient_balance_after_recalculation'
        )
      )
    );

  select id into v_id
  from public.leave_attendance_conflicts
  where request_day_id = p_request_day_id
    and leave_day_revision_id = p_leave_day_revision_id
    and attendance_calculation_revision_id is not distinct from p_attendance_calculation_revision_id
    and conflict_type = p_conflict_type
    and status = 'open';

  if v_id is null then
    insert into public.leave_attendance_conflicts (
      employee_id,
      request_group_id,
      request_day_id,
      leave_day_revision_id,
      attendance_calculation_revision_id,
      conflict_type,
      automatic_balance_action
    ) values (
      p_employee_id,
      p_request_group_id,
      p_request_day_id,
      p_leave_day_revision_id,
      p_attendance_calculation_revision_id,
      p_conflict_type,
      p_automatic_balance_action
    ) returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_leave_attendance_conflict(uuid,uuid,uuid,uuid,uuid,text,text)
from public, anon, authenticated;

create or replace function public.apply_leave_attendance_effects(
  p_employee_id uuid,
  p_work_date date,
  p_attendance_calculation_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_leave record;
  v_revision public.attendance_calculation_revisions%rowtype;
  v_attendance public.attendance_records%rowtype;
  v_charge record;
  v_overlap boolean := false;
begin
  if p_attendance_calculation_revision_id is null then
    return;
  end if;

  select * into v_leave
  from public.get_approved_leave_day(p_employee_id, p_work_date);
  if v_leave.request_group_id is null then
    return;
  end if;

  select revision.* into strict v_revision
  from public.attendance_calculation_revisions as revision
  join public.attendance_calculation_groups as calculation_group
    on calculation_group.id = revision.calculation_group_id
  where revision.id = p_attendance_calculation_revision_id
    and calculation_group.employee_id = p_employee_id
    and calculation_group.attendance_date = p_work_date;

  select * into v_attendance
  from public.attendance_records
  where employee_id = p_employee_id
    and attendance_date = p_work_date;

  if v_leave.duration_mode = 'full_day'
     and v_attendance.clock_in_at is not null
     and v_attendance.clock_out_at is not null then
    perform public.upsert_leave_attendance_conflict(
      p_employee_id,
      v_leave.request_group_id,
      v_leave.request_day_id,
      v_leave.leave_day_revision_id,
      p_attendance_calculation_revision_id,
      'full_day_completed_attendance',
      'released_full_day_charge'
    );

    for v_charge in
      select ledger.id
      from public.leave_balance_ledger as ledger
      join public.leave_request_day_revisions as charged_day
        on charged_day.id = ledger.request_day_revision_id
      where ledger.request_group_id = v_leave.request_group_id
        and charged_day.request_day_id = v_leave.request_day_id
        and ledger.entry_type in ('approved_leave_charge', 'recalculation_charge')
        and not exists (
          select 1
          from public.leave_balance_ledger as release
          where release.reversal_of_entry_id = ledger.id
            and release.entry_type in (
              'attendance_conflict_release',
              'recalculation_release',
              'cancellation_restoration'
            )
        )
      order by ledger.created_at, ledger.id
      for update
    loop
      perform public.restore_leave_charge(
        v_charge.id,
        'attendance_conflict_release',
        auth.uid(),
        null,
        jsonb_build_object(
          'source', 'attendance_precedence',
          'attendance_calculation_revision_id', p_attendance_calculation_revision_id
        )
      );
    end loop;

  elsif v_leave.duration_mode = 'full_day'
        and v_attendance.clock_in_at is not null
        and v_attendance.clock_out_at is null then
    perform public.upsert_leave_attendance_conflict(
      p_employee_id,
      v_leave.request_group_id,
      v_leave.request_day_id,
      v_leave.leave_day_revision_id,
      p_attendance_calculation_revision_id,
      'full_day_incomplete_attendance',
      'charge_retained'
    );

  elsif v_leave.duration_mode in ('first_half', 'second_half')
        and v_attendance.clock_in_at is not null then
    v_overlap := case
      when v_leave.duration_mode = 'first_half'
        then v_attendance.clock_in_at < v_leave.half_day_boundary_at
      else
        v_attendance.clock_in_at >= v_leave.half_day_boundary_at
        or (
          v_attendance.clock_out_at is not null
          and v_attendance.clock_out_at > v_leave.half_day_boundary_at
        )
    end;

    if v_overlap then
      perform public.upsert_leave_attendance_conflict(
        p_employee_id,
        v_leave.request_group_id,
        v_leave.request_day_id,
        v_leave.leave_day_revision_id,
        p_attendance_calculation_revision_id,
        'half_day_covered_time_overlap',
        'charge_retained'
      );
    end if;
  end if;
end;
$$;

revoke all on function public.apply_leave_attendance_effects(uuid,date,uuid)
from public, anon, authenticated;

create or replace function public.calculate_attendance_day_internal(
  p_employee_id uuid,
  p_attendance_date date,
  p_source text,
  p_actor_profile_id uuid,
  p_recalculation_reason text default null,
  p_force_final boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attendance public.attendance_records%rowtype;
  v_assignment public.employee_schedule_assignments%rowtype;
  v_version public.work_schedule_versions%rowtype;
  v_attendance_exists boolean := false;
  v_assignment_exists boolean := false;
  v_version_exists boolean := false;
  v_policy_version_id uuid;
  v_late_grace_minutes integer := 0;
  v_holiday_version_id uuid;
  v_holiday_name text;
  v_holiday_type text;
  v_is_holiday boolean := false;
  v_company_date date := public.company_attendance_date(now());
  v_date_has_ended boolean;
  v_weekday text;
  v_is_workday boolean := false;
  v_base_status text;
  v_is_provisional boolean := false;
  v_scheduled_start_at timestamptz;
  v_scheduled_end_at timestamptz;
  v_scheduled_minutes integer;
  v_worked_minutes integer;
  v_late_minutes integer;
  v_undertime_minutes integer;
  v_is_late boolean := false;
  v_is_undertime boolean := false;
  v_leave record;
  v_effective_scheduled_start_at timestamptz;
  v_effective_scheduled_end_at timestamptz;
  v_revision_id uuid;
begin
  if p_attendance_date is null or p_attendance_date > v_company_date then
    raise exception using errcode = 'P0001', message = 'FUTURE_ATTENDANCE_NOT_ALLOWED';
  end if;
  if p_source not in (
    'clock_in','clock_out','hr_create','hr_correction',
    'correction_approval','daily_finalization',
    'manual_recalculation','manual_finalization'
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_CALCULATION_SOURCE';
  end if;

  perform 1 from public.employees where id = p_employee_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;

  select * into v_attendance
  from public.attendance_records
  where employee_id = p_employee_id
    and attendance_date = p_attendance_date
  limit 1;
  v_attendance_exists := found;

  select * into v_assignment
  from public.employee_schedule_assignments
  where employee_id = p_employee_id
    and not is_superseded
    and effective_start_date <= p_attendance_date
    and (effective_end_date is null or effective_end_date >= p_attendance_date)
  order by effective_start_date desc, id desc
  limit 1;
  v_assignment_exists := found;

  if v_assignment_exists then
    select * into v_version
    from public.work_schedule_versions
    where schedule_template_id = v_assignment.schedule_template_id
      and effective_date <= p_attendance_date
    order by effective_date desc, id desc
    limit 1;
    v_version_exists := found;
    if not v_version_exists then
      raise exception using errcode = 'P0001', message = 'SCHEDULE_VERSION_NOT_FOUND';
    end if;
  end if;

  select policy_version_id, late_grace_minutes
    into v_policy_version_id, v_late_grace_minutes
  from public.resolve_attendance_policy(p_attendance_date);

  select holiday_version_id, holiday_name, holiday_type
    into v_holiday_version_id, v_holiday_name, v_holiday_type
  from public.resolve_active_holiday(p_attendance_date);
  v_is_holiday := v_holiday_version_id is not null;

  v_date_has_ended := p_attendance_date < v_company_date;
  v_weekday := lower(trim(to_char(p_attendance_date::timestamp, 'FMDay')));
  if v_version_exists then
    v_is_workday := v_weekday = any(v_version.working_days);
  end if;

  if v_assignment_exists and v_is_workday then
    v_scheduled_start_at :=
      (p_attendance_date + v_version.start_time) at time zone 'Asia/Manila';
    v_scheduled_end_at :=
      (p_attendance_date + v_version.end_time) at time zone 'Asia/Manila';
    v_scheduled_minutes := greatest(
      0,
      floor(extract(epoch from (v_scheduled_end_at - v_scheduled_start_at)) / 60)::integer
        - v_version.break_minutes
    );
  end if;


  -- get_approved_leave_day joins leave_request_groups and requires
  -- current_status = 'approved' before returning an active chargeable day.
  select * into v_leave
  from public.get_approved_leave_day(p_employee_id, p_attendance_date);

  v_effective_scheduled_start_at := v_scheduled_start_at;
  v_effective_scheduled_end_at := v_scheduled_end_at;
  if v_leave.request_group_id is not null
     and v_leave.duration_mode = 'first_half' then
    v_effective_scheduled_start_at := v_leave.half_day_boundary_at;
  elsif v_leave.request_group_id is not null
        and v_leave.duration_mode = 'second_half' then
    v_effective_scheduled_end_at := v_leave.half_day_boundary_at;
  end if;

  if v_is_holiday then
    if not v_attendance_exists then
      v_base_status := 'holiday';
      v_is_provisional := false;
      v_worked_minutes := 0;
      v_late_minutes := null;
      v_undertime_minutes := null;
    elsif v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
      v_worked_minutes := null;
      v_late_minutes := null;
      v_undertime_minutes := null;
    else
      v_base_status := 'present';
      v_is_provisional := false;
      v_worked_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_out_at - v_attendance.clock_in_at
        )) / 60)::integer
        - case when v_version_exists then v_version.break_minutes else 0 end
      );
      v_late_minutes := null;
      v_undertime_minutes := null;
    end if;
    v_is_late := false;
    v_is_undertime := false;
  elsif not v_assignment_exists then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'unscheduled_attendance';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
  elsif not v_is_workday then
    if not v_attendance_exists then
      return null;
    end if;
    v_base_status := 'rest_day_worked';
    v_is_provisional := v_attendance.clock_out_at is null
      and not v_date_has_ended and not p_force_final;
    v_scheduled_minutes := 0;
  elsif v_leave.request_group_id is not null
        and v_leave.duration_mode = 'full_day'
        and not v_attendance_exists then
    v_base_status := case
      when v_leave.is_paid then 'paid_leave'
      else 'unpaid_leave'
    end;
    v_is_provisional := false;
    v_worked_minutes := 0;
    v_late_minutes := 0;
    v_undertime_minutes := 0;
    v_is_late := false;
    v_is_undertime := false;
  elsif v_leave.request_group_id is not null
        and v_leave.duration_mode = 'full_day'
        and v_attendance.clock_out_at is null then
    v_base_status := 'missing_clock_out';
    v_is_provisional := false;
    v_worked_minutes := null;
    v_undertime_minutes := null;
    v_is_undertime := false;
  elsif not v_attendance_exists then
    if not v_date_has_ended and not p_force_final then
      return null;
    end if;
    v_base_status := 'absent';
    v_is_provisional := false;
    v_worked_minutes := 0;
    v_late_minutes := 0;
    v_undertime_minutes := 0;
  else
    if v_attendance.clock_out_at is null then
      if v_date_has_ended or p_force_final then
        v_base_status := 'missing_clock_out';
        v_is_provisional := false;
      else
        v_base_status := 'present';
        v_is_provisional := true;
      end if;
    else
      v_base_status := 'present';
      v_is_provisional := false;
    end if;
  end if;

  if not v_is_holiday and v_attendance_exists and v_assignment_exists and v_is_workday then
    if v_attendance.clock_in_at <=
      v_effective_scheduled_start_at + make_interval(mins => v_late_grace_minutes) then
      v_late_minutes := 0;
    else
      v_late_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_attendance.clock_in_at - v_effective_scheduled_start_at
        )) / 60)::integer
      );
    end if;
    v_is_late := coalesce(v_late_minutes, 0) > 0;
  end if;

  if not v_is_holiday and v_attendance_exists and v_attendance.clock_out_at is not null then
    v_worked_minutes := greatest(
      0,
      floor(extract(epoch from (
        v_attendance.clock_out_at - v_attendance.clock_in_at
      )) / 60)::integer
      - case when v_version_exists then v_version.break_minutes else 0 end
    );

    if v_assignment_exists and v_is_workday then
      v_undertime_minutes := greatest(
        0,
        floor(extract(epoch from (
          v_effective_scheduled_end_at - v_attendance.clock_out_at
        )) / 60)::integer
      );
      v_is_undertime := v_undertime_minutes > 0;
    else
      v_late_minutes := null;
      v_undertime_minutes := null;
      v_is_late := false;
      v_is_undertime := false;
    end if;
  elsif not v_is_holiday and v_base_status = 'missing_clock_out' then
    v_worked_minutes := null;
    v_undertime_minutes := null;
    v_is_undertime := false;
  end if;

  v_revision_id := public.write_attendance_calculation_revision(
    p_employee_id,
    p_attendance_date,
    case when v_attendance_exists then v_attendance.id else null end,
    case when v_assignment_exists then v_assignment.id else null end,
    case when v_version_exists then v_version.id else null end,
    v_policy_version_id,
    v_holiday_version_id,
    v_holiday_name,
    v_holiday_type,
    v_is_holiday,
    v_base_status,
    v_is_provisional,
    case when v_assignment_exists and v_is_workday then v_scheduled_start_at else null end,
    case when v_assignment_exists and v_is_workday then v_scheduled_end_at else null end,
    v_scheduled_minutes,
    case when v_attendance_exists then v_attendance.clock_in_at else null end,
    case when v_attendance_exists then v_attendance.clock_out_at else null end,
    v_worked_minutes,
    v_late_minutes,
    v_undertime_minutes,
    v_is_late,
    v_is_undertime,
    case when v_attendance_exists then v_attendance.is_corrected else false end,
    p_source = 'manual_recalculation',
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );

  perform public.calculate_overtime_for_attendance_day(
    p_employee_id,
    p_attendance_date,
    p_source,
    p_actor_profile_id,
    p_recalculation_reason
  );

  perform public.apply_leave_attendance_effects(
    p_employee_id,
    p_attendance_date,
    v_revision_id
  );

  return v_revision_id;
end;
$$;

create or replace function public.recalculate_attendance_for_leave_dates(
  p_request_group_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_day record;
  v_calculation_revision_id uuid;
  v_company_date date := public.company_attendance_date(now());
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'leave_recalculation');
begin
  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;

  for v_day in
    select request_day.leave_date
    from public.leave_request_days as request_day
    where request_day.request_revision_id = v_group.active_revision_id
      and request_day.leave_date <= v_company_date
    order by request_day.leave_date
  loop
    v_calculation_revision_id := public.calculate_attendance_day_internal(
      v_group.employee_id,
      v_day.leave_date,
      'manual_recalculation',
      auth.uid(),
      v_reason,
      false
    );

    if v_calculation_revision_id is not null then
      perform public.apply_leave_attendance_effects(
        v_group.employee_id,
        v_day.leave_date,
        v_calculation_revision_id
      );
    end if;
  end loop;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = case
        when sqlerrm like 'LEAVE_%' then sqlerrm
        else 'LEAVE_RECALCULATION_FAILED'
      end;
end;
$$;

revoke all on function public.recalculate_attendance_for_leave_dates(uuid,text)
from public, anon, authenticated;

create or replace function public.get_leave_attendance_conflicts(
  p_status text default 'open',
  p_conflict_type text default null,
  p_employee_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  conflict_id uuid,
  conflict_type text,
  conflict_status text,
  employee_id uuid,
  employee_name text,
  employee_number text,
  leave_type_name text,
  leave_date date,
  duration_mode text,
  chargeable_units numeric,
  attendance_base_status text,
  automatic_balance_action text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_status is not null and p_status not in ('open', 'resolved', 'superseded') then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_STATUS_INVALID';
  end if;
  if p_conflict_type is not null and p_conflict_type not in (
    'full_day_completed_attendance',
    'full_day_incomplete_attendance',
    'half_day_covered_time_overlap',
    'schedule_recalculation_failed',
    'holiday_recalculation_failed',
    'insufficient_balance_after_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_TYPE_INVALID';
  end if;

  return query
  select
    conflict.id,
    conflict.conflict_type,
    conflict.status,
    employee.id,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.employee_number,
    leave_type.name,
    request_day.leave_date,
    request_revision.duration_mode,
    leave_day.chargeable_units,
    attendance_revision.base_status,
    conflict.automatic_balance_action,
    conflict.created_at,
    count(*) over ()
  from public.leave_attendance_conflicts as conflict
  join public.employees as employee
    on employee.id = conflict.employee_id
  join public.leave_request_groups as request_group
    on request_group.id = conflict.request_group_id
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as leave_type
    on leave_type.id = request_revision.leave_type_version_id
  join public.leave_request_days as request_day
    on request_day.id = conflict.request_day_id
  join public.leave_request_day_revisions as leave_day
    on leave_day.id = conflict.leave_day_revision_id
  left join public.attendance_calculation_revisions as attendance_revision
    on attendance_revision.id = conflict.attendance_calculation_revision_id
  where (p_status is null or conflict.status = p_status)
    and (p_conflict_type is null or conflict.conflict_type = p_conflict_type)
    and (p_employee_id is null or conflict.employee_id = p_employee_id)
  order by conflict.created_at desc, conflict.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

revoke all on function public.get_leave_attendance_conflicts(text,text,uuid,integer,integer)
from public, anon;
grant execute on function public.get_leave_attendance_conflicts(text,text,uuid,integer,integer)
to authenticated;

create or replace function public.resolve_leave_attendance_conflict(
  p_conflict_id uuid,
  p_resolution_type text,
  p_private_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_conflict public.leave_attendance_conflicts%rowtype;
  v_note text := public.normalize_leave_private_text(p_private_resolution_note, false);
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_resolution_type not in (
    'reviewed_no_change',
    'leave_cancelled',
    'attendance_corrected',
    'replacement_requested'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_RESOLUTION_INVALID';
  end if;

  select * into v_conflict
  from public.leave_attendance_conflicts
  where id = p_conflict_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_NOT_FOUND';
  end if;
  if v_conflict.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  update public.leave_attendance_conflicts
  set status = 'resolved',
      resolved_by = v_actor,
      resolved_at = now(),
      resolution_type = p_resolution_type,
      private_resolution_note = v_note
  where id = v_conflict.id;

  perform public.write_leave_audit(
    v_conflict.employee_id,
    'leave_conflict.resolved',
    'leave_attendance_conflict',
    v_conflict.id,
    jsonb_build_object(
      'conflict_type', v_conflict.conflict_type,
      'resolution_type', p_resolution_type,
      'request_group_id', v_conflict.request_group_id
    )
  );
end;
$$;

revoke all on function public.resolve_leave_attendance_conflict(uuid,text,text)
from public, anon;
grant execute on function public.resolve_leave_attendance_conflict(uuid,text,text)
to authenticated;


create or replace function public.withdraw_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found or v_group.employee_id <> public.current_employee_id() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;

  if v_group.current_status <> 'pending'
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  update public.leave_request_groups
  set current_status = 'withdrawn',
      updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id,
    request_revision_id,
    action_type,
    from_status,
    to_status,
    actor_profile_id,
    actor_role
  ) values (
    v_group.id,
    v_group.active_revision_id,
    'withdrawn',
    'pending',
    'withdrawn',
    v_profile_id,
    'employee'
  );

  perform public.write_leave_audit(
    v_group.employee_id,
    'leave_request.withdrawn',
    'leave_request',
    v_group.id,
    jsonb_build_object(
      'request_group_id', v_group.id,
      'request_revision_id', v_group.active_revision_id,
      'from_status', 'pending',
      'to_status', 'withdrawn'
    )
  );
end;
$$;

create or replace function public.review_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_expected_status text,
  p_expected_day_fingerprint text,
  p_expected_chargeable_units numeric,
  p_decision text,
  p_review_text text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_policy public.leave_type_versions%rowtype;
  v_employee public.employees%rowtype;
  v_profile_id uuid := auth.uid();
  v_actor_role text := coalesce(public.current_user_role()::text, 'hr_admin');
  v_review_text text := public.normalize_leave_private_text(p_review_text, false);
  v_chargeable_units numeric(10,1);
  v_day_fingerprint text;
  v_account_id uuid;
  v_day record;
  v_context record;
  v_old_group public.leave_request_groups%rowtype;
begin
  if v_profile_id is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = 'P0001', message = 'LEAVE_DECISION_INVALID';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if p_expected_status is distinct from 'pending'
     or v_group.current_status is distinct from p_expected_status
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  select * into v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id
    and request_group_id = v_group.id
  for update;

  if not found
     or v_revision.frozen_at is null
     or v_revision.submitted_at is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  -- Match Task 7's lock order so submission, review, and later recalculation
  -- serialize all balance and overlap decisions for one employee.
  select * into v_employee
  from public.employees
  where id = v_group.employee_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  select
    coalesce(sum(active_day.chargeable_units), 0)::numeric(10,1),
    encode(
      digest(
        coalesce(
          string_agg(
            request_day.active_revision_id::text || ':' || active_day.chargeable_units::text,
            '|' order by request_day.leave_date
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
  into v_chargeable_units, v_day_fingerprint
  from public.leave_request_days as request_day
  join public.leave_request_day_revisions as active_day
    on active_day.id = request_day.active_revision_id
  where request_day.request_revision_id = v_revision.id;

  if p_expected_chargeable_units is null
     or p_expected_day_fingerprint is null
     or v_chargeable_units <> p_expected_chargeable_units
     or v_chargeable_units <> v_revision.submitted_chargeable_units
     or v_day_fingerprint is distinct from p_expected_day_fingerprint then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  if p_decision = 'reject' then
    if v_review_text is null then
      raise exception using errcode = 'P0001', message = 'LEAVE_REJECTION_REASON_REQUIRED';
    end if;

    update public.leave_request_groups
    set current_status = 'rejected',
        updated_at = now()
    where id = v_group.id;

    insert into public.leave_request_actions (
      request_group_id,
      request_revision_id,
      action_type,
      from_status,
      to_status,
      actor_profile_id,
      actor_role,
      action_reason
    ) values (
      v_group.id,
      v_revision.id,
      'rejected',
      'pending',
      'rejected',
      v_profile_id,
      v_actor_role,
      v_review_text
    );

    perform public.write_leave_audit(
      v_group.employee_id,
      'leave_request.rejected',
      'leave_request',
      v_group.id,
      jsonb_build_object(
        'request_group_id', v_group.id,
        'request_revision_id', v_revision.id,
        'from_status', 'pending',
        'to_status', 'rejected'
      )
    );
    return;
  end if;

  select * into v_policy
  from public.leave_type_versions
  where id = v_revision.leave_type_version_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_POLICY_INACTIVE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_group.employee_id::text || ':' ||
      v_policy.leave_type_id::text || ':' ||
      v_revision.leave_year::text,
      0
    )
  );

  perform public.validate_leave_eligibility(
    v_group.employee_id,
    v_policy.leave_type_id,
    v_revision.leave_year,
    v_policy.id
  );

  -- Lock and recheck any other pending or approved requests. The employee lock
  -- serializes new submissions while this query protects existing group rows.
  perform request_group.id
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  where request_group.employee_id = v_group.employee_id
    and request_group.id <> v_group.id
    and request_group.current_status in ('pending','approved')
    and daterange(request_revision.start_date, request_revision.end_date, '[]')
      && daterange(v_revision.start_date, v_revision.end_date, '[]')
    and public.leave_duration_overlaps(
      request_revision.duration_mode,
      v_revision.duration_mode
    )
  order by request_group.id
  for update of request_group;

  if found then
    raise exception using errcode = 'P0001', message = 'LEAVE_OVERLAP';
  end if;

  -- Approval never silently changes submitted snapshots. Any schedule, holiday,
  -- workday, classification, unit, or half-day boundary drift requires reload.
  for v_day in
    select
      request_day.id,
      request_day.leave_date,
      active_day.id as active_day_revision_id,
      active_day.schedule_assignment_id,
      active_day.schedule_version_id,
      active_day.holiday_version_id,
      active_day.is_scheduled_workday,
      active_day.is_rest_day,
      active_day.is_holiday,
      active_day.is_chargeable,
      active_day.chargeable_units,
      active_day.leave_classification,
      active_day.half_day_boundary_at
    from public.leave_request_days as request_day
    join public.leave_request_day_revisions as active_day
      on active_day.id = request_day.active_revision_id
    where request_day.request_revision_id = v_revision.id
    order by request_day.leave_date
  loop
    select * into v_context
    from public.resolve_leave_day_context(
      v_group.employee_id,
      v_revision.leave_type_version_id,
      v_day.leave_date,
      v_revision.duration_mode
    );

    if v_context.schedule_assignment_id is distinct from v_day.schedule_assignment_id
       or v_context.schedule_version_id is distinct from v_day.schedule_version_id
       or v_context.holiday_version_id is distinct from v_day.holiday_version_id
       or v_context.is_scheduled_workday is distinct from v_day.is_scheduled_workday
       or v_context.is_rest_day is distinct from v_day.is_rest_day
       or v_context.is_holiday is distinct from v_day.is_holiday
       or v_context.is_chargeable is distinct from v_day.is_chargeable
       or v_context.chargeable_units is distinct from v_day.chargeable_units
       or v_context.leave_classification is distinct from v_day.leave_classification
       or v_context.half_day_boundary_at is distinct from v_day.half_day_boundary_at then
      raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
    end if;
  end loop;

  if v_policy.is_balance_tracked then
    v_account_id := public.get_or_create_leave_balance_account(
      v_group.employee_id,
      v_policy.leave_type_id,
      v_revision.leave_year
    );

    if public.get_leave_balance(v_account_id, v_revision.start_date) < v_chargeable_units then
      raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
    end if;

    for v_day in
      select
        request_day.leave_date,
        active_day.id as active_day_revision_id,
        active_day.chargeable_units
      from public.leave_request_days as request_day
      join public.leave_request_day_revisions as active_day
        on active_day.id = request_day.active_revision_id
      where request_day.request_revision_id = v_revision.id
        and active_day.chargeable_units > 0
      order by request_day.leave_date
    loop
      perform public.consume_leave_balance(
        v_account_id,
        v_day.chargeable_units,
        'approved_leave_charge',
        v_day.leave_date,
        v_group.id,
        v_day.active_day_revision_id,
        v_profile_id,
        null,
        jsonb_build_object('source', 'leave_approval')
      );
    end loop;
  end if;

  update public.leave_request_groups
  set current_status = 'approved',
      updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id,
    request_revision_id,
    action_type,
    from_status,
    to_status,
    actor_profile_id,
    actor_role,
    review_note
  ) values (
    v_group.id,
    v_revision.id,
    'approved',
    'pending',
    'approved',
    v_profile_id,
    v_actor_role,
    v_review_text
  );

  if v_group.replaces_request_group_id is not null then
    select * into v_old_group
    from public.leave_request_groups
    where id = v_group.replaces_request_group_id
    for update;

    if not found
       or v_old_group.employee_id <> v_group.employee_id
       or v_old_group.current_status not in ('withdrawn', 'cancelled')
       or v_old_group.superseded_by_request_group_id is not null then
      raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
    end if;

    update public.leave_request_groups
    set current_status = 'superseded',
        superseded_by_request_group_id = v_group.id,
        updated_at = now()
    where id = v_old_group.id;

    insert into public.leave_request_actions (
      request_group_id,
      request_revision_id,
      action_type,
      from_status,
      to_status,
      actor_profile_id,
      actor_role
    ) values (
      v_old_group.id,
      v_old_group.active_revision_id,
      'superseded',
      v_old_group.current_status,
      'superseded',
      v_profile_id,
      v_actor_role
    );

    perform public.write_leave_audit(
      v_old_group.employee_id,
      'leave_request.superseded',
      'leave_request',
      v_old_group.id,
      jsonb_build_object(
        'request_group_id', v_old_group.id,
        'replacement_request_group_id', v_group.id,
        'from_status', v_old_group.current_status,
        'to_status', 'superseded'
      )
    );
  end if;

  perform public.write_leave_audit(
    v_group.employee_id,
    'leave_request.approved',
    'leave_request',
    v_group.id,
    jsonb_build_object(
      'request_group_id', v_group.id,
      'request_revision_id', v_revision.id,
      'chargeable_units', v_chargeable_units,
      'from_status', 'pending',
      'to_status', 'approved'
    )
  );

  perform public.recalculate_attendance_for_leave_dates(
    v_group.id,
    'leave_request_approved'
  );
end;
$$;

create or replace function public.cancel_approved_leave_request(
  p_request_group_id uuid,
  p_expected_revision_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_employee public.employees%rowtype;
  v_profile_id uuid := auth.uid();
  v_actor_role text := coalesce(public.current_user_role()::text, 'hr_admin');
  v_reason text := public.normalize_leave_private_text(p_reason, false);
  v_charge record;
begin
  if v_profile_id is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'LEAVE_CANCELLATION_REASON_REQUIRED';
  end if;

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_NOT_FOUND';
  end if;
  if v_group.current_status <> 'approved'
     or v_group.active_revision_id is distinct from p_expected_revision_id then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STALE';
  end if;

  select * into v_employee
  from public.employees
  where id = v_group.employee_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'LEAVE_NOT_ELIGIBLE';
  end if;

  for v_charge in
    select ledger.id
    from public.leave_balance_ledger as ledger
    where ledger.request_group_id = v_group.id
      and ledger.entry_type in ('approved_leave_charge', 'recalculation_charge')
      and abs(ledger.units) > coalesce((
        select sum(restoration.units)
        from public.leave_balance_ledger as restoration
        where restoration.reversal_of_entry_id = ledger.id
      ), 0)
    order by ledger.created_at, ledger.id
    for update
  loop
    perform public.restore_leave_charge(
      v_charge.id,
      'cancellation_restoration',
      v_profile_id,
      v_reason,
      jsonb_build_object('source', 'approved_leave_cancellation')
    );
  end loop;

  update public.leave_request_groups
  set current_status = 'cancelled',
      updated_at = now()
  where id = v_group.id;

  insert into public.leave_request_actions (
    request_group_id,
    request_revision_id,
    action_type,
    from_status,
    to_status,
    actor_profile_id,
    actor_role,
    action_reason
  ) values (
    v_group.id,
    v_group.active_revision_id,
    'cancelled',
    'approved',
    'cancelled',
    v_profile_id,
    v_actor_role,
    v_reason
  );

  perform public.write_leave_audit(
    v_group.employee_id,
    'leave_request.cancelled',
    'leave_request',
    v_group.id,
    jsonb_build_object(
      'request_group_id', v_group.id,
      'request_revision_id', v_group.active_revision_id,
      'from_status', 'approved',
      'to_status', 'cancelled'
    )
  );

  perform public.recalculate_attendance_for_leave_dates(
    v_group.id,
    'approved_leave_cancelled'
  );
end;
$$;

revoke all on function public.recalculate_attendance_for_leave_dates(uuid,text)
from public, anon, authenticated;
revoke all on function public.withdraw_leave_request(uuid,uuid)
from public, anon;
revoke all on function public.review_leave_request(uuid,uuid,text,text,numeric,text,text)
from public, anon;
revoke all on function public.cancel_approved_leave_request(uuid,uuid,text)
from public, anon;

grant execute on function public.withdraw_leave_request(uuid,uuid)
to authenticated;
grant execute on function public.review_leave_request(uuid,uuid,text,text,numeric,text,text)
to authenticated;
grant execute on function public.cancel_approved_leave_request(uuid,uuid,text)
to authenticated;

-- Phase 6 Task 10: schedule- and holiday-driven leave recalculation.

create or replace function public.recalculate_leave_request_dates(
  p_request_group_id uuid,
  p_source text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_group public.leave_request_groups%rowtype;
  v_revision public.leave_request_revisions%rowtype;
  v_policy public.leave_type_versions%rowtype;
  v_day public.leave_request_days%rowtype;
  v_old public.leave_request_day_revisions%rowtype;
  v_context record;
  v_new_revision_id uuid;
  v_revision_number integer;
  v_charge record;
  v_account_id uuid;
  v_available numeric(10,1);
  v_reason text := public.normalize_leave_private_text(p_reason, false);
  v_lock_employee_id uuid;
  v_lock_leave_type_id uuid;
  v_lock_leave_year integer;
  v_conflict_request_day_id uuid;
  v_conflict_leave_revision_id uuid;
  v_conflict_attendance_revision_id uuid;
begin
  if p_source not in (
    'schedule_recalculation',
    'holiday_recalculation',
    'attendance_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
  end if;

  -- Take the cross-request lock before any request row lock. A preliminary
  -- immutable identity read prevents a recalculation waiting on the advisory
  -- lock from holding another request group and deadlocking an approval.
  select request_group.employee_id,
         policy.leave_type_id,
         request_revision.leave_year
  into v_lock_employee_id, v_lock_leave_type_id, v_lock_leave_year
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy
    on policy.id = request_revision.leave_type_version_id
  where request_group.id = p_request_group_id
    and request_group.current_status = 'approved';

  if not found then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_lock_employee_id::text || ':' ||
      v_lock_leave_type_id::text || ':' ||
      v_lock_leave_year::text,
      0
    )
  );

  select * into v_group
  from public.leave_request_groups
  where id = p_request_group_id
  for update;

  if not found or v_group.current_status <> 'approved' then
    return;
  end if;

  select * into strict v_revision
  from public.leave_request_revisions
  where id = v_group.active_revision_id
  for update;

  select * into strict v_policy
  from public.leave_type_versions
  where id = v_revision.leave_type_version_id;

  if v_group.employee_id is distinct from v_lock_employee_id
     or v_policy.leave_type_id is distinct from v_lock_leave_type_id
     or v_revision.leave_year is distinct from v_lock_leave_year then
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
  end if;

  if v_policy.is_balance_tracked then
    v_account_id := public.get_or_create_leave_balance_account(
      v_group.employee_id,
      v_policy.leave_type_id,
      v_revision.leave_year
    );
  end if;

  -- Release every decrease first. This allows a workday swap inside one
  -- request to reuse the released balance before new chargeable dates are
  -- consumed. The exception block rolls the whole request back on failure.
  for v_day in
    select *
    from public.leave_request_days
    where request_revision_id = v_revision.id
    order by leave_date
    for update
  loop
    select * into strict v_old
    from public.leave_request_day_revisions
    where id = v_day.active_revision_id;

    select * into v_context
    from public.resolve_leave_day_context(
      v_group.employee_id,
      v_revision.leave_type_version_id,
      v_day.leave_date,
      v_revision.duration_mode
    );

    if v_policy.is_balance_tracked
       and v_context.chargeable_units < v_old.chargeable_units then
      for v_charge in
        select ledger.id, ledger.effective_date
        from public.leave_balance_ledger as ledger
        join public.leave_request_day_revisions as charged_day
          on charged_day.id = ledger.request_day_revision_id
        where ledger.request_group_id = v_group.id
          and charged_day.request_day_id = v_day.id
          and ledger.entry_type in ('approved_leave_charge', 'recalculation_charge')
          and not exists (
            select 1
            from public.leave_balance_ledger as reversal
            where reversal.reversal_of_entry_id = ledger.id
              and reversal.entry_type in (
                'attendance_conflict_release',
                'recalculation_release',
                'cancellation_restoration'
              )
          )
        order by ledger.created_at, ledger.id
        for update of ledger
      loop
        perform public.restore_leave_charge(
          v_charge.id,
          'recalculation_release',
          auth.uid(),
          v_reason,
          jsonb_build_object('source', p_source),
          v_charge.effective_date
        );
      end loop;
    end if;
  end loop;

  -- Append the new immutable day state and consume any increases only after
  -- all releases have been applied inside this transaction.
  for v_day in
    select *
    from public.leave_request_days
    where request_revision_id = v_revision.id
    order by leave_date
    for update
  loop
    select * into strict v_old
    from public.leave_request_day_revisions
    where id = v_day.active_revision_id;

    select * into v_context
    from public.resolve_leave_day_context(
      v_group.employee_id,
      v_revision.leave_type_version_id,
      v_day.leave_date,
      v_revision.duration_mode
    );

    if v_context.chargeable_units = v_old.chargeable_units
       and v_context.leave_classification = v_old.leave_classification
       and v_context.schedule_assignment_id is not distinct from v_old.schedule_assignment_id
       and v_context.schedule_version_id is not distinct from v_old.schedule_version_id
       and v_context.holiday_version_id is not distinct from v_old.holiday_version_id
       and v_context.is_scheduled_workday is not distinct from v_old.is_scheduled_workday
       and v_context.is_rest_day is not distinct from v_old.is_rest_day
       and v_context.is_holiday is not distinct from v_old.is_holiday
       and v_context.half_day_boundary_at is not distinct from v_old.half_day_boundary_at then
      continue;
    end if;

    if v_policy.is_balance_tracked
       and v_context.chargeable_units > v_old.chargeable_units then
      v_available := public.get_leave_balance(v_account_id, v_day.leave_date);

      if v_available < (v_context.chargeable_units - v_old.chargeable_units) then
        v_conflict_request_day_id := v_day.id;
        v_conflict_leave_revision_id := v_old.id;
        v_conflict_attendance_revision_id := v_old.attendance_calculation_revision_id;
        raise exception using errcode = 'P0001', message = 'LEAVE_INSUFFICIENT_BALANCE';
      end if;
    end if;

    select coalesce(max(revision_number), 0) + 1
    into v_revision_number
    from public.leave_request_day_revisions
    where request_day_id = v_day.id;

    insert into public.leave_request_day_revisions (
      request_day_id,
      revision_number,
      schedule_assignment_id,
      schedule_version_id,
      holiday_version_id,
      attendance_calculation_revision_id,
      is_scheduled_workday,
      is_rest_day,
      is_holiday,
      is_chargeable,
      chargeable_units,
      leave_classification,
      half_day_boundary_at,
      conflict_state,
      calculation_source,
      calculated_by,
      recalculation_reason
    ) values (
      v_day.id,
      v_revision_number,
      v_context.schedule_assignment_id,
      v_context.schedule_version_id,
      v_context.holiday_version_id,
      v_old.attendance_calculation_revision_id,
      v_context.is_scheduled_workday,
      v_context.is_rest_day,
      v_context.is_holiday,
      v_context.chargeable_units > 0,
      v_context.chargeable_units,
      v_context.leave_classification,
      v_context.half_day_boundary_at,
      null,
      p_source,
      auth.uid(),
      v_reason
    ) returning id into v_new_revision_id;

    update public.leave_request_days
    set active_revision_id = v_new_revision_id
    where id = v_day.id;

    if v_policy.is_balance_tracked
       and v_context.chargeable_units > v_old.chargeable_units then
      perform public.consume_leave_balance(
        v_account_id,
        v_context.chargeable_units - v_old.chargeable_units,
        'recalculation_charge',
        v_day.leave_date,
        v_group.id,
        v_new_revision_id,
        auth.uid(),
        v_reason,
        jsonb_build_object('source', p_source)
      );
    end if;
  end loop;

  perform public.recalculate_attendance_for_leave_dates(v_group.id, p_source);

  update public.leave_attendance_conflicts as conflict
  set status = 'superseded'
  where conflict.request_group_id = v_group.id
    and conflict.status = 'open'
    and conflict.conflict_type in (
      'schedule_recalculation_failed',
      'holiday_recalculation_failed',
      'insufficient_balance_after_recalculation'
    );
exception
  when raise_exception then
    if sqlerrm = 'LEAVE_INSUFFICIENT_BALANCE'
       and v_conflict_request_day_id is not null then
      perform public.upsert_leave_attendance_conflict(
        v_group.employee_id,
        v_group.id,
        v_conflict_request_day_id,
        v_conflict_leave_revision_id,
        v_conflict_attendance_revision_id,
        'insufficient_balance_after_recalculation',
        'charge_not_applied'
      );
      return;
    end if;

    if sqlerrm like 'LEAVE_%' then
      raise;
    end if;
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
  when others then
    raise exception using errcode = 'P0001', message = 'LEAVE_RECALCULATION_FAILED';
end;
$$;

revoke all on function public.recalculate_leave_request_dates(uuid,text,text)
from public, anon, authenticated;

create or replace function public.recalculate_approved_leave_for_employee_range(
  p_employee_id uuid,
  p_date_from date,
  p_date_to date,
  p_source text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_group_id uuid;
begin
  if p_employee_id is null or p_date_from is null then
    return;
  end if;

  for v_request_group_id in
    select distinct request_group.id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    where request_group.employee_id = p_employee_id
      and request_group.current_status = 'approved'
      and daterange(request_revision.start_date, request_revision.end_date, '[]')
        && daterange(p_date_from, coalesce(p_date_to, 'infinity'::date), '[]')
    order by request_group.id
  loop
    perform public.recalculate_leave_request_dates(
      v_request_group_id,
      p_source,
      p_reason
    );
  end loop;
end;
$$;

create or replace function public.recalculate_approved_leave_for_schedule_template_range(
  p_schedule_template_id uuid,
  p_date_from date,
  p_date_to date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_assignment record;
begin
  for v_assignment in
    select assignment.employee_id,
           greatest(assignment.effective_start_date, p_date_from) as date_from,
           case
             when p_date_to is null then assignment.effective_end_date
             when assignment.effective_end_date is null then p_date_to
             else least(assignment.effective_end_date, p_date_to)
           end as date_to
    from public.employee_schedule_assignments as assignment
    where assignment.schedule_template_id = p_schedule_template_id
      and not assignment.is_superseded
      and daterange(
        assignment.effective_start_date,
        coalesce(assignment.effective_end_date, 'infinity'::date),
        '[]'
      ) && daterange(p_date_from, coalesce(p_date_to, 'infinity'::date), '[]')
    order by assignment.employee_id, assignment.effective_start_date, assignment.id
  loop
    perform public.recalculate_approved_leave_for_employee_range(
      v_assignment.employee_id,
      v_assignment.date_from,
      v_assignment.date_to,
      'schedule_recalculation',
      p_reason
    );
  end loop;
end;
$$;

create or replace function public.recalculate_approved_leave_for_holiday_date(
  p_holiday_date date,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request_group_id uuid;
begin
  if p_holiday_date is null then
    return;
  end if;

  for v_request_group_id in
    select distinct request_group.id
    from public.leave_request_groups as request_group
    join public.leave_request_revisions as request_revision
      on request_revision.id = request_group.active_revision_id
    where request_group.current_status = 'approved'
      and p_holiday_date between request_revision.start_date and request_revision.end_date
    order by request_group.id
  loop
    perform public.recalculate_leave_request_dates(
      v_request_group_id,
      'holiday_recalculation',
      p_reason
    );
  end loop;
end;
$$;

revoke all on function public.recalculate_approved_leave_for_employee_range(uuid,date,date,text,text)
from public, anon, authenticated;
revoke all on function public.recalculate_approved_leave_for_schedule_template_range(uuid,date,date,text)
from public, anon, authenticated;
revoke all on function public.recalculate_approved_leave_for_holiday_date(date,text)
from public, anon, authenticated;

create or replace function public.trigger_leave_recalculation_for_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_approved_leave_for_employee_range(
      new.employee_id,
      new.effective_start_date,
      new.effective_end_date,
      'schedule_recalculation',
      'schedule_assignment_created'
    );
    return new;
  end if;

  if old.employee_id is distinct from new.employee_id
     or old.effective_start_date is distinct from new.effective_start_date
     or old.effective_end_date is distinct from new.effective_end_date
     or old.schedule_template_id is distinct from new.schedule_template_id
     or old.is_superseded is distinct from new.is_superseded then
    perform public.recalculate_approved_leave_for_employee_range(
      old.employee_id,
      old.effective_start_date,
      old.effective_end_date,
      'schedule_recalculation',
      'schedule_assignment_changed'
    );
    perform public.recalculate_approved_leave_for_employee_range(
      new.employee_id,
      new.effective_start_date,
      new.effective_end_date,
      'schedule_recalculation',
      'schedule_assignment_changed'
    );
  end if;

  return new;
end;
$$;

create constraint trigger trigger_leave_recalculation_for_schedule
after insert or update on public.employee_schedule_assignments
deferrable initially deferred
for each row execute function public.trigger_leave_recalculation_for_schedule();

create or replace function public.trigger_leave_recalculation_for_schedule_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_next_effective_date date;
begin
  select min(version.effective_date)
  into v_next_effective_date
  from public.work_schedule_versions as version
  where version.schedule_template_id = new.schedule_template_id
    and version.effective_date > new.effective_date;

  perform public.recalculate_approved_leave_for_schedule_template_range(
    new.schedule_template_id,
    new.effective_date,
    case
      when v_next_effective_date is null then null
      else v_next_effective_date - 1
    end,
    'schedule_version_created'
  );

  return new;
end;
$$;

create constraint trigger trigger_leave_recalculation_for_schedule_version
after insert on public.work_schedule_versions
deferrable initially deferred
for each row execute function public.trigger_leave_recalculation_for_schedule_version();

create or replace function public.trigger_leave_recalculation_for_holiday()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_date date;
  v_new_date date;
begin
  if tg_op = 'UPDATE' and old.active_version_id is not null then
    select holiday_date into v_old_date
    from public.holiday_calendar_versions
    where id = old.active_version_id;
  end if;

  if new.active_version_id is not null then
    select holiday_date into v_new_date
    from public.holiday_calendar_versions
    where id = new.active_version_id;
  end if;

  if v_old_date is not null then
    perform public.recalculate_approved_leave_for_holiday_date(
      v_old_date,
      'holiday_version_replaced'
    );
  end if;

  if v_new_date is not null
     and (v_old_date is null or v_new_date is distinct from v_old_date) then
    perform public.recalculate_approved_leave_for_holiday_date(
      v_new_date,
      'holiday_version_activated'
    );
  end if;

  return new;
end;
$$;

create constraint trigger trigger_leave_recalculation_for_holiday
after insert or update of active_version_id on public.holiday_calendar_groups
deferrable initially deferred
for each row execute function public.trigger_leave_recalculation_for_holiday();

revoke all on function public.trigger_leave_recalculation_for_schedule()
from public, anon, authenticated;
revoke all on function public.trigger_leave_recalculation_for_schedule_version()
from public, anon, authenticated;
revoke all on function public.trigger_leave_recalculation_for_holiday()
from public, anon, authenticated;

-- Phase 6 extends the existing attendance summaries with leave-aware day counts.
drop function if exists public.get_attendance_report_summary(text,date,date,uuid,uuid,text,boolean);
create or replace function public.get_attendance_report_summary(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false
)
returns table (
  employee_day_records bigint,
  scheduled_days bigint,
  present_days bigint,
  absent_days bigint,
  holiday_days bigint,
  paid_leave_days bigint,
  unpaid_leave_days bigint,
  missing_clock_out_days bigint,
  rest_day_worked_days bigint,
  unscheduled_attendance_days bigint,
  worked_minutes bigint,
  late_minutes bigint,
  undertime_minutes bigint,
  approved_overtime_minutes bigint,
  finalized_employee_day_records bigint,
  provisional_employee_day_records bigint,
  finalized_worked_minutes bigint,
  provisional_worked_minutes bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, 1, 25, false);
  if p_employment_status is not null and p_employment_status not in ('active', 'probation', 'on_leave', 'inactive', 'terminated') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EMPLOYMENT_STATUS';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (where source.is_scheduled_day)::bigint,
    count(*) filter (where source.attendance_status = 'present')::bigint,
    count(*) filter (where source.attendance_status = 'absent')::bigint,
    count(*) filter (where source.is_holiday)::bigint,
    count(*) filter (where source.attendance_status = 'paid_leave')::bigint,
    count(*) filter (where source.attendance_status = 'unpaid_leave')::bigint,
    count(*) filter (where source.attendance_status = 'missing_clock_out')::bigint,
    count(*) filter (where source.attendance_status = 'rest_day_worked')::bigint,
    count(*) filter (where source.attendance_status = 'unscheduled_attendance')::bigint,
    coalesce(sum(source.worked_minutes), 0)::bigint,
    coalesce(sum(source.late_minutes), 0)::bigint,
    coalesce(sum(source.undertime_minutes), 0)::bigint,
    coalesce(sum(source.total_approved_overtime_minutes), 0)::bigint,
    count(*) filter (where not source.is_provisional)::bigint,
    count(*) filter (where source.is_provisional)::bigint,
    coalesce(sum(source.worked_minutes) filter (where not source.is_provisional), 0)::bigint,
    coalesce(sum(source.worked_minutes) filter (where source.is_provisional), 0)::bigint
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')));
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;

drop function if exists public.get_employee_attendance_summary(text,date,date,uuid,uuid,text,boolean,boolean,integer,integer,boolean);
create or replace function public.get_employee_attendance_summary(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_include_employees_without_records boolean default false,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  job_title_id uuid,
  job_title_name text,
  employment_status text,
  report_start_date date,
  report_end_date date,
  employee_day_records bigint,
  scheduled_days bigint,
  present_days bigint,
  absent_days bigint,
  holiday_days bigint,
  paid_leave_days bigint,
  unpaid_leave_days bigint,
  missing_clock_out_days bigint,
  rest_day_worked_days bigint,
  unscheduled_attendance_days bigint,
  finalized_days bigint,
  provisional_days bigint,
  worked_minutes bigint,
  late_minutes bigint,
  undertime_minutes bigint,
  approved_pre_shift_minutes bigint,
  approved_post_shift_minutes bigint,
  approved_rest_day_minutes bigint,
  approved_holiday_work_minutes bigint,
  total_approved_overtime_minutes bigint,
  regular_holiday_work_minutes bigint,
  special_non_working_holiday_work_minutes bigint,
  company_holiday_work_minutes bigint,
  generated_at timestamptz,
  timezone text,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_total bigint;
begin
  perform public.report_validate_request(p_mode, p_start_date, p_end_date, p_page, p_page_size, p_export);
  if p_employment_status is not null and p_employment_status not in ('active', 'probation', 'on_leave', 'inactive', 'terminated') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EMPLOYMENT_STATUS';
  end if;

  with filtered_source as (
    select *
    from public.report_attendance_source_v1 as source
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
  ), employee_scope as (
    select employee.id as employee_id
    from public.employees as employee
    where p_include_employees_without_records
      and (p_department_id is null or employee.department_id = p_department_id)
      and (p_employee_id is null or employee.id = p_employee_id)
      and (p_employment_status is null or employee.employment_status::text = p_employment_status)
      and (not p_active_only or (employee.archived_at is null and employee.employment_status::text in ('active', 'probation', 'on_leave')))
    union
    select distinct source.employee_id from filtered_source as source
  )
  select count(*) into v_total from employee_scope;

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  with filtered_source as (
    select *
    from public.report_attendance_source_v1 as source
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
  ), employee_scope as (
    select employee.id as employee_id
    from public.employees as employee
    where p_include_employees_without_records
      and (p_department_id is null or employee.department_id = p_department_id)
      and (p_employee_id is null or employee.id = p_employee_id)
      and (p_employment_status is null or employee.employment_status::text = p_employment_status)
      and (not p_active_only or (employee.archived_at is null and employee.employment_status::text in ('active', 'probation', 'on_leave')))
    union
    select distinct source.employee_id from filtered_source as source
  )
  select
    employee.id, employee.employee_number,
    trim(concat_ws(' ', employee.first_name, employee.last_name)),
    employee.department_id, department.name, employee.job_title_id, job_title.title,
    employee.employment_status::text, p_start_date, p_end_date,
    count(source.attendance_calculation_revision_id)::bigint,
    count(*) filter (where source.is_scheduled_day)::bigint,
    count(*) filter (where source.attendance_status = 'present')::bigint,
    count(*) filter (where source.attendance_status = 'absent')::bigint,
    count(*) filter (where source.is_holiday)::bigint,
    count(*) filter (where source.attendance_status = 'paid_leave')::bigint,
    count(*) filter (where source.attendance_status = 'unpaid_leave')::bigint,
    count(*) filter (where source.attendance_status = 'missing_clock_out')::bigint,
    count(*) filter (where source.attendance_status = 'rest_day_worked')::bigint,
    count(*) filter (where source.attendance_status = 'unscheduled_attendance')::bigint,
    count(*) filter (where source.attendance_calculation_revision_id is not null and not source.is_provisional)::bigint,
    count(*) filter (where source.is_provisional)::bigint,
    coalesce(sum(source.worked_minutes), 0)::bigint,
    coalesce(sum(source.late_minutes), 0)::bigint,
    coalesce(sum(source.undertime_minutes), 0)::bigint,
    coalesce(sum(source.pre_shift_approved_minutes), 0)::bigint,
    coalesce(sum(source.post_shift_approved_minutes), 0)::bigint,
    coalesce(sum(source.rest_day_approved_minutes), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes), 0)::bigint,
    coalesce(sum(source.total_approved_overtime_minutes), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'regular_holiday'), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'special_non_working_holiday'), 0)::bigint,
    coalesce(sum(source.holiday_work_approved_minutes) filter (where source.holiday_type = 'company_holiday'), 0)::bigint,
    now(), 'Asia/Manila', v_total
  from employee_scope as scope
  join public.employees as employee on employee.id = scope.employee_id
  left join public.departments as department on department.id = employee.department_id
  left join public.job_titles as job_title on job_title.id = employee.job_title_id
  left join filtered_source as source on source.employee_id = employee.id
  group by employee.id, employee.employee_number, employee.first_name, employee.last_name,
    employee.department_id, department.name, employee.job_title_id, job_title.title,
    employee.employment_status
  order by employee.employee_number asc, employee.id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;

create or replace function public.record_attendance_report_export(
  p_export_dataset text,
  p_export_format text,
  p_report_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id_filter uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_include_employees_without_records boolean default false,
  p_row_count integer default 0,
  p_sheet_row_counts jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := public.report_require_hr();
  v_id uuid;
  v_action text;
  v_metadata jsonb;
begin
  perform public.report_validate_request(p_report_mode, p_start_date, p_end_date, 1, 25, true);
  if p_export_format not in ('csv', 'xlsx') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXPORT_FORMAT';
  end if;
  if p_export_dataset not in ('daily', 'employee_summary', 'exceptions', 'overtime_holiday', 'leave_balances', 'leave_usage', 'leave_conflicts', 'workbook') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXPORT_DATASET';
  end if;
  if p_report_mode <> 'payroll' then
    raise exception using errcode = 'P0001', message = 'REPORT_EXPORT_REQUIRES_PAYROLL';
  end if;
  if p_row_count < 0
    or (p_export_format = 'csv' and p_row_count > 25000)
    or (p_export_format = 'xlsx' and p_row_count > 100000) then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;
  if p_sheet_row_counts is not null and jsonb_typeof(p_sheet_row_counts) <> 'object' then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_AUDIT_PAYLOAD';
  end if;
  if p_sheet_row_counts is not null and exists (
    select 1
    from jsonb_each_text(p_sheet_row_counts) as item
    where item.value !~ '^\d+$'
      or item.value::integer > 25000
  ) then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  v_action := case
    when p_export_dataset like 'leave_%' and p_export_format = 'csv' then 'leave_report.csv_exported'
    when p_export_dataset like 'leave_%' then 'leave_report.xlsx_exported'
    when p_export_format = 'csv' then 'attendance_report.csv_exported'
    else 'attendance_report.xlsx_exported'
  end;
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'export_dataset', p_export_dataset,
    'export_format', p_export_format,
    'report_mode', p_report_mode,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'department_id', p_department_id,
    'employee_id_filter', p_employee_id_filter,
    'employment_status', p_employment_status,
    'active_only', p_active_only,
    'include_employees_without_records', p_include_employees_without_records,
    'row_count', p_row_count,
    'sheet_row_counts', p_sheet_row_counts,
    'timezone', 'Asia/Manila'
  ));

  insert into public.employee_audit_logs (
    employee_id, actor_profile_id, action, entity_type, entity_id,
    changed_fields, before_values, after_values, metadata, source
  ) values (
    null, v_actor, v_action,
    case when p_export_dataset like 'leave_%' then 'leave_report' else 'attendance_report' end, null,
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, v_metadata, 'application'
  ) returning id into v_id;
  return v_id;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_AUDIT_FAILED';
end;
$$;

revoke all on function public.get_attendance_report_summary(text,date,date,uuid,uuid,text,boolean) from public, anon;
revoke all on function public.get_employee_attendance_summary(text,date,date,uuid,uuid,text,boolean,boolean,integer,integer,boolean) from public, anon;
grant execute on function public.get_attendance_report_summary(text,date,date,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.get_employee_attendance_summary(text,date,date,uuid,uuid,text,boolean,boolean,integer,integer,boolean) to authenticated;

create or replace function public.get_leave_balance_report(
  p_leave_year integer,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  leave_year integer,
  allocated_units numeric,
  carryover_units numeric,
  adjustment_units numeric,
  used_units numeric,
  pending_units numeric,
  available_units numeric,
  carryover_expires date,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  if p_leave_year is null or p_leave_year not between 2000 and 2200 then
    raise exception using errcode = 'P0001', message = 'REPORT_DATE_RANGE_INVALID';
  end if;
  return query
  with ledger_totals as (
    select
      account.id as balance_account_id,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'annual_allocation'), 0) as allocated_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type = 'carryover'), 0) as carryover_units,
      coalesce(sum(ledger.units) filter (where ledger.entry_type in ('hr_adjustment_credit','hr_adjustment_debit')), 0) as adjustment_units,
      abs(coalesce(sum(ledger.units) filter (where ledger.entry_type in ('approved_leave_charge','recalculation_charge')), 0))
        - coalesce(sum(ledger.units) filter (where ledger.entry_type in ('cancellation_restoration','attendance_conflict_release','recalculation_release')), 0)
        as used_units,
      min(ledger.expires_on) filter (where ledger.entry_type = 'carryover' and ledger.expires_on >= current_date) as carryover_expires,
      coalesce(sum(ledger.units), 0) as ledger_balance
    from public.leave_balance_accounts as account
    left join public.leave_balance_ledger as ledger on ledger.balance_account_id = account.id
    group by account.id
  ), pending as (
    select reservation.employee_id, reservation.leave_type_id, reservation.leave_year,
      sum(reservation.reserved_units) as pending_units
    from public.leave_pending_reservations as reservation
    group by reservation.employee_id, reservation.leave_type_id, reservation.leave_year
  )
  select
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    active_policy.name,
    account.leave_year,
    totals.allocated_units,
    totals.carryover_units,
    totals.adjustment_units,
    greatest(totals.used_units, 0),
    coalesce(pending.pending_units, 0),
    totals.ledger_balance - coalesce(pending.pending_units, 0),
    totals.carryover_expires,
    count(*) over ()
  from public.leave_balance_accounts as account
  join public.employees as employee on employee.id = account.employee_id
  left join public.departments as department on department.id = employee.department_id
  join public.leave_types as leave_type on leave_type.id = account.leave_type_id
  join lateral public.resolve_leave_type_version(
    leave_type.id,
    case
      when account.leave_year < extract(year from current_date)::integer then make_date(account.leave_year, 12, 31)
      when account.leave_year = extract(year from current_date)::integer then current_date
      else make_date(account.leave_year, 1, 1)
    end
  ) as active_policy on true
  join ledger_totals as totals on totals.balance_account_id = account.id
  left join pending on pending.employee_id = account.employee_id
    and pending.leave_type_id = account.leave_type_id
    and pending.leave_year = account.leave_year
  where account.leave_year = p_leave_year
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_leave_type_id is null or leave_type.id = p_leave_type_id)
  order by employee.last_name, employee.first_name, active_policy.name
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 25000);
end;
$$;

create or replace function public.get_leave_usage_report(
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_leave_type_id uuid default null,
  p_status text default null,
  p_paid_state text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  request_group_id uuid,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  paid_state text,
  start_date date,
  end_date date,
  duration_mode text,
  status text,
  requested_units numeric,
  chargeable_units numeric,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  perform public.report_validate_request('payroll', p_start_date, p_end_date, 1, 25, false);
  if p_status is not null and p_status not in ('draft','pending','approved','rejected','withdrawn','cancelled','superseded') then
    raise exception using errcode = 'P0001', message = 'LEAVE_REQUEST_STATUS_INVALID';
  end if;
  if p_paid_state is not null and p_paid_state not in ('paid','unpaid') then
    raise exception using errcode = 'P0001', message = 'LEAVE_PAID_STATE_INVALID';
  end if;

  return query
  with action_times as (
    select
      action.request_group_id,
      min(action.created_at) filter (where action.action_type = 'submitted') as submitted_at,
      max(action.created_at) filter (where action.action_type in ('approved','rejected')) as reviewed_at
    from public.leave_request_actions as action
    group by action.request_group_id
  ), unit_totals as (
    select
      request_day.request_revision_id,
      sum(day_revision.chargeable_units) as chargeable_units
    from public.leave_request_days as request_day
    join public.leave_request_day_revisions as day_revision
      on day_revision.id = request_day.active_revision_id
    group by request_day.request_revision_id
  )
  select
    request_group.id,
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    policy.name,
    case when policy.is_paid then 'paid' else 'unpaid' end,
    request_revision.start_date,
    request_revision.end_date,
    request_revision.duration_mode,
    request_group.current_status,
    request_revision.requested_units,
    coalesce(unit_totals.chargeable_units, 0),
    action_times.submitted_at,
    action_times.reviewed_at,
    count(*) over ()
  from public.leave_request_groups as request_group
  join public.leave_request_revisions as request_revision
    on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy
    on policy.id = request_revision.leave_type_version_id
  join public.leave_types as leave_type
    on leave_type.id = policy.leave_type_id
  join public.employees as employee
    on employee.id = request_group.employee_id
  left join public.departments as department
    on department.id = employee.department_id
  left join action_times on action_times.request_group_id = request_group.id
  left join unit_totals on unit_totals.request_revision_id = request_revision.id
  where daterange(request_revision.start_date, request_revision.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_leave_type_id is null or leave_type.id = p_leave_type_id)
    and (p_status is null or request_group.current_status = p_status)
    and (
      p_paid_state is null
      or (p_paid_state = 'paid' and policy.is_paid)
      or (p_paid_state = 'unpaid' and not policy.is_paid)
    )
  order by request_revision.start_date desc, employee.last_name, employee.first_name, request_group.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 25000);
end;
$$;

create or replace function public.get_leave_conflict_report(
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_conflict_type text default null,
  p_conflict_status text default null,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  conflict_id uuid,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  leave_type_id uuid,
  leave_type_name text,
  leave_date date,
  conflict_type text,
  conflict_status text,
  attendance_status text,
  balance_action text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'LEAVE_PERMISSION_DENIED';
  end if;
  perform public.report_validate_request('payroll', p_start_date, p_end_date, 1, 25, false);
  if p_conflict_type is not null and p_conflict_type not in (
    'full_day_completed_attendance','full_day_incomplete_attendance','half_day_covered_time_overlap',
    'schedule_recalculation_failed','holiday_recalculation_failed','insufficient_balance_after_recalculation'
  ) then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_TYPE_INVALID';
  end if;
  if p_conflict_status is not null and p_conflict_status not in ('open','resolved','superseded') then
    raise exception using errcode = 'P0001', message = 'LEAVE_CONFLICT_STATUS_INVALID';
  end if;

  return query
  select
    conflict.id,
    employee.id,
    employee.employee_number,
    concat_ws(' ', employee.first_name, employee.last_name),
    employee.department_id,
    department.name,
    leave_type.id,
    policy.name,
    request_day.leave_date,
    conflict.conflict_type,
    conflict.status,
    attendance_revision.base_status,
    conflict.automatic_balance_action,
    conflict.created_at,
    count(*) over ()
  from public.leave_attendance_conflicts as conflict
  join public.employees as employee on employee.id = conflict.employee_id
  left join public.departments as department on department.id = employee.department_id
  join public.leave_request_groups as request_group on request_group.id = conflict.request_group_id
  join public.leave_request_revisions as request_revision on request_revision.id = request_group.active_revision_id
  join public.leave_type_versions as policy on policy.id = request_revision.leave_type_version_id
  join public.leave_types as leave_type on leave_type.id = policy.leave_type_id
  join public.leave_request_days as request_day on request_day.id = conflict.request_day_id
  left join public.attendance_calculation_revisions as attendance_revision
    on attendance_revision.id = conflict.attendance_calculation_revision_id
  where request_day.leave_date between p_start_date and p_end_date
    and (p_department_id is null or employee.department_id = p_department_id)
    and (p_employee_id is null or employee.id = p_employee_id)
    and (p_conflict_type is null or conflict.conflict_type = p_conflict_type)
    and (p_conflict_status is null or conflict.status = p_conflict_status)
  order by request_day.leave_date desc, employee.last_name, employee.first_name, conflict.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 50), 1), 25000);
end;
$$;

revoke all on function public.get_leave_balance_report(integer,uuid,uuid,uuid,integer,integer)
from public, anon;
revoke all on function public.get_leave_usage_report(date,date,uuid,uuid,uuid,text,text,integer,integer)
from public, anon;
revoke all on function public.get_leave_conflict_report(date,date,uuid,uuid,text,text,integer,integer)
from public, anon;

grant execute on function public.get_leave_balance_report(integer,uuid,uuid,uuid,integer,integer)
to authenticated;
grant execute on function public.get_leave_usage_report(date,date,uuid,uuid,uuid,text,text,integer,integer)
to authenticated;
grant execute on function public.get_leave_conflict_report(date,date,uuid,uuid,text,text,integer,integer)
to authenticated;


notify pgrst, 'reload schema';
commit;
