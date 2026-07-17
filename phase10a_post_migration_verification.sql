-- Phase 10A payroll foundation post-migration verification
-- Run after:
--   202607180001_fix_notification_archive_outer_join_lock.sql
--   202607180002_payroll_foundation.sql
--
-- The idempotency probe runs inside a rolled-back subtransaction. It does not
-- retain generated payroll periods, audit events, or notifications.

create temp table if not exists phase10a_verification_results (
  check_order integer not null,
  check_name text not null,
  status text not null check (status in ('passed', 'failed')),
  details jsonb not null default '{}'::jsonb
);
truncate table phase10a_verification_results;

-- 1. All seven payroll tables exist and have Row Level Security enabled.
with required(table_name) as (
  values
    ('payroll_settings'),
    ('payroll_schedules'),
    ('payroll_periods'),
    ('employee_compensation_records'),
    ('employee_payroll_schedule_assignments'),
    ('payroll_period_events'),
    ('compensation_events')
), inspected as (
  select
    required.table_name,
    c.oid is not null as exists,
    coalesce(c.relrowsecurity, false) as rls_enabled
  from required
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c
    on c.relnamespace = n.oid
   and c.relname = required.table_name
   and c.relkind in ('r', 'p')
)
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  10,
  'Seven payroll tables exist with RLS enabled',
  case when bool_and(exists and rls_enabled) and count(*) = 7 then 'passed' else 'failed' end,
  jsonb_build_object(
    'tables', jsonb_agg(
      jsonb_build_object(
        'name', table_name,
        'exists', exists,
        'rls_enabled', rls_enabled
      ) order by table_name
    )
  )
from inspected;

-- 2. Singleton settings use the approved PHP, Asia/Manila, rolling-12-month defaults.
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  20,
  'Singleton payroll settings are configured',
  case
    when count(*) = 1
     and bool_and(id = 1)
     and bool_and(default_currency_code = 'PHP')
     and bool_and(payroll_timezone = 'Asia/Manila')
     and bool_and(generation_enabled)
     and bool_and(generation_horizon_months = 12)
    then 'passed'
    else 'failed'
  end,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'currency', default_currency_code,
        'timezone', payroll_timezone,
        'generation_enabled', generation_enabled,
        'generation_horizon_months', generation_horizon_months
      )
    ),
    '[]'::jsonb
  )
from public.payroll_settings;

-- 3. At least one schedule exists. The migration may seed at most one default
-- semi-monthly schedule, and only when no schedule existed before migration.
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  30,
  'Payroll schedule seed is valid',
  case
    when count(*) >= 1
     and count(*) filter (
       where code = 'SM'
         and schedule_type = 'semi_monthly'
         and created_by is null
     ) <= 1
    then 'passed'
    else 'failed'
  end,
  jsonb_build_object(
    'total_schedules', count(*),
    'migration_seeded_default_count', count(*) filter (
      where code = 'SM'
        and schedule_type = 'semi_monthly'
        and created_by is null
    ),
    'note', 'Zero seeded defaults is valid when a payroll schedule existed before Phase 10A.'
  )
from public.payroll_schedules;

-- 4. Protected public RPCs exist, use SECURITY DEFINER, have a fixed search
-- path, reject anonymous execution, and allow authenticated execution.
with required(function_name) as (
  values
    ('get_payroll_overview'),
    ('list_payroll_schedules'),
    ('get_payroll_schedule_detail'),
    ('preview_payroll_schedule_periods'),
    ('create_payroll_schedule'),
    ('update_payroll_schedule'),
    ('set_payroll_schedule_active'),
    ('ensure_payroll_period_horizon'),
    ('list_payroll_periods'),
    ('get_payroll_period_detail'),
    ('transition_payroll_period'),
    ('reopen_payroll_period'),
    ('get_employee_compensation_admin'),
    ('get_own_compensation'),
    ('create_compensation_draft'),
    ('update_compensation_draft'),
    ('submit_compensation_record'),
    ('approve_compensation_record'),
    ('reject_compensation_record'),
    ('create_schedule_assignment_draft'),
    ('update_schedule_assignment_draft'),
    ('submit_schedule_assignment'),
    ('approve_schedule_assignment'),
    ('reject_schedule_assignment'),
    ('list_payroll_approvals')
), inspected as (
  select
    required.function_name,
    p.oid,
    p.prosecdef as security_definer,
    coalesce(array_to_string(p.proconfig, ','), '') as function_config,
    case when p.oid is null then false
      else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_can_execute,
    case when p.oid is null then false
      else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_can_execute,
    case when p.oid is null then null
      else pg_get_function_identity_arguments(p.oid) end as identity_arguments
  from required
  left join pg_namespace n on n.nspname = 'public'
  left join pg_proc p
    on p.pronamespace = n.oid
   and p.proname = required.function_name
)
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  40,
  'Protected payroll RPC security configuration',
  case
    when count(*) = 25
     and bool_and(oid is not null)
     and bool_and(security_definer)
     and bool_and(function_config ~ 'search_path=pg_catalog, public')
     and bool_and(not anon_can_execute)
     and bool_and(authenticated_can_execute)
    then 'passed'
    else 'failed'
  end,
  jsonb_build_object(
    'functions', jsonb_agg(
      jsonb_build_object(
        'name', function_name,
        'arguments', identity_arguments,
        'exists', oid is not null,
        'security_definer', coalesce(security_definer, false),
        'search_path', function_config,
        'anon_can_execute', anon_can_execute,
        'authenticated_can_execute', authenticated_can_execute
      ) order by function_name
    )
  )
from inspected;

-- 5. Internal payroll helpers are unavailable to browser roles.
with required(function_name) as (
  values
    ('assert_safe_payroll_payload'),
    ('write_payroll_period_event'),
    ('write_compensation_event'),
    ('notify_payroll_super_admins'),
    ('notify_payroll_employee'),
    ('notify_payroll_admins'),
    ('is_payroll_business_day'),
    ('adjust_to_previous_payroll_business_day'),
    ('payroll_period_code'),
    ('preview_payroll_schedule_periods_internal'),
    ('payroll_employee_identity_json'),
    ('payroll_compensation_record_json'),
    ('payroll_assignment_json')
), inspected as (
  select
    required.function_name,
    count(p.oid) as overload_count,
    coalesce(bool_and(not has_function_privilege('anon', p.oid, 'EXECUTE')), false) as anon_blocked,
    coalesce(bool_and(not has_function_privilege('authenticated', p.oid, 'EXECUTE')), false) as authenticated_blocked
  from required
  left join pg_namespace n on n.nspname = 'public'
  left join pg_proc p
    on p.pronamespace = n.oid
   and p.proname = required.function_name
  group by required.function_name
)
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  50,
  'Internal payroll helpers are not browser executable',
  case
    when count(*) = 13
     and bool_and(overload_count >= 1)
     and bool_and(anon_blocked)
     and bool_and(authenticated_blocked)
    then 'passed'
    else 'failed'
  end,
  jsonb_build_object(
    'functions', jsonb_agg(
      jsonb_build_object(
        'name', function_name,
        'overload_count', overload_count,
        'anon_blocked', anon_blocked,
        'authenticated_blocked', authenticated_blocked
      ) order by function_name
    )
  )
from inspected;

-- 6. The daily rolling-generation cron job is active and exact.
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  60,
  'Daily payroll period generation cron is active',
  case
    when count(*) = 1
     and bool_and(active)
     and bool_and(schedule = '15 0 * * *')
     and bool_and(command ~ $$ensure_payroll_period_horizon\('scheduled',\s*null\)$$)
    then 'passed'
    else 'failed'
  end,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'jobid', jobid,
        'jobname', jobname,
        'schedule', schedule,
        'command', command,
        'active', active
      )
    ),
    '[]'::jsonb
  )
from cron.job
where jobname = 'hris-daily-payroll-period-generation';

-- 7. Generation is idempotent. All changes made by this probe are rolled back.
do $verification$
declare
  v_before integer := 0;
  v_after_first integer := 0;
  v_after_second integer := 0;
  v_first jsonb;
  v_second jsonb;
  v_error text;
begin
  begin
    select count(*) into v_before from public.payroll_periods;
    v_first := public.ensure_payroll_period_horizon('scheduled', gen_random_uuid());
    select count(*) into v_after_first from public.payroll_periods;
    v_second := public.ensure_payroll_period_horizon('scheduled', gen_random_uuid());
    select count(*) into v_after_second from public.payroll_periods;
    raise exception using errcode = 'P0001', message = 'PHASE10A_VERIFICATION_ROLLBACK';
  exception when others then
    if sqlerrm <> 'PHASE10A_VERIFICATION_ROLLBACK' then
      v_error := sqlstate || ': ' || sqlerrm;
    end if;
  end;

  insert into phase10a_verification_results(check_order, check_name, status, details)
  values (
    70,
    'Payroll period generation is idempotent',
    case
      when v_error is null
       and v_after_second = v_after_first
       and coalesce((v_second ->> 'periodsCreated')::integer, -1) = 0
      then 'passed'
      else 'failed'
    end,
    jsonb_build_object(
      'period_count_before', v_before,
      'period_count_after_first', v_after_first,
      'period_count_after_second', v_after_second,
      'first_result', v_first,
      'second_result', v_second,
      'error', v_error,
      'changes_retained', false
    )
  );
end
$verification$;

-- 8. The deployed Phase 9 archive-lock repair remains present.
insert into phase10a_verification_results(check_order, check_name, status, details)
select
  80,
  'Phase 9 notification archive lock repair is present',
  case
    when count(*) = 1
     and bool_and(position('FOR UPDATE OF N' in upper(pg_get_functiondef(p.oid))) > 0)
    then 'passed'
    else 'failed'
  end,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'function', p.proname,
        'locks_notifications_only', position('FOR UPDATE OF N' in upper(pg_get_functiondef(p.oid))) > 0
      )
    ),
    '[]'::jsonb
  )
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'archive_resolved_notifications';

select
  check_name,
  status,
  details,
  count(*) filter (where status = 'passed') over () as passed_checks,
  count(*) filter (where status = 'failed') over () as failed_checks
from phase10a_verification_results
order by check_order;
