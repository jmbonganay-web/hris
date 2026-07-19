-- Phase 10B.2A premium rules verification.
-- Run after supabase/migrations/202607190003_payroll_premium_rules.sql.
-- This statement is read-only and does not modify payroll data or configuration.

with
required_tables(table_name) as (
  values
    ('premium_rule_presets'),
    ('premium_rule_sets'),
    ('premium_rule_versions'),
    ('attendance_deduction_rules'),
    ('payroll_day_type_resolutions'),
    ('payroll_premium_lines'),
    ('premium_rule_events'),
    ('premium_calculation_events')
),
table_state as (
  select
    required.table_name,
    class.oid,
    class.oid is not null as exists,
    coalesce(class.relrowsecurity, false) as rls_enabled,
    case when class.oid is null then false
      else has_table_privilege('authenticated', class.oid, 'SELECT')
    end as authenticated_select,
    case when class.oid is null then true
      else has_table_privilege('authenticated', class.oid, 'INSERT')
        or has_table_privilege('authenticated', class.oid, 'UPDATE')
        or has_table_privilege('authenticated', class.oid, 'DELETE')
    end as authenticated_write
  from required_tables required
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_class class
    on class.relnamespace = namespace.oid
   and class.relname = required.table_name
   and class.relkind in ('r','p')
),
required_types(type_name) as (
  values
    ('premium_rule_scope_type'),
    ('premium_day_type'),
    ('premium_time_rounding_mode'),
    ('premium_type')
),
required_source_labels(enum_label) as (
  values
    ('premium_rule'),
    ('attendance_deduction_rule'),
    ('day_type_resolution')
),
required_rpcs(signature) as (
  values
    ('public.create_premium_rule_set(text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,text,text,date,text,jsonb,uuid)'),
    ('public.clone_premium_rule_preset(text,text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,uuid)'),
    ('public.clone_premium_rule_version(uuid,date,date,text,uuid)'),
    ('public.update_premium_rule_set_draft(uuid,timestamp with time zone,text,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,text,text,date,text,jsonb,uuid)'),
    ('public.submit_premium_rule_set(uuid,integer,uuid)'),
    ('public.approve_premium_rule_set(uuid,integer,uuid)'),
    ('public.reject_premium_rule_set(uuid,integer,text,uuid)'),
    ('public.create_attendance_deduction_rule(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,integer,integer,public.premium_time_rounding_mode,integer,public.premium_time_rounding_mode,integer,date,date,text,uuid)'),
    ('public.clone_attendance_deduction_rule(uuid,date,date,text,uuid)'),
    ('public.update_attendance_deduction_rule_draft(uuid,timestamp with time zone,public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,integer,integer,public.premium_time_rounding_mode,integer,public.premium_time_rounding_mode,integer,date,date,text,uuid)'),
    ('public.submit_attendance_deduction_rule(uuid,integer,uuid)'),
    ('public.approve_attendance_deduction_rule(uuid,integer,uuid)'),
    ('public.reject_attendance_deduction_rule(uuid,integer,text,uuid)'),
    ('public.list_premium_rule_sets()'),
    ('public.get_premium_rule_set_detail(uuid)'),
    ('public.list_attendance_deduction_rules()'),
    ('public.list_premium_rule_approvals()'),
    ('public.preview_premium_rule_coverage(uuid)'),
    ('public.calculate_payroll_premiums(uuid,text,uuid[],uuid)'),
    ('public.recalculate_employee_premiums(uuid,uuid,uuid)')
),
rpc_state as (
  select
    required.signature,
    procedure.oid,
    coalesce(procedure.prosecdef, false) as security_definer,
    coalesce(array_to_string(procedure.proconfig, ','), '') like '%search_path=pg_catalog, public%' as restricted_search_path,
    case when procedure.oid is null then false
      else has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    end as authenticated_execute,
    case when procedure.oid is null then true
      else has_function_privilege('anon', procedure.oid, 'EXECUTE')
    end as anon_execute,
    case when procedure.oid is null then true
      else exists (
        select 1
        from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) privilege
        where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
      )
    end as public_execute
  from required_rpcs required
  left join pg_proc procedure on procedure.oid = to_regprocedure(required.signature)
),
internal_helpers(signature) as (
  values
    ('public.reject_premium_calculation_mutation()'),
    ('public.reject_approved_premium_rule_mutation()'),
    ('public.reject_approved_premium_rule_version_mutation()'),
    ('public.write_premium_rule_event(uuid,uuid,uuid,text,uuid,text,jsonb,jsonb)'),
    ('public.write_premium_calculation_event(uuid,uuid,uuid,uuid,text,uuid,text,jsonb)'),
    ('public.validate_premium_rule_scope(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid)'),
    ('public.validate_premium_day_rules(jsonb)'),
    ('public.round_premium_minutes(integer,public.premium_time_rounding_mode,integer)'),
    ('public.resolve_employee_premium_rule(uuid,uuid,date,public.premium_day_type)'),
    ('public.resolve_attendance_deduction_rule(uuid,date)'),
    ('public.resolve_employee_day_type(uuid,uuid,date)'),
    ('public.resolve_payroll_premium_segments(uuid,date)'),
    ('public.calculate_night_overlap_minutes(timestamp with time zone,timestamp with time zone,date,time without time zone,time without time zone)'),
    ('public.mark_payroll_entries_stale_for_premium_scope(public.premium_rule_scope_type,public.employment_type,uuid,uuid,uuid,date,date,text,public.payroll_source_type,uuid)'),
    ('public.mark_payroll_stale_from_holiday_count()'),
    ('public.clone_payroll_entry_for_premiums(uuid,uuid)'),
    ('public.calculate_employee_premiums_internal(uuid)'),
    ('public.premium_rule_set_json(public.premium_rule_sets)'),
    ('public.attendance_deduction_rule_json(public.attendance_deduction_rules)'),
    ('public.validate_notification_action_url(text)')
),
required_entry_columns(column_name) as (
  values
    ('premium_earnings_raw'),
    ('premium_earnings_rounded'),
    ('night_differential_raw'),
    ('night_differential_rounded'),
    ('revised_gross_pay_raw'),
    ('revised_gross_pay_rounded'),
    ('premium_calculated_at')
),
required_daily_columns(column_name) as (
  values
    ('attendance_deduction_rule_id'),
    ('late_grace_minutes'),
    ('late_deductible_minutes'),
    ('undertime_grace_minutes'),
    ('undertime_deductible_minutes')
),
checks as (
  select
    'eight premium tables exist with RLS'::text as check_name,
    count(*) = 8 and bool_and(exists and rls_enabled) as passed,
    format('%s/8 tables found; %s/8 have RLS',
      count(*) filter (where exists), count(*) filter (where rls_enabled)) as details
  from table_state

  union all
  select
    'premium tables are read-only to authenticated browser sessions',
    count(*) = 8 and bool_and(authenticated_select and not authenticated_write),
    format('%s/8 SELECT grants; %s browser write grants',
      count(*) filter (where authenticated_select), count(*) filter (where authenticated_write))
  from table_state

  union all
  select
    'four premium enum types exist',
    count(type.oid) = 4,
    format('%s/4 premium enum types found', count(type.oid))
  from required_types required
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_type type
    on type.typnamespace = namespace.oid
   and type.typname = required.type_name

  union all
  select
    'payroll source enum contains premium snapshot labels',
    count(enum.oid) = 3,
    format('%s/3 payroll source labels found', count(enum.oid))
  from required_source_labels required
  left join pg_namespace namespace on namespace.nspname = 'public'
  left join pg_type type
    on type.typnamespace = namespace.oid
   and type.typname = 'payroll_source_type'
  left join pg_enum enum
    on enum.enumtypid = type.oid
   and enum.enumlabel = required.enum_label

  union all
  select
    'protected premium RPCs use SECURITY DEFINER and restricted search_path',
    count(*) = 20 and bool_and(oid is not null and security_definer and restricted_search_path),
    format('%s/20 RPCs found; %s/20 secured',
      count(*) filter (where oid is not null),
      count(*) filter (where security_definer and restricted_search_path))
  from rpc_state

  union all
  select
    'authenticated can execute public RPCs while anon and PUBLIC cannot',
    count(*) = 20 and bool_and(authenticated_execute and not anon_execute and not public_execute),
    format('%s/20 authenticated grants; %s anon grants; %s PUBLIC grants',
      count(*) filter (where authenticated_execute),
      count(*) filter (where anon_execute),
      count(*) filter (where public_execute))
  from rpc_state

  union all
  select
    'internal premium helpers are not browser executable',
    count(*) = 20 and bool_and(
      to_regprocedure(signature) is not null
      and not has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
      and not has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
      and not exists (
        select 1
        from pg_proc helper
        cross join lateral aclexplode(coalesce(helper.proacl, acldefault('f', helper.proowner))) privilege
        where helper.oid = to_regprocedure(signature)
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
    ),
    format('%s/20 helpers found', count(*) filter (where to_regprocedure(signature) is not null))
  from internal_helpers

  union all
  select
    'premium rule and calculation immutability triggers exist',
    count(*) = 8,
    format('%s/8 immutable triggers found', count(*))
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'premium_rule_presets_immutable',
      'payroll_day_type_resolutions_immutable',
      'payroll_premium_lines_immutable',
      'premium_rule_events_immutable',
      'premium_calculation_events_immutable',
      'premium_rule_sets_approved_immutable',
      'premium_rule_versions_approved_immutable',
      'attendance_deduction_rules_approved_immutable'
    )

  union all
  select
    'approved premium and attendance ranges have exclusion constraints',
    count(*) = 2,
    format('%s/2 effective-date exclusion constraints found', count(*))
  from pg_constraint
  where conname in (
    'premium_rule_approved_no_overlap',
    'attendance_deduction_approved_no_overlap'
  )
    and contype = 'x'

  union all
  select
    'holiday configuration supports one or two regular holidays',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'holiday_calendar_versions'
        and column_name = 'holiday_count'
        and data_type = 'smallint'
    )
    and exists (
      select 1
      from pg_constraint constraint_row
      join pg_class class on class.oid = constraint_row.conrelid
      join pg_namespace namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and class.relname = 'holiday_calendar_versions'
        and constraint_row.conname = 'holiday_calendar_versions_count_check'
    ),
    'holiday_count column and one-or-two check constraint inspected'

  union all
  select
    'payroll entries contain premium totals and calculation timestamp',
    count(column_row.column_name) = 7
      and bool_and(
        case when required.column_name = 'premium_calculated_at'
          then column_row.data_type = 'timestamp with time zone'
          else column_row.data_type = 'numeric'
        end
      ),
    format('%s/7 premium entry columns found', count(column_row.column_name))
  from required_entry_columns required
  left join information_schema.columns column_row
    on column_row.table_schema = 'public'
   and column_row.table_name = 'payroll_employee_entries'
   and column_row.column_name = required.column_name

  union all
  select
    'daily breakdowns preserve attendance grace decisions',
    count(column_row.column_name) = 5,
    format('%s/5 attendance rule and grace columns found', count(column_row.column_name))
  from required_daily_columns required
  left join information_schema.columns column_row
    on column_row.table_schema = 'public'
   and column_row.table_name = 'payroll_entry_daily_breakdowns'
   and column_row.column_name = required.column_name

  union all
  select
    'inactive Philippine statutory reference preset is available',
    count(*) = 1
      and bool_and(country_code = 'PH')
      and bool_and(jsonb_array_length(day_rules) = 8),
    format('%s matching reference presets found', count(*))
  from public.premium_rule_presets
  where code = 'ph_dole_2024_reference'

  union all
  select
    'migration does not activate a premium rule automatically',
    count(*) = 0,
    format('%s approved premium rules exist', count(*))
  from public.premium_rule_sets
  where status = 'approved'

  union all
  select
    'premium and attendance approvals mark intersecting open entries stale',
    position('mark_payroll_entries_stale_for_premium_scope' in pg_get_functiondef(to_regprocedure('public.approve_premium_rule_set(uuid,integer,uuid)'))) > 0
      and position('mark_payroll_entries_stale_for_premium_scope' in pg_get_functiondef(to_regprocedure('public.approve_attendance_deduction_rule(uuid,integer,uuid)'))) > 0,
    'Both approval functions invoke scoped stale detection'

  union all
  select
    'holiday changes have a premium stale-detection trigger',
    count(*) = 1,
    format('%s/1 holiday stale trigger found', count(*))
  from pg_trigger
  where not tgisinternal
    and tgname = 'mark_payroll_stale_from_holiday_count'

  union all
  select
    'readiness blocks entries missing premium calculation',
    position('missingPremiumEntryCount' in pg_get_functiondef(to_regprocedure('public.check_payroll_period_readiness(uuid)'))) > 0
      and position('premium_calculated_at is null' in lower(pg_get_functiondef(to_regprocedure('public.check_payroll_period_readiness(uuid)')))) > 0,
    'Readiness payload and premium timestamp gate inspected'

  union all
  select
    'premium rule resolution preserves superseded historical versions',
    position('superseded' in pg_get_functiondef(to_regprocedure('public.resolve_employee_premium_rule(uuid,uuid,date,public.premium_day_type)'))) > 0
      and position('superseded' in pg_get_functiondef(to_regprocedure('public.resolve_attendance_deduction_rule(uuid,date)'))) > 0,
    'Premium and attendance resolvers include superseded effective-dated versions'

  union all
  select
    'notification action URL allow-list contains Phase 10B.2A routes',
    position('/payroll/settings/premium-rules' in pg_get_functiondef(to_regprocedure('public.validate_notification_action_url(text)'))) > 0
      and position('/payroll/settings/attendance-deduction-rules' in pg_get_functiondef(to_regprocedure('public.validate_notification_action_url(text)'))) > 0
      and position('/payroll/approvals/premium-rules' in pg_get_functiondef(to_regprocedure('public.validate_notification_action_url(text)'))) > 0,
    'Premium settings, attendance settings, and approval routes inspected'

  union all
  select
    'premium money and multiplier columns use numeric types',
    count(*) = 13 and bool_and(data_type = 'numeric'),
    format('%s/13 premium money and multiplier columns are numeric', count(*))
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'payroll_employee_entries' and column_name in (
        'premium_earnings_raw','premium_earnings_rounded',
        'night_differential_raw','night_differential_rounded',
        'revised_gross_pay_raw','revised_gross_pay_rounded'
      ))
      or (table_name = 'payroll_premium_lines' and column_name in (
        'base_hourly_rate_raw','day_multiplier','overtime_multiplier',
        'night_percentage','base_amount_raw','premium_amount_raw','premium_amount_rounded'
      ))
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
