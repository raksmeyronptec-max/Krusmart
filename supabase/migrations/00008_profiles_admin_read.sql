-- =============================================================================
-- 00008_profiles_admin_read.sql
-- =============================================================================
-- Let a school administrator read the profiles of staff in their own school.
--
-- WHY
-- `profiles` RLS is `auth.uid() = id` — a user may read only their own row. That
-- is correct for a teacher, but it makes the principal console unable to do its
-- job: `/admin/teachers` cannot show a teacher's name (the embedded profile is
-- filtered out, which is why `full_name` renders blank), and there is no way to
-- present a list of staff to assign to a class.
--
-- SCOPE — narrow, and mirroring 00006/00007:
--   an administrator may read a profile **only** if that profile belongs to a
--   school they administer.
--
-- It does NOT grant:
--   * cross-school visibility — `is_school_admin` is evaluated per school,
--   * any write. INSERT/UPDATE stay `auth.uid() = id`, so an administrator can
--     see a colleague's profile but never edit it.
--
-- Non-destructive: the self-access branch is preserved first, so nobody loses
-- access to their own row.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
    FOR SELECT USING (
        auth.uid() = id                                        -- own row (unchanged)
        OR (school_id IS NOT NULL AND public.is_school_admin(school_id))
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Writes must remain self-only (expect INSERT/UPDATE policies to reference
-- -- only `auth.uid() = id`):
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='profiles' ORDER BY cmd;
--
-- -- A plain teacher must still read exactly one profile row: their own.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
-- CREATE POLICY "profiles_select_own" ON public.profiles
--     FOR SELECT USING (auth.uid() = id);
-- COMMIT;
-- =============================================================================
