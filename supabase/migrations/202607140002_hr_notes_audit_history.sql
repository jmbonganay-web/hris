-- Phase 4B-2: encrypted HR notes and immutable employee audit history.

create table if not exists public.employee_hr_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null,
  content_ciphertext text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  constraint employee_hr_notes_category_check
    check (category in (
      'general',
      'performance',
      'disciplinary',
      'medical',
      'payroll'
    ))
);

create index if not exists employee_hr_notes_employee_active_idx
  on public.employee_hr_notes(employee_id, deleted_at, created_at desc);
create index if not exists employee_hr_notes_employee_category_idx
  on public.employee_hr_notes(employee_id, category, created_at desc);
create index if not exists employee_hr_notes_created_by_idx
  on public.employee_hr_notes(created_by);

create table if not exists public.employee_audit_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields jsonb not null default '[]'::jsonb,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source text not null,
  created_at timestamptz not null default now(),
  constraint employee_audit_logs_source_check
    check (source in ('application', 'database_trigger')),
  constraint employee_audit_logs_changed_fields_array_check
    check (jsonb_typeof(changed_fields) = 'array'),
  constraint employee_audit_logs_before_object_check
    check (jsonb_typeof(before_values) = 'object'),
  constraint employee_audit_logs_after_object_check
    check (jsonb_typeof(after_values) = 'object'),
  constraint employee_audit_logs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists employee_audit_logs_employee_created_idx
  on public.employee_audit_logs(employee_id, created_at desc, id desc);
create index if not exists employee_audit_logs_employee_entity_idx
  on public.employee_audit_logs(employee_id, entity_type, created_at desc);
create index if not exists employee_audit_logs_action_idx
  on public.employee_audit_logs(action, created_at desc);
create index if not exists employee_audit_logs_actor_idx
  on public.employee_audit_logs(actor_profile_id, created_at desc);

alter table public.employee_hr_notes enable row level security;
alter table public.employee_audit_logs enable row level security;

drop policy if exists "HR can view permitted HR notes"
  on public.employee_hr_notes;
create policy "HR can view permitted HR notes"
on public.employee_hr_notes
for select to authenticated
using (
  public.is_hr_admin()
  and (deleted_at is null or public.is_super_admin())
);

drop policy if exists "HR can create HR notes"
  on public.employee_hr_notes;
create policy "HR can create HR notes"
on public.employee_hr_notes
for insert to authenticated
with check (
  public.is_hr_admin()
  and created_by = auth.uid()
  and deleted_at is null
  and deleted_by is null
);

drop policy if exists "HR can update permitted HR notes"
  on public.employee_hr_notes;
create policy "HR can update permitted HR notes"
on public.employee_hr_notes
for update to authenticated
using (
  public.is_super_admin()
  or (
    public.current_user_role() = 'hr_admin'
    and created_by = auth.uid()
    and deleted_at is null
  )
)
with check (
  public.is_super_admin()
  or (
    public.current_user_role() = 'hr_admin'
    and created_by = auth.uid()
    and (deleted_at is null or deleted_by = auth.uid())
  )
);

-- No DELETE policy is created for employee_hr_notes.

drop policy if exists "HR can view employee audit logs"
  on public.employee_audit_logs;
create policy "HR can view employee audit logs"
on public.employee_audit_logs
for select to authenticated
using (public.is_hr_admin());

-- No INSERT, UPDATE, or DELETE policy is created for employee_audit_logs.

create or replace function public.write_employee_audit(
  p_employee_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_changed_fields jsonb default '[]'::jsonb,
  p_before_values jsonb default '{}'::jsonb,
  p_after_values jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_source text default 'database_trigger',
  p_actor_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if jsonb_typeof(p_changed_fields) <> 'array'
    or jsonb_typeof(p_before_values) <> 'object'
    or jsonb_typeof(p_after_values) <> 'object'
    or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Invalid audit payload';
  end if;

  if p_source not in ('application', 'database_trigger') then
    raise exception 'Invalid audit source';
  end if;

  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found';
  end if;

  insert into public.employee_audit_logs (
    employee_id,
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    changed_fields,
    before_values,
    after_values,
    metadata,
    source
  ) values (
    p_employee_id,
    p_actor_profile_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_changed_fields,
    p_before_values,
    p_after_values,
    p_metadata,
    p_source
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.write_employee_audit(
  uuid, text, text, uuid, jsonb, jsonb, jsonb, jsonb, text, uuid
) from public, anon, authenticated;

create or replace function public.employee_audit_label(p_employee_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), employee_number)
  from public.employees
  where id = p_employee_id
  limit 1;
$$;

create or replace function public.department_audit_label(p_department_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select name from public.departments where id = p_department_id limit 1;
$$;

create or replace function public.job_title_audit_label(p_job_title_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select title from public.job_titles where id = p_job_title_id limit 1;
$$;

revoke all on function public.employee_audit_label(uuid) from public, anon, authenticated;
revoke all on function public.department_audit_label(uuid) from public, anon, authenticated;
revoke all on function public.job_title_audit_label(uuid) from public, anon, authenticated;

create or replace function public.log_sensitive_data_reveal(
  p_employee_id uuid,
  p_field_name text,
  p_ip_address text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_field_name not in (
    'sss_number',
    'philhealth_number',
    'pagibig_number',
    'tin',
    'account_name',
    'account_number'
  ) then
    raise exception 'Invalid sensitive field';
  end if;

  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'Employee not found';
  end if;

  insert into public.sensitive_data_access_logs (
    actor_profile_id,
    employee_id,
    field_name,
    action,
    ip_address,
    user_agent
  ) values (
    v_actor,
    p_employee_id,
    p_field_name,
    'reveal',
    left(p_ip_address, 100),
    left(p_user_agent, 500)
  );

  perform public.write_employee_audit(
    p_employee_id,
    'sensitive_field.revealed',
    'sensitive_data',
    null,
    jsonb_build_array(p_field_name),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('field_name', p_field_name),
    'application',
    v_actor
  );
end;
$$;

revoke all on function public.log_sensitive_data_reveal(
  uuid, text, text, text
) from public, anon;
grant execute on function public.log_sensitive_data_reveal(
  uuid, text, text, text
) to authenticated;

drop policy if exists "HR can insert sensitive access logs"
  on public.sensitive_data_access_logs;


create or replace function public.enforce_hr_note_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.employee_id is distinct from old.employee_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'HR note ownership and creation metadata are immutable';
  end if;

  if old.deleted_at is not null
    and (
      new.category is distinct from old.category
      or new.content_ciphertext is distinct from old.content_ciphertext
    ) then
    raise exception 'Deleted HR notes cannot be edited';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_hr_note_immutability() from public, anon, authenticated;
drop trigger if exists enforce_hr_note_immutability on public.employee_hr_notes;
create trigger enforce_hr_note_immutability
before update on public.employee_hr_notes
for each row execute function public.enforce_hr_note_immutability();

create or replace function public.audit_employee_hr_note_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action text;
  v_changed jsonb := '[]'::jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'hr_note.created';
    v_changed := jsonb_build_array('category', 'content');
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'hr_note.deleted';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'hr_note.restored';
  else
    if old.category is distinct from new.category then
      v_changed := v_changed || jsonb_build_array('category');
    end if;
    if old.content_ciphertext is distinct from new.content_ciphertext then
      v_changed := v_changed || jsonb_build_array('content');
    end if;
    if jsonb_array_length(v_changed) = 0 then
      return new;
    end if;
    v_action := 'hr_note.updated';
  end if;

  perform public.write_employee_audit(
    new.employee_id,
    v_action,
    'hr_note',
    new.id,
    v_changed,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    'database_trigger',
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.audit_employee_hr_note_change() from public, anon, authenticated;
drop trigger if exists audit_employee_hr_note_change on public.employee_hr_notes;
create trigger audit_employee_hr_note_change
after insert or update on public.employee_hr_notes
for each row execute function public.audit_employee_hr_note_change();

create or replace function public.audit_employee_personal_details_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_changed jsonb := '[]'::jsonb;
begin
  if old.middle_name is distinct from new.middle_name then v_changed := v_changed || jsonb_build_array('middle_name'); end if;
  if old.preferred_name is distinct from new.preferred_name then v_changed := v_changed || jsonb_build_array('preferred_name'); end if;
  if old.date_of_birth is distinct from new.date_of_birth then v_changed := v_changed || jsonb_build_array('date_of_birth'); end if;
  if old.gender is distinct from new.gender then v_changed := v_changed || jsonb_build_array('gender'); end if;
  if old.civil_status is distinct from new.civil_status then v_changed := v_changed || jsonb_build_array('civil_status'); end if;
  if old.nationality is distinct from new.nationality then v_changed := v_changed || jsonb_build_array('nationality'); end if;
  if old.personal_email is distinct from new.personal_email then v_changed := v_changed || jsonb_build_array('personal_email'); end if;
  if old.phone is distinct from new.phone then v_changed := v_changed || jsonb_build_array('phone'); end if;
  if old.address_line_1 is distinct from new.address_line_1 then v_changed := v_changed || jsonb_build_array('address_line_1'); end if;
  if old.address_line_2 is distinct from new.address_line_2 then v_changed := v_changed || jsonb_build_array('address_line_2'); end if;
  if old.city is distinct from new.city then v_changed := v_changed || jsonb_build_array('city'); end if;
  if old.state_province is distinct from new.state_province then v_changed := v_changed || jsonb_build_array('state_province'); end if;
  if old.postal_code is distinct from new.postal_code then v_changed := v_changed || jsonb_build_array('postal_code'); end if;
  if old.country is distinct from new.country then v_changed := v_changed || jsonb_build_array('country'); end if;

  if jsonb_array_length(v_changed) > 0 then
    perform public.write_employee_audit(
      new.employee_id,
      'personal_details.updated',
      'personal_details',
      new.employee_id,
      v_changed,
      '{}'::jsonb,
      '{}'::jsonb,
      '{}'::jsonb,
      'database_trigger',
      auth.uid()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_employee_personal_details_change() from public, anon, authenticated;
drop trigger if exists audit_employee_personal_details_change on public.employee_personal_details;
create trigger audit_employee_personal_details_change
after update on public.employee_personal_details
for each row execute function public.audit_employee_personal_details_change();

create or replace function public.set_single_primary_emergency_contact()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.is_primary then
    perform set_config('app.audit_suppressed', 'true', true);
    update public.employee_emergency_contacts
    set is_primary = false, updated_at = now()
    where employee_id = new.employee_id
      and id <> new.id
      and is_primary = true;
    perform set_config('app.audit_suppressed', 'false', true);
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.audit_employee_emergency_contact_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid;
  v_entity_id uuid;
  v_action text;
  v_changed jsonb := '[]'::jsonb;
begin
  if current_setting('app.audit_suppressed', true) = 'true' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_employee_id := old.employee_id;
    v_entity_id := old.id;
  else
    v_employee_id := new.employee_id;
    v_entity_id := new.id;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'emergency_contact.created';
    v_changed := jsonb_build_array('full_name', 'relationship', 'phone', 'email', 'is_primary');
  elsif tg_op = 'DELETE' then
    v_action := 'emergency_contact.deleted';
  else
    if old.full_name is distinct from new.full_name then v_changed := v_changed || jsonb_build_array('full_name'); end if;
    if old.relationship is distinct from new.relationship then v_changed := v_changed || jsonb_build_array('relationship'); end if;
    if old.phone is distinct from new.phone then v_changed := v_changed || jsonb_build_array('phone'); end if;
    if old.email is distinct from new.email then v_changed := v_changed || jsonb_build_array('email'); end if;
    if old.is_primary is distinct from new.is_primary then v_changed := v_changed || jsonb_build_array('is_primary'); end if;
    if jsonb_array_length(v_changed) = 0 then return new; end if;
    v_action := 'emergency_contact.updated';
  end if;

  perform public.write_employee_audit(
    v_employee_id,
    v_action,
    'emergency_contact',
    v_entity_id,
    v_changed,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    'database_trigger',
    auth.uid()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_employee_emergency_contact_change() from public, anon, authenticated;
drop trigger if exists audit_employee_emergency_contact_change on public.employee_emergency_contacts;
create trigger audit_employee_emergency_contact_change
after insert or update or delete on public.employee_emergency_contacts
for each row execute function public.audit_employee_emergency_contact_change();

create or replace function public.audit_employee_sensitive_details_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_changed jsonb := '[]'::jsonb;
  v_only_clears boolean := true;
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.sss_ciphertext is not null then v_changed := v_changed || jsonb_build_array('sss_number'); v_only_clears := false; end if;
    if new.philhealth_ciphertext is not null then v_changed := v_changed || jsonb_build_array('philhealth_number'); v_only_clears := false; end if;
    if new.pagibig_ciphertext is not null then v_changed := v_changed || jsonb_build_array('pagibig_number'); v_only_clears := false; end if;
    if new.tin_ciphertext is not null then v_changed := v_changed || jsonb_build_array('tin'); v_only_clears := false; end if;
    if new.bank_name is not null then v_changed := v_changed || jsonb_build_array('bank_name'); v_only_clears := false; end if;
    if new.account_name_ciphertext is not null then v_changed := v_changed || jsonb_build_array('account_name'); v_only_clears := false; end if;
    if new.account_number_ciphertext is not null then v_changed := v_changed || jsonb_build_array('account_number'); v_only_clears := false; end if;
    if new.payroll_account_type is not null then v_changed := v_changed || jsonb_build_array('payroll_account_type'); v_only_clears := false; end if;
  else
    if old.sss_ciphertext is distinct from new.sss_ciphertext then v_changed := v_changed || jsonb_build_array('sss_number'); if new.sss_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.philhealth_ciphertext is distinct from new.philhealth_ciphertext then v_changed := v_changed || jsonb_build_array('philhealth_number'); if new.philhealth_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.pagibig_ciphertext is distinct from new.pagibig_ciphertext then v_changed := v_changed || jsonb_build_array('pagibig_number'); if new.pagibig_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.tin_ciphertext is distinct from new.tin_ciphertext then v_changed := v_changed || jsonb_build_array('tin'); if new.tin_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.bank_name is distinct from new.bank_name then v_changed := v_changed || jsonb_build_array('bank_name'); if new.bank_name is not null then v_only_clears := false; end if; end if;
    if old.account_name_ciphertext is distinct from new.account_name_ciphertext then v_changed := v_changed || jsonb_build_array('account_name'); if new.account_name_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.account_number_ciphertext is distinct from new.account_number_ciphertext then v_changed := v_changed || jsonb_build_array('account_number'); if new.account_number_ciphertext is not null then v_only_clears := false; end if; end if;
    if old.payroll_account_type is distinct from new.payroll_account_type then v_changed := v_changed || jsonb_build_array('payroll_account_type'); if new.payroll_account_type is not null then v_only_clears := false; end if; end if;
  end if;

  if jsonb_array_length(v_changed) = 0 then return new; end if;
  v_action := case when v_only_clears then 'sensitive_details.cleared' else 'sensitive_details.updated' end;

  perform public.write_employee_audit(
    new.employee_id,
    v_action,
    'sensitive_data',
    new.id,
    v_changed,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    'database_trigger',
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.audit_employee_sensitive_details_change() from public, anon, authenticated;
drop trigger if exists audit_employee_sensitive_details_change on public.employee_sensitive_details;
create trigger audit_employee_sensitive_details_change
after insert or update on public.employee_sensitive_details
for each row execute function public.audit_employee_sensitive_details_change();

create or replace function public.audit_employee_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action text;
  v_entity_type text;
  v_changed jsonb := '[]'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
begin
  if old.archived_at is null and new.archived_at is not null then
    v_action := 'employee.archived';
    v_entity_type := 'employee';
    v_changed := jsonb_build_array('archived_at');
  elsif old.archived_at is not null and new.archived_at is null then
    v_action := 'employee.restored';
    v_entity_type := 'employee';
    v_changed := jsonb_build_array('archived_at');
  elsif old.manager_id is distinct from new.manager_id then
    v_action := 'manager.changed';
    v_entity_type := 'manager';
    v_changed := jsonb_build_array('manager_id');
    v_before := jsonb_build_object(
      'manager_id', jsonb_build_object(
        'id', old.manager_id,
        'label', coalesce(public.employee_audit_label(old.manager_id), 'Not assigned')
      )
    );
    v_after := jsonb_build_object(
      'manager_id', jsonb_build_object(
        'id', new.manager_id,
        'label', coalesce(public.employee_audit_label(new.manager_id), 'Not assigned')
      )
    );
  elsif old.avatar_path is distinct from new.avatar_path then
    v_entity_type := 'avatar';
    v_changed := jsonb_build_array('avatar');
    if old.avatar_path is null and new.avatar_path is not null then
      v_action := 'avatar.uploaded';
    elsif old.avatar_path is not null and new.avatar_path is null then
      v_action := 'avatar.removed';
    else
      v_action := 'avatar.replaced';
    end if;
  else
    if old.department_id is distinct from new.department_id then
      v_changed := v_changed || jsonb_build_array('department_id');
      v_before := v_before || jsonb_build_object('department_id', jsonb_build_object('id', old.department_id, 'label', coalesce(public.department_audit_label(old.department_id), 'Not assigned')));
      v_after := v_after || jsonb_build_object('department_id', jsonb_build_object('id', new.department_id, 'label', coalesce(public.department_audit_label(new.department_id), 'Not assigned')));
    end if;
    if old.job_title_id is distinct from new.job_title_id then
      v_changed := v_changed || jsonb_build_array('job_title_id');
      v_before := v_before || jsonb_build_object('job_title_id', jsonb_build_object('id', old.job_title_id, 'label', coalesce(public.job_title_audit_label(old.job_title_id), 'Not assigned')));
      v_after := v_after || jsonb_build_object('job_title_id', jsonb_build_object('id', new.job_title_id, 'label', coalesce(public.job_title_audit_label(new.job_title_id), 'Not assigned')));
    end if;
    if old.employment_type is distinct from new.employment_type then v_changed := v_changed || jsonb_build_array('employment_type'); v_before := v_before || jsonb_build_object('employment_type', old.employment_type); v_after := v_after || jsonb_build_object('employment_type', new.employment_type); end if;
    if old.employment_status is distinct from new.employment_status then v_changed := v_changed || jsonb_build_array('employment_status'); v_before := v_before || jsonb_build_object('employment_status', old.employment_status); v_after := v_after || jsonb_build_object('employment_status', new.employment_status); end if;
    if old.hire_date is distinct from new.hire_date then v_changed := v_changed || jsonb_build_array('hire_date'); v_before := v_before || jsonb_build_object('hire_date', old.hire_date); v_after := v_after || jsonb_build_object('hire_date', new.hire_date); end if;
    if old.probation_end_date is distinct from new.probation_end_date then v_changed := v_changed || jsonb_build_array('probation_end_date'); v_before := v_before || jsonb_build_object('probation_end_date', old.probation_end_date); v_after := v_after || jsonb_build_object('probation_end_date', new.probation_end_date); end if;
    if old.regularization_date is distinct from new.regularization_date then v_changed := v_changed || jsonb_build_array('regularization_date'); v_before := v_before || jsonb_build_object('regularization_date', old.regularization_date); v_after := v_after || jsonb_build_object('regularization_date', new.regularization_date); end if;
    if old.work_location is distinct from new.work_location then v_changed := v_changed || jsonb_build_array('work_location'); v_before := v_before || jsonb_build_object('work_location', old.work_location); v_after := v_after || jsonb_build_object('work_location', new.work_location); end if;
    if old.work_schedule is distinct from new.work_schedule then v_changed := v_changed || jsonb_build_array('work_schedule'); v_before := v_before || jsonb_build_object('work_schedule', old.work_schedule); v_after := v_after || jsonb_build_object('work_schedule', new.work_schedule); end if;

    if jsonb_array_length(v_changed) = 0 then return new; end if;
    v_action := 'employment_details.updated';
    v_entity_type := 'employment';
  end if;

  perform public.write_employee_audit(
    new.id,
    v_action,
    v_entity_type,
    new.id,
    v_changed,
    v_before,
    v_after,
    '{}'::jsonb,
    'database_trigger',
    auth.uid()
  );
  return new;
end;
$$;

revoke all on function public.audit_employee_change() from public, anon, authenticated;
drop trigger if exists audit_employee_change on public.employees;
create trigger audit_employee_change
after update on public.employees
for each row execute function public.audit_employee_change();

notify pgrst, 'reload schema';
