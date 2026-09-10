-- =============================================================================
-- 00033_enrolment_requires_relationship.sql
-- =============================================================================
-- Close the enrolment counterpart of the hole 00011 closed for marks.
--
-- THE DEFECT
-- `student_enrollments_write_assigned_or_admin` (00003) authorises by CLASS and
-- never by STUDENT:
--
--     FOR ALL USING (
--         EXISTS (… teacher_assignments ta
--                  WHERE ta.class_id = student_enrollments.class_id
--                    AND ta.teacher_id = auth.uid() AND ta.is_homeroom)
--         OR EXISTS (… academic_years ay
--                     WHERE ay.id = student_enrollments.academic_year_id
--                       AND public.is_school_admin(ay.school_id))
--     )
--
-- Every form master satisfies the first branch for their own class. Nothing in
-- the predicate mentions `student_id` — so a form master may enrol ANY student
-- id they can name into their own class:
--
--     POST /rest/v1/student_enrollments
--     { "student_id": "<a pupil in another school>",
--       "class_id": "<my own class>", "academic_year_id": "<my year>" }
--     -> 201 Created
--
-- Proven, not theorised: scripts/validate-rls.mjs demonstrated exactly this
-- across two schools before this migration, and asserts the denial after it.
--
-- WHY IT MATTERS
-- An enrolment row is not a label. 00006 and 00007 pivot class-scoped reads on
-- "is this pupil enrolled in a class I am assigned to", and 00011's
-- `can_access_student` says the same. So writing one is how a caller ACQUIRES a
-- pupil: enrol a stranger's child into your class and their name, their marks
-- and their attendance become readable.
--
-- This is the same shape 00011 described for `scores` and `attendance` — "the
-- write policies check that the writer names themselves, never that they
-- actually teach the student" — one table further on. 00011 fixed the two
-- tables it was written for and this one was never revisited.
--
-- The hole has been open since V2 was built. What changes now is reach: until
-- this release only the admin console wrote enrolments, and the teacher app has
-- a transfer control on /students/[id].
--
-- THE FIX
-- The class check is kept exactly as it is, and ANDed with a relationship to
-- the pupil — the same two-part rule 00011 established:
--
--   can_write_for_student()   the caller owns the pupil row (legacy), or is
--                             assigned to a class the pupil is enrolled in.
--                             Covers enrolling a pupil you just created, and
--                             transferring one out of your own class.
--   school administrator      the pupil belongs to a school you administer.
--                             `/admin/enrollments` already lists only
--                             `students.school_id = <the admin's school>`, so
--                             this is exactly the set that console can act on.
--
-- EVERY WRITER, CHECKED
--   createStudent + enrolStudents   owns the row it just inserted        ✓
--   importStudents                  same                                  ✓
--   transferStudentToMyClass        pupil is in a class it is assigned to ✓
--   admin move / withdraw / bulk    pupil carries the admin's school_id   ✓
--   backfill_teacher_enrolments     SECURITY DEFINER, bypasses RLS       n/a
--
-- ROLLBACK
--   BEGIN;
--   DROP POLICY IF EXISTS "student_enrollments_write_assigned_or_admin" ON public.student_enrollments;
--   CREATE POLICY "student_enrollments_write_assigned_or_admin" ON public.student_enrollments
--       FOR ALL USING (
--           EXISTS (SELECT 1 FROM public.teacher_assignments ta
--                    WHERE ta.class_id = student_enrollments.class_id
--                      AND ta.teacher_id = auth.uid() AND ta.is_homeroom)
--           OR EXISTS (SELECT 1 FROM public.academic_years ay
--                       WHERE ay.id = student_enrollments.academic_year_id
--                         AND public.is_school_admin(ay.school_id))
--       );
--   COMMIT;
-- Reverting re-opens the hole; it changes no data either way.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- The pupil-side predicate
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so the lookup does not re-enter RLS on `students` — the same
-- reason `can_access_student` and `can_write_for_student` are, and the reason
-- 00003's own cross-table lookups are.
CREATE OR REPLACE FUNCTION public.can_enrol_student(student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    -- Owns the pupil row, or is assigned to a class they are enrolled in.
    SELECT public.can_write_for_student(student)
    -- ...or administers the school the pupil belongs to. `school_id IS NOT NULL`
    -- matters: it is nullable, and `is_school_admin(NULL)` must never be the
    -- thing that decides this.
        OR EXISTS (
            SELECT 1 FROM public.students s
             WHERE s.id = student
               AND s.school_id IS NOT NULL
               AND public.is_school_admin(s.school_id)
        );
$$;

COMMENT ON FUNCTION public.can_enrol_student(UUID) IS
    'True when the caller may place this pupil in a class: they own the pupil
     row, teach a class the pupil is enrolled in, or administer the pupil''s
     school. Gates writes to student_enrollments so that holding a class is not
     by itself sufficient to acquire a pupil.';

GRANT EXECUTE ON FUNCTION public.can_enrol_student(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- The policy
-- -----------------------------------------------------------------------------
-- The class half is character-for-character 00003's. Only the AND is new, so
-- nothing that was refused before is refused less narrowly now.
DROP POLICY IF EXISTS "student_enrollments_write_assigned_or_admin" ON public.student_enrollments;
CREATE POLICY "student_enrollments_write_assigned_or_admin" ON public.student_enrollments
    FOR ALL USING (
        (
            EXISTS (SELECT 1 FROM public.teacher_assignments ta
                     WHERE ta.class_id = student_enrollments.class_id
                       AND ta.teacher_id = auth.uid() AND ta.is_homeroom)
            OR EXISTS (SELECT 1 FROM public.academic_years ay
                        WHERE ay.id = student_enrollments.academic_year_id
                          AND public.is_school_admin(ay.school_id))
        )
        AND public.can_enrol_student(student_enrollments.student_id)
    );

NOTIFY pgrst, 'reload schema';

COMMIT;
