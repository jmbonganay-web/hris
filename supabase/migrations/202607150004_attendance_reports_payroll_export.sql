begin;

create index if not exists attendance_report_group_date_idx
  on public.attendance_calculation_groups(attendance_date desc, employee_id, active_revision_id);
create index if not exists attendance_report_revision_state_idx
  on public.attendance_calculation_revisions(is_provisional, base_status, id);
create index if not exists overtime_report_group_date_idx
  on public.overtime_detection_groups(attendance_date desc, employee_id, segment_type, active_revision_id);
create index if not exists overtime_report_approval_active_idx
  on public.overtime_approval_items(detection_revision_id, status, superseded_at)
  include (approved_minutes, detected_minutes, reviewed_at);

create or replace function public.report_require_hr()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'REPORT_UNAUTHORIZED';
  end if;
  return v_actor;
end;
$$;

create or replace function public.report_validate_request(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_page integer,
  p_page_size integer,
  p_export boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_days integer;
begin
  perform public.report_require_hr();
  if p_mode not in ('operational', 'payroll') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_MODE';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_DATE_RANGE';
  end if;
  if p_end_date > public.company_attendance_date(now()) then
    raise exception using errcode = 'P0001', message = 'REPORT_FUTURE_DATE';
  end if;
  v_days := (p_end_date - p_start_date) + 1;
  if p_mode = 'operational' and v_days > 31 then
    raise exception using errcode = 'P0001', message = 'REPORT_OPERATIONAL_RANGE_LIMIT';
  end if;
  if p_mode = 'payroll' and v_days > 366 then
    raise exception using errcode = 'P0001', message = 'REPORT_PAYROLL_RANGE_LIMIT';
  end if;
  if p_export and p_mode <> 'payroll' then
    raise exception using errcode = 'P0001', message = 'REPORT_EXPORT_REQUIRES_PAYROLL';
  end if;
  if not p_export and (p_page is null or p_page < 1) then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_PAGE';
  end if;
  if not p_export and p_page_size not in (25, 50, 100) then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_PAGE_SIZE';
  end if;
end;
$$;

create or replace view public.report_attendance_source_v1
with (security_barrier = true)
as
select
  group_row.attendance_date,
  employee.id as employee_id,
  employee.employee_number,
  trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
  employee.department_id,
  department.name as department_name,
  employee.job_title_id,
  job_title.title as job_title_name,
  employee.employment_status::text as employment_status,
  employee.archived_at,
  revision.base_status as attendance_status,
  case when revision.is_provisional then 'provisional' else 'finalized' end as calculation_state,
  revision.is_provisional,
  revision.is_holiday,
  revision.holiday_name,
  revision.holiday_type,
  revision.scheduled_start_at is not null and revision.scheduled_end_at is not null as is_scheduled_day,
  revision.scheduled_start_at as scheduled_start,
  revision.scheduled_end_at as scheduled_end,
  revision.actual_clock_in_at as clock_in,
  revision.actual_clock_out_at as clock_out,
  revision.worked_minutes,
  revision.late_minutes,
  revision.undertime_minutes,
  revision.is_late,
  revision.is_undertime,
  revision.is_corrected,
  revision.is_recalculated,
  overtime.pre_shift_detected_minutes,
  overtime.pre_shift_approved_minutes,
  overtime.pre_shift_status,
  overtime.post_shift_detected_minutes,
  overtime.post_shift_approved_minutes,
  overtime.post_shift_status,
  overtime.rest_day_detected_minutes,
  overtime.rest_day_approved_minutes,
  overtime.rest_day_status,
  overtime.holiday_work_detected_minutes,
  overtime.holiday_work_approved_minutes,
  overtime.holiday_work_status,
  coalesce(overtime.total_approved_overtime_minutes, 0)::integer as total_approved_overtime_minutes,
  revision.attendance_record_id,
  revision.id as attendance_calculation_revision_id
from public.attendance_calculation_groups as group_row
join public.attendance_calculation_revisions as revision
  on revision.id = group_row.active_revision_id
join public.employees as employee
  on employee.id = group_row.employee_id
left join public.departments as department
  on department.id = employee.department_id
left join public.job_titles as job_title
  on job_title.id = employee.job_title_id
left join lateral (
  select
    max(detection.detected_minutes) filter (where detection.segment_type = 'pre_shift')::integer as pre_shift_detected_minutes,
    max(case when detection.segment_type = 'pre_shift' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'pre_shift')::integer as pre_shift_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'pre_shift') as pre_shift_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'post_shift')::integer as post_shift_detected_minutes,
    max(case when detection.segment_type = 'post_shift' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'post_shift')::integer as post_shift_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'post_shift') as post_shift_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'rest_day')::integer as rest_day_detected_minutes,
    max(case when detection.segment_type = 'rest_day' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'rest_day')::integer as rest_day_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'rest_day') as rest_day_status,
    max(detection.detected_minutes) filter (where detection.segment_type = 'holiday_work')::integer as holiday_work_detected_minutes,
    max(case when detection.segment_type = 'holiday_work' and approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)
      filter (where detection.segment_type = 'holiday_work')::integer as holiday_work_approved_minutes,
    max(approval.status) filter (where detection.segment_type = 'holiday_work') as holiday_work_status,
    sum(case when approval.status = 'approved' and approval.superseded_at is null then approval.approved_minutes else 0 end)::integer as total_approved_overtime_minutes
  from public.overtime_detection_groups as detection_group
  join public.overtime_detection_revisions as detection
    on detection.id = detection_group.active_revision_id
   and detection.is_active
  left join public.overtime_approval_items as approval
    on approval.detection_revision_id = detection.id
  where detection_group.employee_id = group_row.employee_id
    and detection_group.attendance_date = group_row.attendance_date
) as overtime on true;

create or replace view public.report_overtime_source_v1
with (security_barrier = true)
as
select
  group_row.attendance_date,
  employee.id as employee_id,
  employee.employee_number,
  trim(concat_ws(' ', employee.first_name, employee.last_name)) as employee_name,
  employee.department_id,
  department.name as department_name,
  employee.job_title_id,
  job_title.title as job_title_name,
  employee.employment_status::text as employment_status,
  employee.archived_at,
  revision.segment_type,
  holiday.holiday_name,
  holiday.holiday_type,
  revision.detected_start_at as detected_start,
  revision.detected_end_at as detected_end,
  revision.detected_minutes,
  coalesce(approval.approved_minutes, 0)::integer as approved_minutes,
  approval.status as approval_status,
  approval.reviewed_at,
  (group_row.active_revision_id = revision.id and revision.is_active) as is_active_detection,
  (group_row.active_revision_id <> revision.id or not revision.is_active or coalesce(approval.status = 'superseded', false) or approval.superseded_at is not null) as is_superseded,
  revision.attendance_calculation_revision_id,
  revision.id as detection_revision_id,
  approval.id as approval_item_id
from public.overtime_detection_revisions as revision
join public.overtime_detection_groups as group_row
  on group_row.id = revision.detection_group_id
join public.employees as employee
  on employee.id = group_row.employee_id
left join public.departments as department
  on department.id = employee.department_id
left join public.job_titles as job_title
  on job_title.id = employee.job_title_id
left join public.holiday_calendar_versions as holiday
  on holiday.id = revision.holiday_version_id
left join public.overtime_approval_items as approval
  on approval.detection_revision_id = revision.id;


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

create or replace function public.get_attendance_daily_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_attendance_status text default null,
  p_calculation_state text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date,
  employee_id uuid,
  employee_number text,
  employee_name text,
  department_id uuid,
  department_name text,
  job_title_id uuid,
  job_title_name text,
  employment_status text,
  attendance_status text,
  calculation_state text,
  is_provisional boolean,
  is_holiday boolean,
  holiday_name text,
  holiday_type text,
  is_scheduled_day boolean,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  clock_in timestamptz,
  clock_out timestamptz,
  worked_minutes integer,
  late_minutes integer,
  undertime_minutes integer,
  is_late boolean,
  is_undertime boolean,
  is_corrected boolean,
  is_recalculated boolean,
  pre_shift_detected_minutes integer,
  pre_shift_approved_minutes integer,
  pre_shift_status text,
  post_shift_detected_minutes integer,
  post_shift_approved_minutes integer,
  post_shift_status text,
  rest_day_detected_minutes integer,
  rest_day_approved_minutes integer,
  rest_day_status text,
  holiday_work_detected_minutes integer,
  holiday_work_approved_minutes integer,
  holiday_work_status text,
  total_approved_overtime_minutes integer,
  attendance_record_id uuid,
  attendance_calculation_revision_id uuid,
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
  if p_attendance_status is not null and p_attendance_status not in ('present', 'absent', 'holiday', 'missing_clock_out', 'rest_day_worked', 'unscheduled_attendance') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_ATTENDANCE_STATUS';
  end if;
  if p_calculation_state is not null and p_calculation_state not in ('finalized', 'provisional') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_CALCULATION_STATE';
  end if;

  select count(*) into v_total
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_attendance_status is null or source.attendance_status = p_attendance_status)
    and (p_calculation_state is null or source.calculation_state = p_calculation_state);

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  select
    source.attendance_date, source.employee_id, source.employee_number, source.employee_name,
    source.department_id, source.department_name, source.job_title_id, source.job_title_name,
    source.employment_status, source.attendance_status, source.calculation_state,
    source.is_provisional, source.is_holiday, source.holiday_name, source.holiday_type,
    source.is_scheduled_day, source.scheduled_start, source.scheduled_end, source.clock_in,
    source.clock_out, source.worked_minutes, source.late_minutes, source.undertime_minutes,
    source.is_late, source.is_undertime, source.is_corrected, source.is_recalculated,
    source.pre_shift_detected_minutes, source.pre_shift_approved_minutes, source.pre_shift_status,
    source.post_shift_detected_minutes, source.post_shift_approved_minutes, source.post_shift_status,
    source.rest_day_detected_minutes, source.rest_day_approved_minutes, source.rest_day_status,
    source.holiday_work_detected_minutes, source.holiday_work_approved_minutes, source.holiday_work_status,
    source.total_approved_overtime_minutes, source.attendance_record_id,
    source.attendance_calculation_revision_id, now(), 'Asia/Manila', v_total
  from public.report_attendance_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_mode = 'operational' or source.is_provisional = false)
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_attendance_status is null or source.attendance_status = p_attendance_status)
    and (p_calculation_state is null or source.calculation_state = p_calculation_state)
  order by source.attendance_date desc, source.employee_number asc, source.attendance_calculation_revision_id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;


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


create or replace function public.get_attendance_exception_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_exception_type text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date, employee_id uuid, employee_number text, employee_name text,
  department_id uuid, department_name text, job_title_id uuid, job_title_name text,
  employment_status text, exception_type text, attendance_status text,
  calculation_state text, clock_in timestamptz, clock_out timestamptz,
  worked_minutes integer, late_minutes integer, undertime_minutes integer,
  is_corrected boolean, is_recalculated boolean,
  attendance_calculation_revision_id uuid, total_count bigint
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
  if p_exception_type is not null and p_exception_type not in ('absent', 'missing_clock_out', 'provisional_or_incomplete', 'unscheduled_attendance', 'late', 'undertime') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_EXCEPTION_TYPE';
  end if;

  with exception_rows as (
    select source.*, exception.exception_type
    from public.report_attendance_source_v1 as source
    cross join lateral (
      select 'absent'::text as exception_type where source.attendance_status = 'absent'
      union all select 'missing_clock_out' where source.attendance_status = 'missing_clock_out'
      union all select 'provisional_or_incomplete' where source.is_provisional
      union all select 'unscheduled_attendance' where source.attendance_status = 'unscheduled_attendance'
      union all select 'late' where source.is_late or coalesce(source.late_minutes, 0) > 0
      union all select 'undertime' where source.is_undertime or coalesce(source.undertime_minutes, 0) > 0
    ) as exception
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
      and (p_exception_type is null or exception.exception_type = p_exception_type)
  )
  select count(*) into v_total from exception_rows;

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  with exception_rows as (
    select source.*, exception.exception_type
    from public.report_attendance_source_v1 as source
    cross join lateral (
      select 'absent'::text as exception_type where source.attendance_status = 'absent'
      union all select 'missing_clock_out' where source.attendance_status = 'missing_clock_out'
      union all select 'provisional_or_incomplete' where source.is_provisional
      union all select 'unscheduled_attendance' where source.attendance_status = 'unscheduled_attendance'
      union all select 'late' where source.is_late or coalesce(source.late_minutes, 0) > 0
      union all select 'undertime' where source.is_undertime or coalesce(source.undertime_minutes, 0) > 0
    ) as exception
    where source.attendance_date between p_start_date and p_end_date
      and (p_mode = 'operational' or source.is_provisional = false)
      and (p_department_id is null or source.department_id = p_department_id)
      and (p_employee_id is null or source.employee_id = p_employee_id)
      and (p_employment_status is null or source.employment_status = p_employment_status)
      and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
      and (p_exception_type is null or exception.exception_type = p_exception_type)
  )
  select exception_row.attendance_date, exception_row.employee_id, exception_row.employee_number,
    exception_row.employee_name, exception_row.department_id, exception_row.department_name,
    exception_row.job_title_id, exception_row.job_title_name, exception_row.employment_status,
    exception_row.exception_type, exception_row.attendance_status, exception_row.calculation_state,
    exception_row.clock_in, exception_row.clock_out, exception_row.worked_minutes,
    exception_row.late_minutes, exception_row.undertime_minutes, exception_row.is_corrected,
    exception_row.is_recalculated, exception_row.attendance_calculation_revision_id, v_total
  from exception_rows as exception_row
  order by exception_row.attendance_date desc, exception_row.employee_number asc,
    exception_row.exception_type asc, exception_row.attendance_calculation_revision_id asc
  limit case when p_export then 25000 else p_page_size end
  offset case when p_export then 0 else (p_page - 1) * p_page_size end;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_LOAD_FAILED';
end;
$$;

create or replace function public.get_overtime_holiday_report(
  p_mode text,
  p_start_date date,
  p_end_date date,
  p_department_id uuid default null,
  p_employee_id uuid default null,
  p_employment_status text default null,
  p_active_only boolean default false,
  p_segment_type text default null,
  p_approval_status text default null,
  p_holiday_type text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_export boolean default false
)
returns table (
  attendance_date date, employee_id uuid, employee_number text, employee_name text,
  department_id uuid, department_name text, job_title_id uuid, job_title_name text,
  employment_status text, segment_type text, holiday_name text, holiday_type text,
  detected_start timestamptz, detected_end timestamptz, detected_minutes integer,
  approved_minutes integer, approval_status text, reviewed_at timestamptz,
  is_active_detection boolean, is_superseded boolean,
  attendance_calculation_revision_id uuid, detection_revision_id uuid,
  approval_item_id uuid, total_count bigint
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
  if p_segment_type is not null and p_segment_type not in ('pre_shift', 'post_shift', 'rest_day', 'holiday_work') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_SEGMENT_TYPE';
  end if;
  if p_approval_status is not null and p_approval_status not in ('pending', 'approved', 'rejected', 'superseded') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_APPROVAL_STATUS';
  end if;
  if p_holiday_type is not null and p_holiday_type not in ('regular_holiday', 'special_non_working_holiday', 'company_holiday') then
    raise exception using errcode = 'P0001', message = 'REPORT_INVALID_HOLIDAY_TYPE';
  end if;

  select count(*) into v_total
  from public.report_overtime_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_segment_type is null or source.segment_type = p_segment_type)
    and (p_approval_status is null or source.approval_status = p_approval_status)
    and (p_holiday_type is null or source.holiday_type = p_holiday_type);

  if p_export and v_total > 25000 then
    raise exception using errcode = 'P0001', message = 'REPORT_ROW_LIMIT';
  end if;

  return query
  select source.attendance_date, source.employee_id, source.employee_number,
    source.employee_name, source.department_id, source.department_name,
    source.job_title_id, source.job_title_name, source.employment_status,
    source.segment_type, source.holiday_name, source.holiday_type,
    source.detected_start, source.detected_end, source.detected_minutes,
    case when source.approval_status = 'approved' and source.is_active_detection and not source.is_superseded
      then source.approved_minutes else 0 end,
    source.approval_status, source.reviewed_at, source.is_active_detection,
    source.is_superseded, source.attendance_calculation_revision_id,
    source.detection_revision_id, source.approval_item_id, v_total
  from public.report_overtime_source_v1 as source
  where source.attendance_date between p_start_date and p_end_date
    and (p_department_id is null or source.department_id = p_department_id)
    and (p_employee_id is null or source.employee_id = p_employee_id)
    and (p_employment_status is null or source.employment_status = p_employment_status)
    and (not p_active_only or (source.archived_at is null and source.employment_status in ('active', 'probation', 'on_leave')))
    and (p_segment_type is null or source.segment_type = p_segment_type)
    and (p_approval_status is null or source.approval_status = p_approval_status)
    and (p_holiday_type is null or source.holiday_type = p_holiday_type)
  order by source.attendance_date desc, source.employee_number asc,
    source.segment_type asc, source.detection_revision_id asc
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
  if p_export_dataset not in ('daily', 'employee_summary', 'exceptions', 'overtime_holiday', 'workbook') then
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

  v_action := case p_export_format
    when 'csv' then 'attendance_report.csv_exported'
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
    null, v_actor, v_action, 'attendance_report', null,
    '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, v_metadata, 'application'
  ) returning id into v_id;
  return v_id;
exception
  when sqlstate 'P0001' then raise;
  when others then raise exception using errcode = 'P0001', message = 'REPORT_AUDIT_FAILED';
end;
$$;

revoke all on public.report_attendance_source_v1 from public, anon, authenticated;
revoke all on public.report_overtime_source_v1 from public, anon, authenticated;
revoke all on function public.report_require_hr() from public, anon, authenticated;
revoke all on function public.report_validate_request(text, date, date, integer, integer, boolean) from public, anon, authenticated;


revoke all on function public.get_attendance_report_summary(text, date, date, uuid, uuid, text, boolean) from public, anon;
revoke all on function public.get_attendance_daily_report(text, date, date, uuid, uuid, text, boolean, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.get_employee_attendance_summary(text, date, date, uuid, uuid, text, boolean, boolean, integer, integer, boolean) from public, anon;
revoke all on function public.get_attendance_exception_report(text, date, date, uuid, uuid, text, boolean, text, integer, integer, boolean) from public, anon;
revoke all on function public.get_overtime_holiday_report(text, date, date, uuid, uuid, text, boolean, text, text, text, integer, integer, boolean) from public, anon;
revoke all on function public.record_attendance_report_export(text, text, text, date, date, uuid, uuid, text, boolean, boolean, integer, jsonb) from public, anon;

grant execute on function public.get_attendance_report_summary(text, date, date, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.get_attendance_daily_report(text, date, date, uuid, uuid, text, boolean, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.get_employee_attendance_summary(text, date, date, uuid, uuid, text, boolean, boolean, integer, integer, boolean) to authenticated;
grant execute on function public.get_attendance_exception_report(text, date, date, uuid, uuid, text, boolean, text, integer, integer, boolean) to authenticated;
grant execute on function public.get_overtime_holiday_report(text, date, date, uuid, uuid, text, boolean, text, text, text, integer, integer, boolean) to authenticated;
grant execute on function public.record_attendance_report_export(text, text, text, date, date, uuid, uuid, text, boolean, boolean, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
