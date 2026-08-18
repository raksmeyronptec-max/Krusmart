-- =============================================================================
-- 00019_backfill_never_enrolled_only.sql
-- =============================================================================
-- Align backfill_teacher_enrolments' write predicate with the recovery
-- banner's count: only students with NO enrolment row at all are enrolled.
--
-- THE DEFECT
-- 00018's skip guard was scoped to the target academic year:
--
--     NOT EXISTS (... se.academic_year_id = v_year
--                     AND se.status = 'active' AND se.class_id <> v_class)
--
-- while the banner that invites the call counts students with no enrolment
-- row anywhere (`countRecoverableLegacyStudents` in lib/utils/serverScope.ts).
-- A student whose only enrolment is in a *previous* year passed the guard and
-- was written. Reproduced before this migration: a teacher with 25 students
-- actively enrolled in last year's class and 5 never enrolled, holding a
-- current-year homeroom — the banner said ៥, the RPC returned 30, and the 25
-- ended up actively enrolled in two classes across two years.
--
-- WHY THE COUNT'S PREDICATE WINS
-- Moving a roster into a new year is *promotion*, and the product already has
-- an explicit, append-only workflow for it (`bulkPromoteClass` in
-- app/admin/enrollments/actions.ts): it closes the old rows with status
-- 'promoted' before opening new ones, so a student's history reads correctly
-- and no one is active in two classes at once. The 00018 behaviour was a
-- silent promotion that skipped that bookkeeping. Recovery's one job is to
-- repair students stranded *outside* the enrolment system — by the 2686507
-- onboarding gap or a failed enrol-compensation — and a student with any
-- enrolment row, in any year, any status, is not outside the system: someone
-- placed (or removed) them on purpose.
--
-- This also narrows the withdrawn case: 00018 would re-enrol a student whose
-- only row was a withdrawal in another class; now an explicit withdrawal
-- keeps them out of bulk recovery everywhere, matching how 00018 already
-- treated a withdrawal from the target class itself.
--
-- Onboarding is unaffected where it matters: a legacy roster has no enrolment
-- rows at all, so the first-time backfill enrols exactly as before.
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
    -- assignments — never from p_class_id directly (see 00018).
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
       -- The whole predicate: any enrolment row, in any year and any status,
       -- means this student is inside the enrolment system and is moved only
       -- through the explicit promote/transfer/withdraw workflows. This must
       -- stay identical to countRecoverableLegacyStudents (serverScope.ts),
       -- which decides when the recovery banner is shown and what it promises.
       AND NOT EXISTS (
             SELECT 1
               FROM public.student_enrollments se
              WHERE se.student_id = s.id
           )
        -- Unreachable given the guard above; kept as the concurrency belt.
        ON CONFLICT (student_id, class_id, academic_year_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.backfill_teacher_enrolments(UUID) IS
    'Enrols every student owned by the calling teacher (students.teacher_id =
     auth.uid()) that has no student_enrollments row at all into the teacher''s
     active homeroom class. Since 00019 the predicate matches the recovery
     banner''s count exactly: students with any enrolment history are moved
     only through the explicit promote/transfer/withdraw workflows, never by
     recovery. Idempotent; additive only. Returns the number created.';

-- CREATE OR REPLACE preserves the ACL, but the security posture of a definer
-- function should be readable in the file that last defined it.
REVOKE ALL   ON FUNCTION public.backfill_teacher_enrolments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_teacher_enrolments(UUID) TO authenticated;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Re-apply the CREATE OR REPLACE FUNCTION block from
-- 00018_backfill_teacher_enrolments.sql (the year-scoped skip guard).
-- =============================================================================
