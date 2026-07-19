begin;

create or replace function public.validate_notification_action_url(p_url text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_allowed boolean;
begin
  if p_url is null or btrim(p_url) = '' then
    return null;
  end if;

  if p_url ~* '^[a-z][a-z0-9+.-]*:'
     or starts_with(p_url, '//')
     or position('://' in p_url) > 0
     or position(E'\\' in p_url) > 0
     or p_url ~ '[[:cntrl:]]'
     or lower(p_url) like 'javascript:%' then
    raise exception using
      errcode = 'P0001',
      message = 'NOTIFICATION_INVALID_ACTION_URL';
  end if;

  v_allowed :=
       p_url = '/attendance'
    or starts_with(p_url, '/attendance/')
    or starts_with(p_url, '/attendance?')
    or p_url = '/admin/attendance'
    or starts_with(p_url, '/admin/attendance/')
    or starts_with(p_url, '/admin/attendance?')
    or p_url = '/leave'
    or starts_with(p_url, '/leave/')
    or starts_with(p_url, '/leave?')
    or p_url = '/employee/leave'
    or starts_with(p_url, '/employee/leave/')
    or starts_with(p_url, '/employee/leave?')
    or p_url = '/admin/leave'
    or starts_with(p_url, '/admin/leave/')
    or starts_with(p_url, '/admin/leave?')
    or p_url = '/overtime'
    or starts_with(p_url, '/overtime/')
    or starts_with(p_url, '/overtime?')
    or p_url = '/admin/overtime'
    or starts_with(p_url, '/admin/overtime/')
    or starts_with(p_url, '/admin/overtime?')
    or p_url = '/documents'
    or starts_with(p_url, '/documents/')
    or starts_with(p_url, '/documents?')
    or p_url = '/admin/documents/review'
    or starts_with(p_url, '/admin/documents/review/')
    or starts_with(p_url, '/admin/documents/review?')
    or p_url = '/notifications'
    or starts_with(p_url, '/notifications/')
    or starts_with(p_url, '/notifications?')
    or p_url = '/admin/notifications/settings'
    or starts_with(p_url, '/admin/notifications/settings/')
    or starts_with(p_url, '/admin/notifications/settings?')
    or p_url = '/payroll'
    or starts_with(p_url, '/payroll?')
    or p_url = '/payroll/approvals'
    or starts_with(p_url, '/payroll/approvals?')
    or p_url = '/payroll/periods'
    or starts_with(p_url, '/payroll/periods?')
    or p_url = '/payroll/settings/basis-rules'
    or starts_with(p_url, '/payroll/settings/basis-rules?')
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/workspace(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/exceptions(\?.*)?$'
    or p_url ~ '^/payroll/periods/[0-9a-fA-F-]{36}/employees/[0-9a-fA-F-]{36}(\?.*)?$'
    or p_url = '/me/compensation'
    or starts_with(p_url, '/me/compensation?');

  if not v_allowed then
    raise exception using
      errcode = 'P0001',
      message = 'NOTIFICATION_INVALID_ACTION_URL';
  end if;

  return p_url;
end;
$$;

revoke all on function public.validate_notification_action_url(text)
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
