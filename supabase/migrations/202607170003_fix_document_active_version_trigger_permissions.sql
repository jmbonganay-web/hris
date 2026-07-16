begin;

-- The active-version guard is a deferred constraint trigger. Deferred triggers
-- can fire after the SECURITY DEFINER upload RPC has returned to the caller's
-- role, so the trigger function must carry its own definer privileges before
-- it reads the protected employee_document_versions table.
create or replace function public.validate_employee_document_active_version()
returns trigger
language plpgsql
security definer
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

revoke all on function public.validate_employee_document_active_version() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
