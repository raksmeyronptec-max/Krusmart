-- =============================================================================
-- 00006_students_class_access.sql
-- =============================================================================
-- Let a teacher see the students of a class they are assigned to.
--
-- WHY
-- `students` RLS has always been `auth.uid() = teacher_id`, i.e. a student is
-- visible only to the account that created them. That was exactly right when a
-- class *was* a teacher account. Under V2 a class can have several teachers —
-- a homeroom teacher plus subject teachers — and the old policy makes every one
-- of them see an empty roster. It blocks the project's own goal that a teacher
-- can manage multiple classes.
--
-- SCOPE OF THE WIDENING — deliberately narrow:
--   a teacher may read a student **only** if they hold an *active* assignment to
--   a class in which that student is *actively enrolled*.
--
-- It does NOT grant:
--   * school-wide visibility (a principal's access comes from `user_roles`),
--   * access to past enrolments once an assignment ends,
--   * any write. INSERT/UPDATE/DELETE remain `auth.uid() = teacher_id`, so a
--     subject teacher can read the roster but cannot edit or delete a student
--     another teacher owns.
--
-- Non-destructive: the original owner-based policy is preserved as the first
-- branch of the new one. Nobody loses access.
-- =============================================================================

BEGIN;

-- SECURITY DEFINER so the lookup does not re-enter RLS on student_enrollments
-- and teacher_assignments (which would nest policy evaluation on every row).
-- `search_path` is pinned so the definer's rights cannot be redirected.
CREATE OR REPLACE FUNCTION public.can_access_student(student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.student_enrollments se
          JOIN public.teacher_assignments ta ON ta.class_id = se.class_id
         WHERE se.student_id = student
           AND se.status = 'active'
           AND ta.teacher_id = auth.uid()
           AND ta.status = 'active'
    );
$$;

COMMENT ON FUNCTION public.can_access_student(UUID) IS
    'True when the caller holds an active assignment to a class the student is
     actively enrolled in. Read access only — writes stay owner-scoped.';

GRANT EXECUTE ON FUNCTION public.can_access_student(UUID) TO authenticated;

-- Replace only the SELECT policy. The write policies from 00001 are untouched.
DROP POLICY IF EXISTS "Teachers can view their own students" ON public.students;
DROP POLICY IF EXISTS "students_select_own_or_assigned" ON public.students;

CREATE POLICY "students_select_own_or_assigned" ON public.students
    FOR SELECT USING (
        auth.uid() = teacher_id                 -- owner (legacy path, unchanged)
        OR public.can_access_student(id)        -- assigned to the student's class
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Write policies must still be owner-only (expect only the SELECT policy to
-- -- mention can_access_student):
-- SELECT policyname, cmd, qual FROM pg_policies
--  WHERE schemaname='public' AND tablename='students' ORDER BY cmd;
--
-- -- A teacher with no assignment to a class must still see nothing of it.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "students_select_own_or_assigned" ON public.students;
-- CREATE POLICY "Teachers can view their own students" ON public.students
--     FOR SELECT USING (auth.uid() = teacher_id);
-- DROP FUNCTION IF EXISTS public.can_access_student(UUID);
-- COMMIT;
-- =============================================================================
