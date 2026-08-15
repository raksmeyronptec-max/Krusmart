-- =============================================================================
-- 00010_parent_portal.sql
-- =============================================================================
-- Parent access: the `parent_students` link table and the RLS that scopes a
-- parent to their own children.
--
-- Replaces the stubbed portal, which authenticated nobody: `parent-login`
-- waited one second and redirected (AUDIT.md G-4). Nothing here grants access
-- without a real Supabase session.
--
-- SCOPE — a parent may READ, and only for a child they are linked to:
--   students · scores · attendance · homework_assignments · notifications
--
-- It does NOT grant:
--   * any write anywhere — there is no parent INSERT/UPDATE/DELETE policy,
--   * visibility of classmates: every policy pivots on `parent_students`,
--   * teacher or admin surfaces, which key off `user_roles`.
--
-- Non-destructive: every policy below preserves its existing branches and adds
-- a parent branch. No teacher or administrator loses access.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The link table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_students (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    /** father | mother | guardian */
    relationship TEXT,
    is_primary   BOOLEAN DEFAULT false,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (parent_id, student_id)
);

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_parent_students_parent  ON public.parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_students_student ON public.parent_students(student_id);

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so a policy on `students` can consult `parent_students`
-- without re-entering RLS and recursing. search_path is pinned.

CREATE OR REPLACE FUNCTION public.is_parent_of(student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.parent_students ps
         WHERE ps.student_id = student
           AND ps.parent_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.is_parent_of(UUID) IS
    'True when the caller is a linked parent/guardian of this student. Read-only.';

/** Every student the caller parents. Drives the portal''s child switcher. */
CREATE OR REPLACE FUNCTION public.my_children()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT ps.student_id FROM public.parent_students ps WHERE ps.parent_id = auth.uid();
$$;

/**
 * True when `teacher` teaches a class one of the caller's children is enrolled
 * in. Used for homework and notifications, which are keyed on `teacher_id`
 * rather than on the student.
 */
CREATE OR REPLACE FUNCTION public.is_teacher_of_my_child(teacher UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.parent_students ps
          JOIN public.student_enrollments se ON se.student_id = ps.student_id
          JOIN public.teacher_assignments ta ON ta.class_id = se.class_id
         WHERE ps.parent_id = auth.uid()
           AND ta.teacher_id = teacher
           AND ta.status = 'active'
           AND se.status = 'active'
    )
    -- Legacy fallback: a pre-V2 student has no enrolment, and their teacher is
    -- simply the owner of the student row.
    OR EXISTS (
        SELECT 1
          FROM public.parent_students ps
          JOIN public.students s ON s.id = ps.student_id
         WHERE ps.parent_id = auth.uid()
           AND s.teacher_id = teacher
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_parent_of(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_children()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_my_child(UUID)  TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. parent_students policies
-- -----------------------------------------------------------------------------
-- A parent sees only their own links. Creating a link is an administrative act
-- and has no policy here: a parent must not be able to claim a child.
DROP POLICY IF EXISTS "parent_students_select_own" ON public.parent_students;
CREATE POLICY "parent_students_select_own" ON public.parent_students
    FOR SELECT USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "parent_students_admin_all" ON public.parent_students;
CREATE POLICY "parent_students_admin_all" ON public.parent_students
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.students s
                 WHERE s.id = parent_students.student_id
                   AND (s.teacher_id = auth.uid()
                        OR (s.school_id IS NOT NULL AND public.is_school_admin(s.school_id))))
    );

-- -----------------------------------------------------------------------------
-- 4. Extend the read policies with a parent branch
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "students_select_own_or_assigned" ON public.students;
CREATE POLICY "students_select_own_or_assigned" ON public.students
    FOR SELECT USING (
        auth.uid() = teacher_id                 -- owner (legacy)
        OR public.can_access_student(id)        -- assigned teacher (00006)
        OR public.is_parent_of(id)              -- linked parent
    );

DROP POLICY IF EXISTS "scores_select_own_or_assigned" ON public.scores;
CREATE POLICY "scores_select_own_or_assigned" ON public.scores
    FOR SELECT USING (
        auth.uid() = teacher_id
        OR public.can_access_student(student_id)   -- assigned teacher (00007)
        OR public.is_parent_of(student_id)
    );

-- attendance was owner-only until now; the parent branch is its first widening.
DROP POLICY IF EXISTS "Teachers can view their own attendance" ON public.attendance;
DROP POLICY IF EXISTS "attendance_select_own_or_parent" ON public.attendance;
CREATE POLICY "attendance_select_own_or_parent" ON public.attendance
    FOR SELECT USING (
        auth.uid() = teacher_id
        OR public.is_parent_of(student_id)
    );

-- Homework and notifications hang off `teacher_id`, not `student_id`.
DROP POLICY IF EXISTS "Teachers can view their own homework_assignments" ON public.homework_assignments;
DROP POLICY IF EXISTS "homework_assignments_select_own_or_parent" ON public.homework_assignments;
CREATE POLICY "homework_assignments_select_own_or_parent" ON public.homework_assignments
    FOR SELECT USING (
        auth.uid() = teacher_id
        OR public.is_teacher_of_my_child(teacher_id)
    );

DROP POLICY IF EXISTS "Teachers can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own_or_parent" ON public.notifications;
CREATE POLICY "notifications_select_own_or_parent" ON public.notifications
    FOR SELECT USING (
        auth.uid() = teacher_id
        -- Either addressed to one of my children, or a broadcast from their teacher.
        OR (public.is_teacher_of_my_child(teacher_id)
            AND (target IN (SELECT public.my_children()::text) OR target IN ('all', 'broadcast', '')))
    );

-- `settings` carries the school name and logo the portal prints on the student
-- card, so a parent needs to read the row of their child's teacher.
DROP POLICY IF EXISTS "settings_select_own_or_parent" ON public.settings;
CREATE POLICY "settings_select_own_or_parent" ON public.settings
    FOR SELECT USING (
        auth.uid() = teacher_id
        OR public.is_teacher_of_my_child(teacher_id)
    );

-- -----------------------------------------------------------------------------
-- 5. Grants + PostgREST schema cache
-- -----------------------------------------------------------------------------
-- 00005 granted on ALL TABLES as they existed then; this table is newer, so it
-- needs its own grant. Read-only for parents: no INSERT/UPDATE/DELETE.
GRANT SELECT ON public.parent_students TO authenticated;
GRANT ALL    ON public.parent_students TO service_role;

COMMIT;

-- PostgREST caches the schema; without this a brand-new table 404s as PGRST205
-- until the container is restarted.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- A parent must see exactly their linked children and nothing else:
-- --   SELECT count(*) FROM students;     -- = number of linked children
-- --   SELECT count(*) FROM scores;       -- only those children's marks
-- --   SELECT count(*) FROM attendance;   -- only those children's marks
--
-- -- No write policy exists for parents (expect zero rows):
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='parent_students' AND cmd <> 'SELECT'
--    AND policyname LIKE '%parent%';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS "settings_select_own_or_parent" ON public.settings;
-- DROP POLICY IF EXISTS "notifications_select_own_or_parent" ON public.notifications;
-- DROP POLICY IF EXISTS "homework_assignments_select_own_or_parent" ON public.homework_assignments;
-- DROP POLICY IF EXISTS "attendance_select_own_or_parent" ON public.attendance;
-- CREATE POLICY "Teachers can view their own attendance" ON public.attendance
--     FOR SELECT USING (auth.uid() = teacher_id);
-- -- restore students/scores policies from 00006 / 00007, then:
-- DROP TABLE IF EXISTS public.parent_students CASCADE;
-- DROP FUNCTION IF EXISTS public.is_teacher_of_my_child(UUID);
-- DROP FUNCTION IF EXISTS public.my_children();
-- DROP FUNCTION IF EXISTS public.is_parent_of(UUID);
-- COMMIT;
-- =============================================================================
