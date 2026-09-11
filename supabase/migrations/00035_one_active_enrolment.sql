-- =============================================================================
-- 00035_one_active_enrolment.sql
-- =============================================================================
-- A pupil is in ONE class at a time. Say so in the schema.
--
-- Adds no capability and widens nothing. No policy is created, altered or
-- dropped; no predicate is relaxed; no new SELECT path is opened. This is a
-- constraint, and it binds everyone equally — a teacher, a school admin, the
-- transfer helper, a crafted request.
--
-- THE INVARIANT THE CODE ALREADY ASSUMED
-- `lib/enrolment/move.ts` closes the source enrolment BEFORE inserting the
-- destination, and says why in its own comment: otherwise "the pupil would be
-- inserted into the destination while still openly enrolled". `resolveScope`,
-- `fetchStudentsForScope` and every roster read take `status = 'active'` to
-- name exactly one class. The product has believed this since V2. The table
-- never said it.
--
-- WHAT THAT COST — demonstrated, not theorised
-- `UNIQUE (student_id, class_id, academic_year_id)` stops a pupil being
-- enrolled into the SAME class twice. It says nothing about two DIFFERENT
-- classes. Measured against this schema, as the `authenticated` role:
--
--     pupil created by T1, actively enrolled ONLY in T2's class ៤ខ
--     T1 enrols them into ៤ក   -> ALLOWED
--     -> pupil ACTIVE in ៤ខ AND ៤ក, present in BOTH teachers' rosters
--
-- The write was correctly authorised: `can_enrol_student` grants on
-- `students.teacher_id`, and T1 created that pupil. `teacher_id` is the legacy
-- roster column — a pre-V2 account's entire roster is that column and has no
-- enrolment rows at all — so it cannot be narrowed without making those
-- rosters vanish. It is the right grant; what was missing was the invariant.
--
-- The result was not a transfer. It was a DUPLICATE: two teachers marking
-- attendance, entering scores and printing reports for one child, neither told
-- about the other. "Enrol an existing pupil" silently became "also put them in
-- my class", which is precisely the conflation Phase 18 exists to prevent.
--
-- No application path can produce this. `/enrollment` only ever creates new
-- pupils, and `enrolOrCompensate` inserts enrolments only for ids it has just
-- created. The exploit needs a crafted PostgREST request — which is why the
-- refusal belongs here and not in a disabled button.
--
-- A PARTIAL INDEX, NOT A TABLE CONSTRAINT
-- Only ACTIVE rows are constrained. A pupil's history is a stack of closed rows
-- — `promoted`, `transferred`, `withdrawn` — and every one of them shares the
-- pupil and the year with the row that replaced it. Constraining all statuses
-- would make history unrecordable, and `enrolmentHistory()` exists to read it.
--
-- NULL `status` is treated as active, matching the column default and
-- `moveEnrolment`, which writes 'active' explicitly and closes by stamping a
-- status. A NULL row is an open enrolment whatever wrote it.
--
-- IF THIS MIGRATION FAILS
-- It raises, naming the pupils, rather than choosing a class for them. A pupil
-- recorded in two classes is a question only a human can answer — which class
-- is the real one — and guessing would silently discard a teacher's roster.
-- The local database was checked before this was written: zero violations.
-- To find them on a deployment:
--
--     SELECT se.student_id, s.name_kh, count(*)
--       FROM public.student_enrollments se
--       JOIN public.students s ON s.id = se.student_id
--      WHERE se.status = 'active' OR se.status IS NULL
--      GROUP BY se.student_id, s.name_kh, se.academic_year_id
--     HAVING count(*) > 1;
--
-- Resolve each by closing the enrolment the pupil has actually left
-- (`status = 'transferred'`, `left_at = now()`), then re-run.
-- =============================================================================

DO $$
DECLARE
    offenders bigint;
    sample    text;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'student_enrollments_one_active_per_year'
          AND relkind = 'i'
    ) THEN
        RAISE NOTICE '00035: student_enrollments_one_active_per_year already present, skipping';
        RETURN;
    END IF;

    SELECT count(*), string_agg(DISTINCT name_kh, ', ')
      INTO offenders, sample
      FROM (
        SELECT s.name_kh
          FROM public.student_enrollments se
          JOIN public.students s ON s.id = se.student_id
         WHERE se.status = 'active' OR se.status IS NULL
         GROUP BY se.student_id, s.name_kh, se.academic_year_id
        HAVING count(*) > 1
      ) dup;

    IF COALESCE(offenders, 0) > 0 THEN
        RAISE EXCEPTION
            '00035: % pupil(s) are actively enrolled in more than one class in the same academic year (%). Close the enrolment each pupil has left before applying this migration — see the header for the query and the remedy. Nothing has been changed.',
            offenders, sample;
    END IF;

    CREATE UNIQUE INDEX student_enrollments_one_active_per_year
        ON public.student_enrollments (student_id, academic_year_id)
     WHERE status = 'active' OR status IS NULL;
END $$;

COMMENT ON INDEX public.student_enrollments_one_active_per_year IS
    'A pupil is in one class at a time. Partial, so a pupil''s closed history (promoted/transferred/withdrawn) stays recordable. NULL status counts as active, matching the column default. Enrolling a pupil who is already enrolled is a TRANSFER: close the open row first, which is what lib/enrolment/move.ts does.';
