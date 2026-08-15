-- =============================================================================
-- 00007_scores_class_access.sql
-- =============================================================================
-- Let any teacher assigned to a class read every subject's marks for that class.
-- (Chosen policy: Option 1.)
--
-- WHY
-- 00006 widened `students` so a subject teacher sees the roster. Marks stayed
-- owner-scoped, so that teacher saw the names but none of the scores, and
-- `score/total` showed only the subjects they themselves had entered. A totals
-- sheet that silently omits other teachers' columns is worse than no sheet.
--
-- SCOPE — reuses `can_access_student` from 00006, so the boundary is identical
-- to the roster's:
--   a teacher may read a score **only** if they hold an *active* assignment to
--   a class in which that score's student is *actively enrolled*.
--
-- It does NOT grant:
--   * school-wide visibility (a principal's access comes from `user_roles`),
--   * any write. INSERT/UPDATE/DELETE remain `auth.uid() = teacher_id`, so a
--     teacher can read a colleague's marks but never alter them.
--
-- Non-destructive: the owner branch is preserved, so nobody loses access.
--
-- NOTE: `attendance` has the same structure and the same gap. It is left
-- owner-scoped deliberately — widening it was not part of this decision.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "Teachers can view their own scores" ON public.scores;
DROP POLICY IF EXISTS "scores_select_own_or_assigned" ON public.scores;

CREATE POLICY "scores_select_own_or_assigned" ON public.scores
    FOR SELECT USING (
        auth.uid() = teacher_id                        -- owner (legacy, unchanged)
        OR public.can_access_student(student_id)       -- assigned to the student's class
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Only SELECT should reference can_access_student; writes stay owner-only:
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='scores' ORDER BY cmd;
--
-- -- A teacher with no assignment to a class must still read none of its marks.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "scores_select_own_or_assigned" ON public.scores;
-- CREATE POLICY "Teachers can view their own scores" ON public.scores
--     FOR SELECT USING (auth.uid() = teacher_id);
-- COMMIT;
-- =============================================================================
