-- =============================================================================
-- 00018_backfill_teacher_enrolments.sql
-- =============================================================================
-- Enrol a teacher's existing roster into the class they just created, so
-- finishing onboarding stops making their students disappear.
--
-- THE DEFECT
-- `createClassAndAssign` (app/onboarding/actions.ts) inserts a class and a
-- homeroom `teacher_assignments` row. The moment that row exists, every scoped
-- read flips from legacy to v2 (`isLegacy` in TeacherContext, `resolveScope`,
-- `resolveServerScope` — all keyed on "has any active assignment"), and the v2
-- roster is read from `student_enrollments`, not `students.teacher_id`
-- (see `fetchStudentsForScope`). Nothing on the teacher-facing side ever wrote
-- `student_enrollments`: the only writer in the app is the admin console, which
-- a self-serve teacher is never routed to. So a legacy teacher with N students
-- who completed onboarding saw all N vanish from every roster-consuming screen.
-- The rows were still there — unreadable, not deleted.
--
-- 00004 does not cover this: its backfill ran once, at migration time, against
-- the `_teacher_class` mapping of accounts that existed *then*. A teacher who
-- self-onboards later gets nothing from it. This function is the same
-- `students JOIN` → `student_enrollments` move as 00004 step 8, packaged so the
-- application can invoke it at the moment the class comes into existence.
--
-- WHY SECURITY DEFINER
-- The app holds no service-role key; SECURITY DEFINER is the only elevated
-- context there is (see 00017). Strictly, RLS would even permit these writes —
-- `student_enrollments_write_assigned_or_admin` lets a homeroom teacher insert
-- rows for their own class — but a definer function buys two things PostgREST
-- calls cannot: the whole backfill commits or rolls back as one transaction
-- (no half-enrolled roster on a dropped connection), and the behaviour cannot
-- silently change if a later migration reshapes the write policy. Same
-- defensive posture as `create_teacher_organisation`:
--
--   * `search_path` pinned, so a caller cannot shadow `public`.
--   * EXECUTE revoked from PUBLIC/anon; only `authenticated` may call.
--   * Every row read and written is keyed on `auth.uid()`. The one caller-
--     supplied identifier, `p_class_id`, is only ever resolved *through* the
--     caller's own active homeroom assignments — an id the caller does not
--     hold matches nothing and raises, it never widens the query.
--   * Idempotent. Re-running inserts nothing new: the unique key
--     `(student_id, class_id, academic_year_id)` (00003) is the conflict
--     target and duplicates are skipped, so a client retrying a failed
--     request cannot double-enrol anyone.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It never touches `students`. `teacher_id` stays exactly as it is — that
--     column is the legacy path, and accounts that have not onboarded still
--     read through it.
--   * It does not move anyone. A student already *actively* enrolled in a
--     different class for the same year was placed there deliberately (an
--     admin transfer, a promotion) and is skipped, not re-homed.
--   * It does not resurrect the withdrawn. A `withdrawn` row for this exact
--     class and year hits the conflict target and stays as it is; an explicit
--     withdrawal outranks parity with the legacy roster.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.backfill_teacher_enrolments(
    p_class_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user     UUID := auth.uid();
    v_class    UUID;
    v_year     UUID;
    v_inserted INTEGER;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'មិនទាន់មានការចូលគណនី'
            USING ERRCODE = '28000';
    END IF;

    -- Resolve the target class from the caller's OWN active homeroom
    -- assignments — never from p_class_id directly. Homeroom, because that is
    -- the assignment onboarding creates and the one the enrolment write policy
    -- keys on; "most recent" matches how /onboarding/students already picks.
    SELECT ta.class_id, ta.academic_year_id
      INTO v_class, v_year
      FROM public.teacher_assignments ta
     WHERE ta.teacher_id = v_user
       AND ta.status = 'active'
       AND ta.is_homeroom
       AND (p_class_id IS NULL OR ta.class_id = p_class_id)
     ORDER BY ta.created_at DESC
     LIMIT 1;

    IF v_class IS NULL THEN
        RAISE EXCEPTION 'រកមិនឃើញថ្នាក់របស់អ្នកទេ'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
    SELECT s.id, v_class, v_year, 'active'
      FROM public.students s
     WHERE s.teacher_id = v_user
       -- Already deliberately placed somewhere else this year — leave them.
       AND NOT EXISTS (
             SELECT 1
               FROM public.student_enrollments se
              WHERE se.student_id = s.id
                AND se.academic_year_id = v_year
                AND se.status = 'active'
                AND se.class_id <> v_class
           )
        ON CONFLICT (student_id, class_id, academic_year_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.backfill_teacher_enrolments(UUID) IS
    'Enrols every student owned by the calling teacher (students.teacher_id =
     auth.uid()) into the teacher''s active homeroom class for its academic
     year. Idempotent; additive only — students rows are never modified.
     Called by onboarding right after the class and assignment are created,
     and by the roster-recovery action for teachers stranded by the gap this
     closes. Returns the number of enrolments created.';

REVOKE ALL   ON FUNCTION public.backfill_teacher_enrolments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_teacher_enrolments(UUID) TO authenticated;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP FUNCTION IF EXISTS public.backfill_teacher_enrolments(UUID);
-- -- Enrolments it created are ordinary rows, indistinguishable by design from
-- -- admin-created ones; remove per class if ever needed:
-- --   DELETE FROM public.student_enrollments se
-- --    USING public.students s
-- --    WHERE s.id = se.student_id AND se.class_id = '<class>'
-- --      AND s.teacher_id = '<teacher>';
-- =============================================================================
