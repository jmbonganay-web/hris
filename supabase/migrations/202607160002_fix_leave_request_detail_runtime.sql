begin;

-- Supabase installs pgcrypto functions in the extensions schema. These two
-- leave workflows calculate SHA-256 fingerprints with digest(), so their
-- fixed search paths must include that schema at runtime.
alter function public.get_leave_request_detail(uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.review_leave_request(uuid,uuid,text,text,numeric,text,text)
  set search_path = pg_catalog, public, extensions;

notify pgrst, 'reload schema';

commit;
