-- =============================================================================
-- 00036_finish_a_transfer_you_may_start.sql
-- =============================================================================
-- A teacher who is allowed to START a transfer must be allowed to FINISH it.
--
-- THE DEFECT — measured, not theorised
-- `moveEnrolment` (lib/enrolment/move.ts) is TWO PostgREST calls, and they are
-- two separate committed transactions:
--
--     1. UPDATE student_enrollments SET status='transferred' … (close the source)
--     2. INSERT INTO student_enrollments … 'active'            (open the target)
--
-- `student_enrollments_write_assigned_or_admin` (00033) requires
--
--     (homeroom of the row's class OR admin of its year's school)
--     AND public.can_enrol_student(student_id)
--
-- and `can_enrol_student` resolves through `can_write_for_student` →
-- `can_access_student`, which requires an **ACTIVE** enrolment:
--
--     AND se.status = 'active'          -- 00006
--
-- So step 1 destroys the caller's own authorisation before step 2 runs. For a
-- form master who did not CREATE the pupil, and is not a school admin:
--
--     before        : [{"name":"៤ក","status":"active"}]
--     step 1 close  : OK (1 row)
--     step 2 open   : DENIED 42501
--     after step 2  : [{"name":"៤ក","status":"transferred"}]
--     >>> the pupil now has 0 ACTIVE enrolment(s)
--
-- The pupil has left every roster in the product — `resolveScope`,
-- `fetchStudentsForScope` and every class-scoped read take `status='active'` —
-- and is on no class list, no register, no mark sheet.
--
-- WHY THE TEACHER CANNOT UNDO IT
-- Reopening the source row is an UPDATE, and the policy's `USING` clause
-- re-evaluates `can_enrol_student` on the way in. It is now false. The repair
-- is `0 rows affected` — reported by `moveEnrolment` as a permission message
-- for a row the teacher was manipulating a second earlier. Only the pupil's
-- creator or a school admin can put the child back, and nothing tells the
-- teacher that.
--
-- WHY IT HAS NOT BEEN SEEN
-- It works whenever the transferring teacher also created the pupil, because
-- `can_write_for_student`'s legacy-owner branch never looks at enrolment at
-- all. That is the case in the fixtures and was the case in the Phase 18
-- browser test. It fails for exactly the pupil a transfer is *for*: one who
-- arrived from somebody else's class.
--
-- THE APPLICATION IS WIDER THAN THE DATABASE, AND THAT IS THE BUG'S SHAPE
-- `transferStudentToMyClass` authorises "homeroom of the source AND homeroom of
-- the destination". It never asks who created the pupil. RLS asks. Where an
-- application is *narrower* than RLS the mismatch is a disabled button; where
-- it is *wider*, as here, the mismatch is damage — the app lets the teacher
-- start something the database will abandon half-finished. 00033's own header
-- records the assumption that broke: it lists `transferStudentToMyClass` as
-- covered because the "pupil is in a class it is assigned to" — true when the
-- policy is checked for step 1, false by the time it is checked for step 2.
--
-- THE FIX
-- One branch on one function. `can_enrol_student` also grants when the caller
-- is homeroom of a class this pupil holds an enrolment row in **of any status**
-- — including the row the transfer just closed.
--
-- It grants exactly the relationship the caller demonstrably held a moment
-- earlier, and it is the relationship the transfer itself ended.
--
-- WHAT THIS DOES NOT TOUCH
--   `can_access_student`      unchanged — no new READ of any pupil
--   `can_write_for_student`   unchanged — no new score or attendance authority
--   `students` policies       unchanged — no new read, edit or delete of a pupil
--   00035's partial index     unchanged — still one active enrolment per pupil
--   Phase 18's Policy A       unchanged — this grants no way to FIND a pupil;
--                             every branch below starts from a row the caller's
--                             own class already holds
-- `can_enrol_student` is consumed by ONE policy — `student_enrollments` writes —
-- and by nothing else. That is the whole blast radius.
--
-- HOW FAR THE NEW BRANCH REACHES, STATED PRECISELY
-- A teacher who is homeroom of a class a pupil holds any enrolment row in may
-- enrol that pupil into a class they are ALSO homeroom of. Both halves are
-- required: the policy's own `is_homeroom` test on the target class is
-- unchanged and is ANDed with this.
--
--   * It cannot reach a pupil the caller has never taught — a form master with
--     no enrolment row for the pupil is still refused, and so is another
--     school.
--   * It cannot DISPLACE a pupil from a class the caller does not hold. Taking
--     a pupil who is actively enrolled elsewhere requires closing that row
--     first, which still requires being ITS homeroom teacher; without that,
--     00035 refuses the second active row with 23505.
--   * It is `is_homeroom`, deliberately: a subject teacher gains nothing here,
--     and the branch is therefore narrower on that axis than the
--     `can_access_student` branch beside it.
--
-- The one genuine widening: a pupil with NO active enrolment — withdrawn, or
-- between classes — may be re-enrolled by a former form master of theirs, not
-- only by their creator or an admin. That is a teacher who actually taught the
-- child, acting on a child who is currently on no roster, and it is the same
-- act as the repair above. It is recorded here rather than left to be
-- discovered.
--
-- ROLLBACK
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.can_enrol_student(student UUID)
--   RETURNS BOOLEAN
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
--   AS $$
--       SELECT public.can_write_for_student(student)
--           OR EXISTS (
--               SELECT 1 FROM public.students s
--                WHERE s.id = student
--                  AND s.school_id IS NOT NULL
--                  AND public.is_school_admin(s.school_id)
--           );
--   $$;
--   COMMIT;
-- Reverting re-opens the orphaning described above; it changes no data either
-- way, and no row written under this migration becomes invalid.
-- =============================================================================

BEGIN;

-- The first two branches are character-for-character 00033's. Only the third is
-- new, so nothing that was granted before is granted less widely now.
CREATE OR REPLACE FUNCTION public.can_enrol_student(student UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    -- Owns the pupil row (legacy), or is assigned to a class they are ACTIVELY
    -- enrolled in.
    SELECT public.can_write_for_student(student)
    -- ...or administers the school the pupil belongs to. `school_id IS NOT NULL`
    -- matters: it is nullable, and `is_school_admin(NULL)` must never be the
    -- thing that decides this.
        OR EXISTS (
            SELECT 1 FROM public.students s
             WHERE s.id = student
               AND s.school_id IS NOT NULL
               AND public.is_school_admin(s.school_id)
        )
    -- ...or is the form master of a class this pupil holds an enrolment row in,
    -- WHATEVER its status. This is the branch 00036 adds.
    --
    -- The missing `se.status = 'active'` is the entire point and must not be
    -- "tidied up": the row a transfer has just closed is precisely the row that
    -- proves the caller was entitled to close it. Requiring it to still be open
    -- is what stranded the pupil between the two halves of the move.
        OR EXISTS (
            SELECT 1
              FROM public.student_enrollments se
              JOIN public.teacher_assignments ta ON ta.class_id = se.class_id
             WHERE se.student_id = student
               AND ta.teacher_id = auth.uid()
               AND ta.is_homeroom
               AND ta.status = 'active'
        );
$$;

COMMENT ON FUNCTION public.can_enrol_student(UUID) IS
    'True when the caller may place this pupil in a class: they own the pupil
     row, teach a class the pupil is actively enrolled in, administer the
     pupil''s school, or are form master of a class the pupil holds an enrolment
     row in of ANY status — which is what lets a teacher finish a transfer they
     were allowed to start. Gates writes to student_enrollments so that holding
     a class is not by itself sufficient to acquire a pupil.';

GRANT EXECUTE ON FUNCTION public.can_enrol_student(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
