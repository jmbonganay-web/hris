begin;

-- Defense-in-depth hardening for Phase 5B-2B tables.
-- All client mutations must use protected security-definer RPCs.
revoke insert, update, delete on table
  public.overtime_policy_versions,
  public.holiday_calendar_groups,
  public.holiday_calendar_versions,
  public.overtime_detection_groups,
  public.overtime_detection_revisions,
  public.overtime_approval_items
from anon, authenticated;

notify pgrst, 'reload schema';
commit;
