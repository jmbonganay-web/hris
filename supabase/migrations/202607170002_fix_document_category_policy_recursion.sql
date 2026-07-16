begin;

-- Break the circular RLS dependency between document_categories and
-- document_category_versions. The boolean helpers run as the migration owner,
-- return only authorization decisions, and keep the replacement policies free
-- of direct reciprocal table lookups.

create or replace function public.document_category_is_employee_selectable(
  p_category_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.document_categories c
    join lateral (
      select
        v.default_visibility,
        v.employee_upload_enabled
      from public.document_category_versions v
      where v.category_id = c.id
      order by v.version_number desc, v.created_at desc, v.id desc
      limit 1
    ) current_version on true
    where c.id = p_category_id
      and c.archived_at is null
      and current_version.default_visibility = 'employee_hr'
      and current_version.employee_upload_enabled
  );
$$;

create or replace function public.document_category_version_is_employee_selectable(
  p_category_version_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.document_category_versions v
    join public.document_categories c on c.id = v.category_id
    where v.id = p_category_version_id
      and c.archived_at is null
      and v.default_visibility = 'employee_hr'
      and v.employee_upload_enabled
  );
$$;

create or replace function public.document_category_allows_employee_document_access(
  p_category_id uuid,
  p_visibility_override text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.document_categories c
    join lateral (
      select v.default_visibility
      from public.document_category_versions v
      where v.category_id = c.id
      order by v.version_number desc, v.created_at desc, v.id desc
      limit 1
    ) current_version on true
    where c.id = p_category_id
      and c.archived_at is null
      and coalesce(p_visibility_override, current_version.default_visibility) = 'employee_hr'
  );
$$;

revoke all on function public.document_category_is_employee_selectable(uuid)
from public, anon, authenticated;
revoke all on function public.document_category_version_is_employee_selectable(uuid)
from public, anon, authenticated;
revoke all on function public.document_category_allows_employee_document_access(uuid, text)
from public, anon, authenticated;

grant execute on function public.document_category_is_employee_selectable(uuid)
to authenticated;
grant execute on function public.document_category_version_is_employee_selectable(uuid)
to authenticated;
grant execute on function public.document_category_allows_employee_document_access(uuid, text)
to authenticated;

drop policy if exists document_categories_safe_select
on public.document_categories;
create policy document_categories_safe_select
on public.document_categories
for select to authenticated
using (
  public.is_hr_admin()
  or public.document_category_is_employee_selectable(id)
);

drop policy if exists document_category_versions_safe_select
on public.document_category_versions;
create policy document_category_versions_safe_select
on public.document_category_versions
for select to authenticated
using (
  public.is_hr_admin()
  or public.document_category_version_is_employee_selectable(id)
);

drop policy if exists document_category_fields_safe_select
on public.document_category_fields;
create policy document_category_fields_safe_select
on public.document_category_fields
for select to authenticated
using (
  public.is_hr_admin()
  or (
    employee_visible
    and public.document_category_version_is_employee_selectable(category_version_id)
  )
);

drop policy if exists employee_documents_safe_select
on public.employee_documents;
create policy employee_documents_safe_select
on public.employee_documents
for select to authenticated
using (
  public.is_hr_admin()
  or (
    employee_id = public.current_employee_id()
    and public.document_category_allows_employee_document_access(
      category_id,
      visibility_override
    )
  )
);

notify pgrst, 'reload schema';
commit;
