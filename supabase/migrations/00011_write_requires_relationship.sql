-- =============================================================================
-- 00011_write_requires_relationship.sql
-- =============================================================================
-- Close a grade/attendance injection hole.
--
-- THE DEFECT
-- The write policies on `scores` and `attendance` were `auth.uid() = teacher_id`
-- — pure self-attribution. They check that the writer *names themselves* as the
-- teacher, never that they actually teach the student. Any authenticated user
-- could therefore insert a mark for any student id:
--
--     POST /rest/v1/scores
--     { "student_id": "<someone else's child>", "teacher_id": "<my own uid>", ... }
--     -> 201 Created
--
-- WHY IT MATTERS NOW
-- While reads were owner-only the injected row was visible to nobody but its
-- author, so this was latent. Migrations 00006/00007 widened reads to "a teacher
-- assigned to the class sees all of that class's students and marks" — which
-- means an injected row now surfaces **inside the real teacher's gradebook**.
-- 00010 then gave parents accounts, turning a latent weakness into a reachable
-- one: a parent could inject grades for their own child.
--
-- THE FIX
-- A writer must both name themselves *and* hold a real relationship to the
-- student: either they own the student row (legacy single-teacher) or they are
-- assigned to a class the student is enrolled in (V2, via `can_access_student`).
--
-- Teachers are unaffected — both branches describe what a teacher already is.
-- Parents, and any account with no relationship to the student, are blocked.
-- =============================================================================

BEGIN;

/**
 * True when the caller may write marks for this student: legacy owner, or a
 * teacher assigned to a class the student is actively enrolled in.
 *
 * SECURITY DEFINER so the lookup does not re-enter RLS on `students`.
 */
CREATE OR REPLACE FUNCTION public.can_write_for_student(student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.students s
         WHERE s.id = student AND s.teacher_id = auth.uid()
    ) OR public.can_access_student(student);
$$;

COMMENT ON FUNCTION public.can_write_for_student(UUID) IS
    'True when the caller owns the student row or is assigned to a class the
     student is enrolled in. Gates writes to scores and attendance so that
     naming yourself as teacher_id is not by itself sufficient.';

GRANT EXECUTE ON FUNCTION public.can_write_for_student(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- scores
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can insert their own scores" ON public.scores;
DROP POLICY IF EXISTS "Teachers can update their own scores" ON public.scores;
DROP POLICY IF EXISTS "Teachers can delete their own scores" ON public.scores;

DROP POLICY IF EXISTS "scores_insert_related" ON public.scores;
CREATE POLICY "scores_insert_related" ON public.scores
    FOR INSERT WITH CHECK (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

DROP POLICY IF EXISTS "scores_update_related" ON public.scores;
CREATE POLICY "scores_update_related" ON public.scores
    FOR UPDATE USING (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    ) WITH CHECK (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

DROP POLICY IF EXISTS "scores_delete_related" ON public.scores;
CREATE POLICY "scores_delete_related" ON public.scores
    FOR DELETE USING (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

-- -----------------------------------------------------------------------------
-- attendance
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can insert their own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can update their own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Teachers can delete their own attendance" ON public.attendance;

DROP POLICY IF EXISTS "attendance_insert_related" ON public.attendance;
CREATE POLICY "attendance_insert_related" ON public.attendance
    FOR INSERT WITH CHECK (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

DROP POLICY IF EXISTS "attendance_update_related" ON public.attendance;
CREATE POLICY "attendance_update_related" ON public.attendance
    FOR UPDATE USING (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    ) WITH CHECK (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

DROP POLICY IF EXISTS "attendance_delete_related" ON public.attendance;
CREATE POLICY "attendance_delete_related" ON public.attendance
    FOR DELETE USING (
        auth.uid() = teacher_id AND public.can_write_for_student(student_id)
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- As a parent (or any account unrelated to the student), this must now fail:
-- --   POST /rest/v1/scores {"student_id":"<child>","teacher_id":"<self>",...}
-- --   -> 403, and SELECT count(*) FROM scores WHERE subject='x' = 0
--
-- -- As the student's teacher, score entry must still succeed unchanged.
--
-- =============================================================================
-- ROLLBACK  (restores the vulnerable self-attribution policies)
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "scores_insert_related" ON public.scores;
-- DROP POLICY IF EXISTS "scores_update_related" ON public.scores;
-- DROP POLICY IF EXISTS "scores_delete_related" ON public.scores;
-- CREATE POLICY "Teachers can insert their own scores" ON public.scores
--     FOR INSERT WITH CHECK (auth.uid() = teacher_id);
-- CREATE POLICY "Teachers can update their own scores" ON public.scores
--     FOR UPDATE USING (auth.uid() = teacher_id);
-- CREATE POLICY "Teachers can delete their own scores" ON public.scores
--     FOR DELETE USING (auth.uid() = teacher_id);
-- -- (and the equivalents on attendance)
-- COMMIT;
-- =============================================================================
