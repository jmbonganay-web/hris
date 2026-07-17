begin;

create or replace function public.get_hr_dashboard_analytics(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_documents jsonb;
  v_active_employees integer;
  v_new_hires integer;
  v_pending_leave integer;
  v_pending_overtime integer;
  v_document_issues integer;
  v_attendance jsonb;
begin
  if auth.uid() is null or not public.is_hr_admin() then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or (p_end_date - p_start_date) + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_INVALID_DATE_RANGE';
  end if;

  select count(*)::integer into v_active_employees
  from public.employees
  where archived_at is null
    and employment_status in ('active', 'probation', 'on_leave');

  select count(*)::integer into v_new_hires
  from public.employees
  where archived_at is null
    and hire_date between p_start_date and p_end_date;

  select count(*)::integer into v_pending_leave
  from public.leave_request_groups g
  join public.leave_request_revisions r on r.id = g.active_revision_id
  where g.current_status = 'pending'
    and r.start_date <= p_end_date
    and r.end_date >= p_start_date;

  select count(*)::integer into v_pending_overtime
  from public.overtime_approval_items a
  join public.overtime_detection_revisions r on r.id = a.detection_revision_id
  join public.overtime_detection_groups g on g.id = r.detection_group_id
  where a.status = 'pending'
    and a.superseded_at is null
    and r.is_active
    and g.active_revision_id = r.id
    and g.attendance_date between p_start_date and p_end_date;

  v_documents := public.get_document_admin_dashboard();
  v_document_issues := coalesce((v_documents ->> 'pendingReviewCount')::integer, 0)
    + coalesce((v_documents ->> 'missingDocumentCount')::integer, 0)
    + coalesce((v_documents ->> 'expiringSoonCount')::integer, 0)
    + coalesce((v_documents ->> 'expiredCount')::integer, 0);

  select jsonb_build_object(
    'presentDays', count(*) filter (where attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance')),
    'absentDays', count(*) filter (where attendance_status = 'absent'),
    'exceptionDays', count(*) filter (where attendance_status = 'missing_clock_out' or is_late or is_undertime),
    'lateDays', count(*) filter (where is_late),
    'undertimeDays', count(*) filter (where is_undertime),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day_rows.day,
        'present', day_rows.present_count,
        'absent', day_rows.absent_count,
        'exceptions', day_rows.exception_count
      ) order by day_rows.day)
      from (
        select
          series.day::date as day,
          count(source.employee_id) filter (where source.attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance'))::integer as present_count,
          count(source.employee_id) filter (where source.attendance_status = 'absent')::integer as absent_count,
          count(source.employee_id) filter (where source.attendance_status = 'missing_clock_out' or source.is_late or source.is_undertime)::integer as exception_count
        from generate_series(p_start_date, p_end_date, interval '1 day') as series(day)
        left join public.report_attendance_source_v1 source
          on source.attendance_date = series.day::date
         and source.archived_at is null
        group by series.day
      ) day_rows
    ), '[]'::jsonb)
  ) into v_attendance
  from public.report_attendance_source_v1
  where attendance_date between p_start_date and p_end_date
    and archived_at is null;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'activeEmployees', v_active_employees,
      'newHires', v_new_hires,
      'pendingLeave', v_pending_leave,
      'pendingOvertime', v_pending_overtime,
      'documentIssues', v_document_issues
    ),
    'attendance', v_attendance,
    'workforceStatus', coalesce((
      select jsonb_agg(jsonb_build_object('label', status_rows.label, 'value', status_rows.value) order by status_rows.sort_order)
      from (
        select initcap(replace(employment_status::text, '_', ' ')) as label,
          count(*)::integer as value,
          min(case employment_status::text when 'active' then 1 when 'probation' then 2 when 'on_leave' then 3 when 'inactive' then 4 else 5 end) as sort_order
        from public.employees
        where archived_at is null
        group by employment_status
      ) status_rows
    ), '[]'::jsonb),
    'upcomingLeave', coalesce((
      select jsonb_agg(to_jsonb(leave_rows) order by leave_rows."startDate", leave_rows.id)
      from (
        select g.id::text as id,
          trim(concat_ws(' ', e.first_name, e.last_name)) as "employeeName",
          tv.name as "leaveType",
          r.start_date::text as "startDate",
          r.end_date::text as "endDate",
          g.current_status as status
        from public.leave_request_groups g
        join public.leave_request_revisions r on r.id = g.active_revision_id
        join public.leave_type_versions tv on tv.id = r.leave_type_version_id
        join public.employees e on e.id = g.employee_id
        where g.current_status = 'approved'
          and r.start_date <= p_end_date
          and r.end_date >= p_start_date
          and e.archived_at is null
        order by r.start_date, g.id
        limit 8
      ) leave_rows
    ), '[]'::jsonb),
    'recentHires', coalesce((
      select jsonb_agg(to_jsonb(hire_rows) order by hire_rows."hireDate" desc, hire_rows.id)
      from (
        select e.id::text as id,
          trim(concat_ws(' ', e.first_name, e.last_name)) as name,
          d.name as department,
          j.title as "jobTitle",
          e.hire_date::text as "hireDate",
          e.employment_status::text as status
        from public.employees e
        left join public.departments d on d.id = e.department_id
        left join public.job_titles j on j.id = e.job_title_id
        where e.archived_at is null
          and e.hire_date between p_start_date and p_end_date
        order by e.hire_date desc, e.id
        limit 8
      ) hire_rows
    ), '[]'::jsonb),
    'actions', jsonb_build_array(
      jsonb_build_object('key', 'pending_leave', 'label', 'Pending leave requests', 'count', v_pending_leave, 'href', '/admin/leave?status=pending', 'tone', 'warning'),
      jsonb_build_object('key', 'pending_overtime', 'label', 'Pending overtime approvals', 'count', v_pending_overtime, 'href', '/admin/overtime?status=pending', 'tone', 'warning'),
      jsonb_build_object('key', 'document_review', 'label', 'Document compliance issues', 'count', v_document_issues, 'href', '/admin/documents', 'tone', case when v_document_issues > 0 then 'danger' else 'default' end)
    )
  );
end;
$$;

create or replace function public.get_manager_dashboard_analytics(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_manager_id uuid := public.current_employee_id();
  v_direct_report_count integer;
  v_pending_leave integer;
  v_document_issues integer;
  v_attendance jsonb;
begin
  if auth.uid() is null or v_manager_id is null then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or (p_end_date - p_start_date) + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_INVALID_DATE_RANGE';
  end if;

  select count(*)::integer into v_direct_report_count
  from public.employees
  where manager_id = v_manager_id
    and archived_at is null
    and employment_status in ('active', 'probation', 'on_leave');

  select count(*)::integer into v_pending_leave
  from public.leave_request_groups g
  join public.leave_request_revisions r on r.id = g.active_revision_id
  join public.employees e on e.id = g.employee_id
  where e.manager_id = v_manager_id
    and e.archived_at is null
    and e.employment_status in ('active', 'probation', 'on_leave')
    and g.current_status = 'pending'
    and r.start_date <= p_end_date
    and r.end_date >= p_start_date;

  select coalesce(sum(c.missing_count + c.pending_review_count + c.expiring_soon_count + c.expired_count), 0)::integer
  into v_document_issues
  from public.get_manager_document_compliance() c;

  select jsonb_build_object(
    'presentDays', count(*) filter (where attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance')),
    'absentDays', count(*) filter (where attendance_status = 'absent'),
    'exceptionDays', count(*) filter (where attendance_status = 'missing_clock_out' or is_late or is_undertime),
    'lateDays', count(*) filter (where is_late),
    'undertimeDays', count(*) filter (where is_undertime),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day_rows.day,
        'present', day_rows.present_count,
        'absent', day_rows.absent_count,
        'exceptions', day_rows.exception_count
      ) order by day_rows.day)
      from (
        select series.day::date as day,
          count(source.employee_id) filter (where source.attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance'))::integer as present_count,
          count(source.employee_id) filter (where source.attendance_status = 'absent')::integer as absent_count,
          count(source.employee_id) filter (where source.attendance_status = 'missing_clock_out' or source.is_late or source.is_undertime)::integer as exception_count
        from generate_series(p_start_date, p_end_date, interval '1 day') series(day)
        left join public.report_attendance_source_v1 source
          on source.attendance_date = series.day::date
         and source.employee_id in (
           select id from public.employees
           where manager_id = v_manager_id
             and archived_at is null
             and employment_status in ('active', 'probation', 'on_leave')
         )
        group by series.day
      ) day_rows
    ), '[]'::jsonb)
  ) into v_attendance
  from public.report_attendance_source_v1
  where attendance_date between p_start_date and p_end_date
    and employee_id in (
      select id from public.employees
      where manager_id = v_manager_id
        and archived_at is null
        and employment_status in ('active', 'probation', 'on_leave')
    );

  return jsonb_build_object(
    'directReportCount', v_direct_report_count,
    'metrics', jsonb_build_object(
      'presentDays', coalesce((v_attendance ->> 'presentDays')::integer, 0),
      'absentDays', coalesce((v_attendance ->> 'absentDays')::integer, 0),
      'pendingLeave', v_pending_leave,
      'documentIssues', v_document_issues
    ),
    'attendance', v_attendance,
    'teamStatus', coalesce((
      select jsonb_agg(jsonb_build_object('label', status_rows.label, 'value', status_rows.value) order by status_rows.label)
      from (
        select initcap(replace(employment_status::text, '_', ' ')) as label, count(*)::integer as value
        from public.employees
        where manager_id = v_manager_id
          and archived_at is null
          and employment_status in ('active', 'probation', 'on_leave')
        group by employment_status
      ) status_rows
    ), '[]'::jsonb),
    'upcomingLeave', coalesce((
      select jsonb_agg(to_jsonb(leave_rows) order by leave_rows."startDate", leave_rows.id)
      from (
        select g.id::text as id,
          trim(concat_ws(' ', e.first_name, e.last_name)) as "employeeName",
          tv.name as "leaveType",
          r.start_date::text as "startDate",
          r.end_date::text as "endDate",
          g.current_status as status
        from public.leave_request_groups g
        join public.leave_request_revisions r on r.id = g.active_revision_id
        join public.leave_type_versions tv on tv.id = r.leave_type_version_id
        join public.employees e on e.id = g.employee_id
        where e.manager_id = v_manager_id
          and e.archived_at is null
          and e.employment_status in ('active', 'probation', 'on_leave')
          and g.current_status = 'approved'
          and r.start_date <= p_end_date
          and r.end_date >= p_start_date
        order by r.start_date, g.id
        limit 8
      ) leave_rows
    ), '[]'::jsonb),
    'actions', jsonb_build_array(
      jsonb_build_object('key', 'my_leave', 'label', 'My leave requests', 'count', 0, 'href', '/employee/leave', 'tone', 'default'),
      jsonb_build_object('key', 'my_documents', 'label', 'My documents', 'count', 0, 'href', '/documents', 'tone', 'default'),
      jsonb_build_object('key', 'my_schedule', 'label', 'My schedule', 'count', 0, 'href', '/my-schedule', 'tone', 'default')
    )
  );
end;
$$;

create or replace function public.get_employee_dashboard_analytics(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_employee_id uuid := public.current_employee_id();
  v_pending_leave integer;
  v_document_issues integer;
  v_unread_notifications integer;
  v_attendance jsonb;
  v_company_date date := public.company_attendance_date(now());
begin
  if auth.uid() is null or v_employee_id is null then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_PERMISSION_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or (p_end_date - p_start_date) + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DASHBOARD_INVALID_DATE_RANGE';
  end if;

  select count(*)::integer into v_pending_leave
  from public.leave_request_groups g
  join public.leave_request_revisions r on r.id = g.active_revision_id
  where g.employee_id = v_employee_id
    and g.current_status = 'pending'
    and r.start_date <= p_end_date
    and r.end_date >= p_start_date;

  select count(*)::integer into v_document_issues
  from public.get_employee_document_compliance(v_employee_id) c
  where c.status in ('missing', 'pending_review', 'replacement_requested', 'expiring_soon', 'expired');

  select count(*)::integer into v_unread_notifications
  from public.notifications
  where recipient_user_id = auth.uid()
    and read_at is null
    and type like 'document_%';

  select jsonb_build_object(
    'presentDays', count(*) filter (where attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance')),
    'absentDays', count(*) filter (where attendance_status = 'absent'),
    'exceptionDays', count(*) filter (where attendance_status = 'missing_clock_out' or is_late or is_undertime),
    'lateDays', count(*) filter (where is_late),
    'undertimeDays', count(*) filter (where is_undertime),
    'trend', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day_rows.day,
        'present', day_rows.present_count,
        'absent', day_rows.absent_count,
        'exceptions', day_rows.exception_count
      ) order by day_rows.day)
      from (
        select series.day::date as day,
          count(source.employee_id) filter (where source.attendance_status in ('present', 'rest_day_worked', 'unscheduled_attendance'))::integer as present_count,
          count(source.employee_id) filter (where source.attendance_status = 'absent')::integer as absent_count,
          count(source.employee_id) filter (where source.attendance_status = 'missing_clock_out' or source.is_late or source.is_undertime)::integer as exception_count
        from generate_series(p_start_date, p_end_date, interval '1 day') series(day)
        left join public.report_attendance_source_v1 source
          on source.attendance_date = series.day::date
         and source.employee_id = v_employee_id
        group by series.day
      ) day_rows
    ), '[]'::jsonb)
  ) into v_attendance
  from public.report_attendance_source_v1
  where attendance_date between p_start_date and p_end_date
    and employee_id = v_employee_id;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'presentDays', coalesce((v_attendance ->> 'presentDays')::integer, 0),
      'lateDays', coalesce((v_attendance ->> 'lateDays')::integer, 0),
      'pendingLeave', v_pending_leave,
      'documentIssues', v_document_issues,
      'unreadNotifications', v_unread_notifications
    ),
    'attendance', v_attendance,
    'leaveBalances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'leaveType', balance.leave_type_name,
        'availableUnits', balance.available_units,
        'pendingUnits', balance.pending_reserved_units,
        'usedUnits', balance.approved_used_units
      ) order by balance.leave_type_name)
      from public.get_leave_balance_projection(v_employee_id, extract(year from p_end_date)::integer) balance
    ), '[]'::jsonb),
    'recentLeave', coalesce((
      select jsonb_agg(to_jsonb(leave_rows) order by leave_rows."startDate" desc, leave_rows.id)
      from (
        select g.id::text as id,
          null::text as "employeeName",
          tv.name as "leaveType",
          r.start_date::text as "startDate",
          r.end_date::text as "endDate",
          g.current_status as status
        from public.leave_request_groups g
        join public.leave_request_revisions r on r.id = g.active_revision_id
        join public.leave_type_versions tv on tv.id = r.leave_type_version_id
        where g.employee_id = v_employee_id
          and r.start_date <= p_end_date
          and r.end_date >= p_start_date
        order by r.start_date desc, g.id
        limit 6
      ) leave_rows
    ), '[]'::jsonb),
    'schedule', (
      select jsonb_build_object(
        'state', case when lower(trim(to_char(v_company_date, 'FMDay'))) = any(version.working_days) then 'workday' else 'rest_day' end,
        'scheduleName', template.name,
        'startTime', version.start_time::text,
        'endTime', version.end_time::text,
        'nextEffectiveDate', (
          select future.effective_start_date::text
          from public.employee_schedule_assignments future
          where future.employee_id = v_employee_id
            and not future.is_superseded
            and future.effective_start_date > v_company_date
          order by future.effective_start_date
          limit 1
        )
      )
      from public.employee_schedule_assignments assignment
      join public.work_schedule_templates template on template.id = assignment.schedule_template_id
      join lateral (
        select candidate.*
        from public.work_schedule_versions candidate
        where candidate.schedule_template_id = assignment.schedule_template_id
          and candidate.effective_date <= v_company_date
        order by candidate.effective_date desc, candidate.id desc
        limit 1
      ) version on true
      where assignment.employee_id = v_employee_id
        and not assignment.is_superseded
        and assignment.effective_start_date <= v_company_date
        and (assignment.effective_end_date is null or assignment.effective_end_date >= v_company_date)
      order by assignment.effective_start_date desc
      limit 1
    ),
    'actions', jsonb_build_array(
      jsonb_build_object('key', 'leave', 'label', 'Leave requests', 'count', v_pending_leave, 'href', '/employee/leave', 'tone', case when v_pending_leave > 0 then 'warning' else 'default' end),
      jsonb_build_object('key', 'documents', 'label', 'Document requirements', 'count', v_document_issues, 'href', '/documents', 'tone', case when v_document_issues > 0 then 'danger' else 'default' end),
      jsonb_build_object('key', 'schedule', 'label', 'My schedule', 'count', 0, 'href', '/my-schedule', 'tone', 'default')
    )
  );
end;
$$;

revoke all on function public.get_hr_dashboard_analytics(date,date) from public, anon;
revoke all on function public.get_manager_dashboard_analytics(date,date) from public, anon;
revoke all on function public.get_employee_dashboard_analytics(date,date) from public, anon;
grant execute on function public.get_hr_dashboard_analytics(date,date) to authenticated;
grant execute on function public.get_manager_dashboard_analytics(date,date) to authenticated;
grant execute on function public.get_employee_dashboard_analytics(date,date) to authenticated;

notify pgrst, 'reload schema';
commit;
