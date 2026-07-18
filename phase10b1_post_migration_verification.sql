-- Phase 10B.1 payroll calculation foundation verification
-- Run after supabase/migrations/202607190001_payroll_calculation_foundation.sql.
-- This query is read-only and does not create payroll data.

with
required_tables(table_name) as (
  values
    ('payroll_basis_rules'),
    ('payroll_calculation_runs'),
    ('payroll_employee_entries'),
    ('payroll_entry_input_snapshots'),
    ('payroll_entry_daily_breakdowns'),
    ('payroll_entry_exceptions'),
    ('payroll_employee_exclusions'),
    ('payroll_calculation_events')
),
table_state as (
  select
    required.table_name,
    class.oid is not null as exists,
    coalesce(class.relrowsecurity, false) as rls_enabled
  from required_tables required
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class class
    on class.relnamespace = namespace.oid
   and class.relname = required.table_name
   and class.relkind = 'r'
),
required_types(type_name) as (
  values
    ('payroll_calculation_run_status'),
    ('payroll_employee_entry_status'),
    ('payroll_exception_severity'),
    ('payroll_exception_status'),
    ('payroll_source_type'),
    ('payroll_basis_rounding_mode')
),
required_rpcs(signature) as (
  values
    ('public.create_payroll_basis_rule(text,numeric,numeric,public.payroll_basis_rounding_mode,date,text,uuid)'),
    ('public.submit_payroll_basis_rule(uuid,integer,uuid)'),
    ('public.approve_payroll_basis_rule(uuid,integer,uuid)'),
    ('public.reject_payroll_basis_rule(uuid,integer,text,uuid)'),
    ('public.start_payroll_calculation_run(uuid,text,uuid[],uuid)'),
    ('public.calculate_payroll_employee(uuid,uuid,uuid)'),
    ('public.recalculate_payroll_employee(uuid,uuid,uuid)'),
    ('public.exclude_employee_from_payroll(uuid,uuid,text,uuid)'),
    ('public.reverse_payroll_exclusion(uuid,text,uuid)'),
    ('public.resolve_payroll_exception(uuid,text,uuid)'),
    ('public.ignore_blocking_payroll_exception(uuid,text,uuid)'),
    ('public.check_payroll_period_readiness(uuid)'),
    ('public.list_payroll_basis_rules()'),
    ('public.get_payroll_calculation_workspace(uuid)'),
    ('public.get_payroll_employee_calculation_detail(uuid,uuid)'),
    ('public.list_payroll_entry_exceptions(uuid)')
),
rpc_state as (
  select
    required.signature,
    procedure.oid,
    coalesce(procedure.prosecdef, false) as security_definer,
    coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=pg_catalog, public%' as restricted_search_path,
    case when procedure.oid is null then false else has_function_privilege('authenticated', procedure.oid, 'EXECUTE') end as authenticated_execute,
    case when procedure.oid is null then true else has_function_privilege('anon', procedure.oid, 'EXECUTE') end as anon_execute
  from required_rpcs required
  left join pg_proc procedure on procedure.oid = to_regprocedure(required.signature)
),
internal_helpers(signature) as (
  values
    ('public.reject_payroll_calculation_mutation()'),
    ('public.write_payroll_calculation_event(uuid,uuid,uuid,uuid,text,uuid,text,jsonb)'),
    ('public.create_payroll_entry_exception(uuid,uuid,uuid,uuid,text,public.payroll_exception_severity,text,public.payroll_source_type,uuid)'),
    ('public.insert_payroll_snapshot(uuid,public.payroll_source_type,text,uuid,timestamptz,date,jsonb)'),
    ('public.round_payroll_amount(numeric,public.payroll_basis_rounding_mode)'),
    ('public.calculate_payroll_employee_internal(uuid,uuid,uuid)'),
    ('public.mark_employee_payroll_entries_stale(uuid,text,public.payroll_source_type,uuid,date)'),
    ('public.mark_payroll_stale_from_source()'),
    ('public.mark_payroll_stale_from_basis()'),
    ('public.payroll_basis_rule_json(public.payroll_basis_rules)'),
    ('public.payroll_calculation_run_json(public.payroll_calculation_runs)'),
    ('public.payroll_employee_entry_json(public.payroll_employee_entries)')
),
checks as (
  select
    'eight calculation tables exist with RLS'::text as check_name,
    count(*) = 8 and bool_and(exists and rls_enabled) as passed,
    format('%s/8 tables found; %s/8 have RLS', count(*) filter (where exists), count(*) filter (where rls_enabled)) as details
  from table_state

  union all
  select
    'six payroll calculation enum types exist',
    count(type.oid) = 6,
    format('%s/6 enum types found', count(type.oid))
  from required_types required
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_type type on type.typnamespace = namespace.oid and type.typname = required.type_name

  union all
  select
    'protected RPCs use SECURITY DEFINER and restricted search_path',
    count(*) = 16 and bool_and(oid is not null and security_definer and restricted_search_path),
    format('%s/16 RPCs found; %s/16 secured', count(*) filter (where oid is not null), count(*) filter (where security_definer and restricted_search_path))
  from rpc_state

  union all
  select
    'authenticated can execute public RPCs while anon cannot',
    count(*) = 16 and bool_and(authenticated_execute and not anon_execute),
    format('%s/16 authenticated grants; %s anon grants', count(*) filter (where authenticated_execute), count(*) filter (where anon_execute))
  from rpc_state

  union all
  select
    'internal helpers are not browser executable',
    count(*) = 12 and bool_and(
      to_regprocedure(signature) is not null
      and not has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      and not has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
    ),
    format('%s/12 helpers found', count(*) filter (where to_regprocedure(signature) is not null))
  from internal_helpers

  union all
  select
    'immutable snapshot, breakdown, and event triggers exist',
    count(*) = 3,
    format('%s/3 immutable triggers found', count(*))
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'payroll_snapshots_immutable',
      'payroll_daily_breakdowns_immutable',
      'payroll_calculation_events_immutable'
    )

  union all
  select
    'source changes have payroll stale-detection triggers',
    count(*) = 8,
    format('%s/8 stale-detection triggers found', count(*))
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'payroll_stale_attendance',
      'payroll_stale_leave',
      'payroll_stale_overtime',
      'payroll_stale_compensation',
      'payroll_stale_payroll_assignment',
      'payroll_stale_work_schedule_assignment',
      'payroll_stale_employment',
      'payroll_stale_basis_rule'
    )

  union all
  select
    'rounding and failed-run safeguards are installed',
    position('half_even' in lower(pg_get_functiondef(to_regprocedure('public.round_payroll_amount(numeric,public.payroll_basis_rounding_mode)')))) > 0
      and lower(regexp_replace(pg_get_functiondef(to_regprocedure('public.round_payroll_amount(numeric,public.payroll_basis_rounding_mode)')), '\\s+', '', 'g')) like '%mod(v_whole,2)=1%'
      and position('insert into public.payroll_calculation_runs' in lower(pg_get_functiondef(to_regprocedure('public.start_payroll_calculation_run(uuid,text,uuid[],uuid)')))) > 0
      and position('PAYROLL_CALCULATION_FAILED' in pg_get_functiondef(to_regprocedure('public.start_payroll_calculation_run(uuid,text,uuid[],uuid)'))) > 0,
    'Half-even rounding and failed-run persistence are present'

  union all
  select
    'migration does not activate a payroll basis automatically',
    (select count(*) from public.payroll_basis_rules) = 0,
    format('%s payroll basis rows exist', (select count(*) from public.payroll_basis_rules))

  union all
  select
    'migration does not calculate employee payroll automatically',
    (select count(*) from public.payroll_calculation_runs) = 0
      and (select count(*) from public.payroll_employee_entries) = 0,
    format('%s runs; %s employee entries',
      (select count(*) from public.payroll_calculation_runs),
      (select count(*) from public.payroll_employee_entries))

  union all
  select
    'calculation run is idempotent and concurrency protected',
    position('idempotency_key' in pg_get_functiondef(to_regprocedure('public.start_payroll_calculation_run(uuid,text,uuid[],uuid)'))) > 0
      and position('pg_try_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('public.start_payroll_calculation_run(uuid,text,uuid[],uuid)'))) > 0
      and exists (
        select 1 from pg_indexes
        where schemaname = 'public' and indexname = 'payroll_calculation_one_active_run_idx'
      ),
    'Function includes idempotency and advisory locking; partial active-run index checked'

  union all
  select
    'readiness gates open-to-review transition',
    position('check_payroll_period_readiness' in pg_get_functiondef(to_regprocedure('public.transition_payroll_period(uuid,integer,public.payroll_period_status,uuid)'))) > 0
      and position('PAYROLL_PERIOD_NOT_READY' in pg_get_functiondef(to_regprocedure('public.transition_payroll_period(uuid,integer,public.payroll_period_status,uuid)'))) > 0,
    'Payroll transition function calls readiness and raises a safe blocking code'

  union all
  select
    'money columns use numeric rather than floating point',
    count(*) = 18 and bool_and(data_type = 'numeric'),
    format('%s/18 money and rate columns are numeric', count(*) filter (where data_type = 'numeric'))
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payroll_employee_entries'
    and column_name in (
      'monthly_salary','hourly_rate','annual_divisor','standard_hours_per_day','standard_hours_per_week',
      'regular_earnings_raw','regular_earnings_rounded','absence_deduction_raw','absence_deduction_rounded',
      'late_deduction_raw','late_deduction_rounded','undertime_deduction_raw','undertime_deduction_rounded',
      'overtime_input_amount','paid_leave_amount','unpaid_leave_deduction','gross_pay_raw','gross_pay_rounded'
    )
)
select
  check_name,
  passed,
  details,
  count(*) filter (where passed) over () as passed_checks,
  count(*) filter (where not passed) over () as failed_checks
from checks
order by check_name;
