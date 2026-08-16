-- =============================================================================
-- 00014_attendance_locks_teacher_access.sql
-- =============================================================================
-- Make `attendance_locks` usable by the people who actually lock a register.
--
-- THE DEFECT
-- 00003 created the table, its indexes and its RLS, and the application shipped
-- with `AttendanceLock` in `lib/types.ts` — but no code ever read or wrote it.
-- Restoring the legacy date-lock feature surfaced two reasons it could not have
-- worked as written:
--
--   1. The only write policy is `attendance_locks_admin_write`, gated on
--      `is_school_admin`. In the legacy build the *class teacher* closed their
--      own register; a principal was never involved. As shipped, the teacher
--      the feature exists for is exactly the one who cannot use it.
--
--   2. `class_id` is NOT NULL and references `classes(id)`. Every pre-V2
--      account has no class row at all — `resolveServerScope` returns
--      `{mode:'legacy'}` for them — so those teachers could not write a lock
--      even with a permissive policy. The table simply could not represent
--      their locks.
--
-- THE FIX
-- Mirror the dual-mode scoping the rest of the app already uses (see
-- `lib/utils/queryFilter.ts`): a lock is keyed by class in V2, and by teacher on
-- the legacy path. Both shapes coexist, exactly as they do for `attendance`
-- itself.
--
-- Additive: no column is dropped, no existing row changes, and the admin policy
-- is left exactly as it was.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Allow the legacy shape
-- -----------------------------------------------------------------------------

ALTER TABLE public.attendance_locks ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.attendance_locks
    ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- A lock with neither key belongs to nobody and would be invisible to every
-- policy below — cheaper to reject than to debug later.
ALTER TABLE public.attendance_locks DROP CONSTRAINT IF EXISTS attendance_locks_scoped;
ALTER TABLE public.attendance_locks
    ADD CONSTRAINT attendance_locks_scoped
    CHECK (class_id IS NOT NULL OR teacher_id IS NOT NULL);

-- The original UNIQUE (class_id, date) still guards the V2 path. It does NOT
-- constrain legacy rows: Postgres treats NULLs as distinct in a unique
-- constraint, so every legacy row has a NULL class_id and none of them collide.
-- This partial index is what stops one teacher locking the same day twice, and
-- is also the conflict target `lockDate` upserts against.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_locks_teacher_date_uniq
    ON public.attendance_locks (teacher_id, date)
    WHERE class_id IS NULL;

COMMENT ON COLUMN public.attendance_locks.teacher_id IS
    'Legacy scoping: set when class_id is NULL, i.e. a pre-V2 account with no class row.';

-- -----------------------------------------------------------------------------
-- 2. Let a teacher lock their own register
-- -----------------------------------------------------------------------------
-- Read: a teacher sees locks for a class they are assigned to (already covered
-- by `attendance_locks_select_assigned`) — this adds their own legacy locks.

DROP POLICY IF EXISTS "attendance_locks_select_own_legacy" ON public.attendance_locks;
CREATE POLICY "attendance_locks_select_own_legacy" ON public.attendance_locks
    FOR SELECT USING (
        class_id IS NULL AND teacher_id = auth.uid()
    );

-- Write: split per command rather than FOR ALL, so the WITH CHECK on INSERT is
-- explicit. A teacher may only create a lock that is either
--   * for a class they hold an active assignment on, or
--   * their own legacy lock (no class, stamped with their own id).
-- Neither branch lets them forge a lock for someone else's class.

DROP POLICY IF EXISTS "attendance_locks_teacher_insert" ON public.attendance_locks;
CREATE POLICY "attendance_locks_teacher_insert" ON public.attendance_locks
    FOR INSERT WITH CHECK (
        (
            class_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = attendance_locks.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active'
            )
        )
        OR (class_id IS NULL AND teacher_id = auth.uid())
    );

DROP POLICY IF EXISTS "attendance_locks_teacher_delete" ON public.attendance_locks;
CREATE POLICY "attendance_locks_teacher_delete" ON public.attendance_locks
    FOR DELETE USING (
        (
            class_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = attendance_locks.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active'
            )
        )
        OR (class_id IS NULL AND teacher_id = auth.uid())
    );

-- No UPDATE policy on purpose. A lock carries no editable state — unlocking is
-- a DELETE, and re-locking is an INSERT. Leaving UPDATE unpolicied means a
-- teacher cannot rewrite `locked_by` to point at a colleague.

GRANT SELECT, INSERT, DELETE ON public.attendance_locks TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='attendance_locks' ORDER BY policyname;
-- -- expect: admin_write (ALL), select_assigned (SELECT), select_own_legacy (SELECT),
-- --         teacher_delete (DELETE), teacher_insert (INSERT)
--
-- SELECT is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='attendance_locks' AND column_name='class_id';
-- -- expect YES
--
-- -- Two legacy locks on the same day for one teacher must fail:
-- --   ERROR: duplicate key value violates unique constraint
-- --          "attendance_locks_teacher_date_uniq"
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "attendance_locks_teacher_delete"    ON public.attendance_locks;
-- DROP POLICY IF EXISTS "attendance_locks_teacher_insert"    ON public.attendance_locks;
-- DROP POLICY IF EXISTS "attendance_locks_select_own_legacy" ON public.attendance_locks;
-- DROP INDEX IF EXISTS public.attendance_locks_teacher_date_uniq;
-- ALTER TABLE public.attendance_locks DROP CONSTRAINT IF EXISTS attendance_locks_scoped;
-- -- Only safe once every legacy lock is gone, since class_id returns to NOT NULL:
-- --   DELETE FROM public.attendance_locks WHERE class_id IS NULL;
-- ALTER TABLE public.attendance_locks DROP COLUMN IF EXISTS teacher_id;
-- ALTER TABLE public.attendance_locks ALTER COLUMN class_id SET NOT NULL;
-- COMMIT;
-- =============================================================================
