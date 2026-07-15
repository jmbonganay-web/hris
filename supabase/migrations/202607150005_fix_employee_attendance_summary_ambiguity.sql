begin;

-- Fix PL/pgSQL ambiguity between the RETURNS TABLE output variable employee_id
-- and the filtered report source column of the same name.
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

notify pgrst, 'reload schema';

commit;
