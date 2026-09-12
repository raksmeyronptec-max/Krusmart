-- =============================================================================
-- 00034_attendance_status_domain.sql
-- =============================================================================
-- Write down, in the schema, the four values `attendance.status` is allowed to
-- hold. Adds no new concept — see the header of `lib/attendance/status.ts`,
-- which has declared exactly these four since the vocabulary was unified.
--
-- THE HOLE
-- `attendance.status` is `TEXT NOT NULL DEFAULT 'P'` with no CHECK constraint
-- (00001). The three buttons on `/attendance/layout` were the only thing
-- standing between the column and any string at all, and a teacher's client is
-- not obliged to use them. Demonstrated against a running stack as the signed-in
-- fixture teacher, through PostgREST rather than the app:
--
--     PATCH /rest/v1/attendance?student_id=eq.<own pupil>&date=eq.2026-09-11
--     { "status": "late123" }
--     -> 200, row updated
--
-- RLS was never the issue: the row belonged to that teacher, so the policy was
-- right to allow the write. Nothing anywhere said the VALUE was nonsense.
-- `/students/[id]` then rendered `late123` verbatim as the pupil's mark for the
-- day, beside a real one.
--
-- Phase 17 closes the application half in `saveAttendance` / `saveAttendanceBulk`
-- (`isEnterableStatus`). This is the other half: the guard that holds for a
-- client which never calls those actions.
--
-- THE FOUR VALUES, AND WHY IT IS FOUR AND NOT THREE
--   'P'   មក        — in class
--   'L'   ច្បាប់     — absent WITH the school's permission
--   'A'   អវត្តមាន   — absent without
--   'AP'  a legacy spelling of 'L'. Nothing in this application has ever
--         written it and the register does not offer it, but the readers
--         tolerate it and a deployment may hold rows from a build that did.
--         Excluding it here would make those rows unwritable — a silent
--         reinterpretation of historical records, which is exactly what a
--         semantics phase must not do.
--
-- The application layer is stricter on purpose: `isEnterableStatus` accepts only
-- the three the register offers. The database says what may be STORED; the
-- action says what may be ENTERED.
--
-- NOT VALID, DELIBERATELY
-- The constraint is added `NOT VALID`, which enforces it on every INSERT and
-- UPDATE from this point on while leaving rows already in the table unchecked.
-- Two reasons:
--
--   * A validated constraint would make this migration FAIL on any deployment
--     holding a value outside the set — turning a data problem into an outage,
--     on a table every teacher writes to daily.
--   * Repairing such a row automatically would mean guessing what its author
--     meant. A mark nobody can interpret must be looked at by a human, not
--     silently rewritten into one of ours. The readers already handle it
--     safely: `markFor` returns NULL, so it counts as `unknown` and stays out
--     of every attendance rate.
--
-- The local database was checked before writing this: `SELECT status, count(*)
-- FROM attendance GROUP BY status` returned only 'P' and 'L'. To promote the
-- constraint on a deployment once its data is known to be clean:
--
--     ALTER TABLE public.attendance VALIDATE CONSTRAINT attendance_status_known;
--
-- No policy, grant, index or column is touched. RLS is unchanged.
--
-- ROLLBACK
--   ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_known;
-- Changes no data either way — the constraint is NOT VALID, so no existing row
-- was rewritten to satisfy it and none becomes invalid when it goes. Reverting
-- re-opens the table to a fifth mark that lib/attendance/status.ts does not
-- declare and every counting surface would read as `unknown`.
-- =============================================================================

DO $$
DECLARE
    unknown_rows bigint;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.attendance'::regclass
          AND conname  = 'attendance_status_known'
    ) THEN
        RAISE NOTICE '00034: attendance_status_known already present, skipping';
        RETURN;
    END IF;

    -- Reported, never repaired. See the header.
    SELECT count(*) INTO unknown_rows
    FROM public.attendance
    WHERE status NOT IN ('P', 'L', 'A', 'AP');

    IF unknown_rows > 0 THEN
        RAISE WARNING
            '00034: % attendance row(s) hold a status outside (P, L, A, AP). The constraint is NOT VALID, so they are left exactly as they are and no new write may add another. Inspect them before running VALIDATE CONSTRAINT.',
            unknown_rows;
    END IF;

    ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_status_known
        CHECK (status IN ('P', 'L', 'A', 'AP'))
        NOT VALID;
END $$;

COMMENT ON CONSTRAINT attendance_status_known ON public.attendance IS
    'The four marks lib/attendance/status.ts declares. P in class; L absent with permission; A absent without; AP a legacy spelling of L that nothing writes. Adding a fifth mark means changing this constraint AND that module together.';
