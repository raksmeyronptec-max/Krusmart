-- =============================================================================
-- 00029_score_calendar_periods.sql
-- =============================================================================
-- Teacher-defined score periods: which months a class collects marks in, how
-- they group, and (from the locking phase) whether a period is closed.
--
-- WHY THIS TABLE EXISTS
-- The academic year and its semester split were compiled in — sem1 was the
-- first five months of MONTHS_BY_ACADEMIC_YEAR, full stop. Teachers set their
-- own collection dates, and some count two months as one period (មីនា-មេសា
-- graded once in semester 1). This table stores that calendar as data.
--
-- TWO LAYERS, NOT THREE — NO 'system' SCOPE ON PURPOSE
-- `score_template_subjects` (00016) has a seeded system layer. This table does
-- not: the system layer is DEFAULT_CALENDAR in lib/scores/calendar.ts, twelve
-- one-month periods derived from MONTHS_BY_ACADEMIC_YEAR. Zero rows here MUST
-- mean today's behaviour exactly (INV-2 in docs/score-period-and-entry-design
-- §11.2), and a seed can drift from the code that falls back when the seed is
-- absent — code that IS the fallback cannot disagree with itself.
--
-- ★ THE ANCHOR RULE (INV-1)
-- `scores.score_period` = '<monthId>-<academicYear>' is schema, parsed back in
-- at least five places (report-data, students/[id], attendance/yearly,
-- record-book, parent-report). So `month_key` is an ANCHOR: an existing
-- MonthId, the first month of the period in academic-year order. A merged
-- មីនា-មេសា period is the row (month_key='mar', member_months={mar,apr}) and
-- its marks store under 'mar-<year>' exactly as unmerged March marks always
-- have. member_months and label change; the key space never does. No row may
-- carry an invented key like 'mar_apr', and the member_months_valid CHECK
-- makes that unrepresentable rather than merely wrong.
--
-- WHOLE-SET OVERRIDE (INV-3)
-- A calendar is a partition of twelve months, so a layer overrides as a whole
-- set: resolveCalendar() takes ALL the class rows, else ALL the school rows,
-- else the default — never a row-by-row merge, which could stitch two halves
-- of different partitions into one that counts a month twice. The editor
-- writes copy-on-write: the full period set in one transaction.
--
-- WHAT POSTGRES CANNOT ENFORCE
-- The partition rule itself — a month in at most one period — spans rows, so
-- a CHECK cannot see it. validateCalendar() (pure, lib/scores/calendar.ts) is
-- called client-side before save enables AND in the server action before the
-- write; the second call is the boundary. A month in NO period is valid: it
-- means the class does not collect marks that month.
--
-- DATES ARE ADVISORY (INV-4)
-- starts_on / ends_on guide the entry picker's default and (with locked_at)
-- gate writes. They are never part of a key, and changing them never moves a
-- mark. locked_at / locked_by are created now and consumed by the locking
-- phase; until then every row reads as unlocked.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.score_calendar_periods (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Two layers, like score_template_subjects minus 'system' (see header).
    scope         TEXT NOT NULL CHECK (scope IN ('school', 'class')),
    school_id     UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id      UUID REFERENCES public.classes(id) ON DELETE CASCADE,

    -- The right half of score_period, e.g. '2025-2026'. Stored — unlike
    -- class_template_subjects, which lets class_id imply the year — because
    -- school-scope rows have no class to imply it from, and a class's calendar
    -- for next year must be writable while this year's is still live.
    academic_year TEXT NOT NULL,

    -- ★ The anchor: the left half of score_period. A valid MonthId (INV-1).
    month_key     TEXT NOT NULL,

    -- Every month this period covers, month_key included.
    -- {mar,apr} = "មីនា-មេសា counted as one".
    member_months TEXT[] NOT NULL,

    -- NULL = derive the label from member_months ('មីនា-មេសា').
    label_km      TEXT,

    semester      TEXT NOT NULL CHECK (semester IN ('sem1', 'sem2')),

    -- Advisory collection window + lock. Never part of a key (INV-4).
    starts_on     DATE,
    ends_on       DATE,

    -- Locked = no more score upserts for this (class, period). Written and
    -- enforced from the locking phase; created now so the shape is complete.
    locked_at     TIMESTAMPTZ,
    locked_by     UUID REFERENCES auth.users(id),

    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- The anchor is one of its own members — which also rules out an empty
    -- member_months.
    CONSTRAINT anchor_is_member CHECK (month_key = ANY(member_months)),

    -- Only real MonthIds may appear, so an invented key like 'mar_apr' is
    -- unrepresentable at the deepest layer, not merely refused by the action.
    -- (month_key's own validity follows from this plus anchor_is_member.)
    CONSTRAINT member_months_valid CHECK (
        member_months <@ ARRAY['jan','feb','mar','apr','may','jun',
                               'jul','aug','sep','oct','nov','dec']::TEXT[]
    ),

    CONSTRAINT scope_target CHECK (
        (scope = 'school' AND school_id IS NOT NULL AND class_id IS NULL) OR
        (scope = 'class'  AND class_id  IS NOT NULL)
    )
);

-- One period per anchor per target per year. Partial, because the same anchor
-- legitimately exists once at each layer — a class overriding its school's
-- calendar re-states the year's whole set.
CREATE UNIQUE INDEX IF NOT EXISTS score_calendar_class_uniq
    ON public.score_calendar_periods (class_id, academic_year, month_key)
    WHERE scope = 'class';
CREATE UNIQUE INDEX IF NOT EXISTS score_calendar_school_uniq
    ON public.score_calendar_periods (school_id, academic_year, month_key)
    WHERE scope = 'school';

COMMENT ON TABLE public.score_calendar_periods IS
    'Teacher/school-defined score periods for one academic year. month_key is
     the anchor (the left half of scores.score_period — schema, never an
     invented key); member_months are the months the period covers. Zero rows
     for a target resolve DEFAULT_CALENDAR in code: absence means "not
     configured", never "no periods". A layer overrides as a whole set.';

ALTER TABLE public.score_calendar_periods ENABLE ROW LEVEL SECURITY;

-- RLS copies 00016's score_template_subjects shape verbatim, minus the system
-- branch: read = the school's members (school layer) or the class's assigned
-- teachers/admins (class layer); write = school admins for school rows, the
-- class's active teachers or admins for class rows. No new policy shape.

DROP POLICY IF EXISTS "score_calendar_select_visible" ON public.score_calendar_periods;
CREATE POLICY "score_calendar_select_visible" ON public.score_calendar_periods
    FOR SELECT USING (
        (scope = 'school' AND school_id IN (SELECT public.current_school_ids()))
        OR (scope = 'class' AND (
                EXISTS (SELECT 1 FROM public.teacher_assignments ta
                         WHERE ta.class_id = score_calendar_periods.class_id
                           AND ta.teacher_id = auth.uid()
                           AND ta.status = 'active')
             OR EXISTS (SELECT 1 FROM public.classes c
                          JOIN public.academic_years ay ON ay.id = c.academic_year_id
                         WHERE c.id = score_calendar_periods.class_id
                           AND public.is_school_admin(ay.school_id))
        ))
    );

-- Write, school layer: school admins only. Mirrors `score_templates_school_write`.
DROP POLICY IF EXISTS "score_calendar_school_write" ON public.score_calendar_periods;
CREATE POLICY "score_calendar_school_write" ON public.score_calendar_periods
    FOR ALL USING       (scope = 'school' AND public.is_school_admin(school_id))
            WITH CHECK  (scope = 'school' AND public.is_school_admin(school_id));

-- Write, class layer: the teachers who actually teach the class, plus admins.
-- Mirrors `score_templates_class_write`.
DROP POLICY IF EXISTS "score_calendar_class_write" ON public.score_calendar_periods;
CREATE POLICY "score_calendar_class_write" ON public.score_calendar_periods
    FOR ALL USING (
        scope = 'class' AND (
            EXISTS (SELECT 1 FROM public.teacher_assignments ta
                     WHERE ta.class_id = score_calendar_periods.class_id
                       AND ta.teacher_id = auth.uid()
                       AND ta.status = 'active')
         OR EXISTS (SELECT 1 FROM public.classes c
                      JOIN public.academic_years ay ON ay.id = c.academic_year_id
                     WHERE c.id = score_calendar_periods.class_id
                       AND public.is_school_admin(ay.school_id))
        )
    ) WITH CHECK (
        scope = 'class' AND (
            EXISTS (SELECT 1 FROM public.teacher_assignments ta
                     WHERE ta.class_id = score_calendar_periods.class_id
                       AND ta.teacher_id = auth.uid()
                       AND ta.status = 'active')
         OR EXISTS (SELECT 1 FROM public.classes c
                      JOIN public.academic_years ay ON ay.id = c.academic_year_id
                     WHERE c.id = score_calendar_periods.class_id
                       AND public.is_school_admin(ay.school_id))
        )
    );

-- Without these PostgREST answers 42501 whatever the policies say — the trap
-- 00005 exists to close. 00005's ALTER DEFAULT PRIVILEGES should already cover
-- a table created later, but stating it is cheaper than debugging it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.score_calendar_periods TO authenticated;
GRANT ALL ON public.score_calendar_periods TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Four policies, RLS on:
-- SELECT policyname FROM pg_policies
--  WHERE schemaname='public' AND tablename='score_calendar_periods';
--
-- -- The anchor rule is unrepresentable:
-- --   INSERT .. (scope,'class',<class>,'2025-2026','mar_apr','{mar,apr}','sem1')
-- --   ERROR: violates check constraint "member_months_valid"
-- --   INSERT .. month_key='mar', member_months='{apr}'
-- --   ERROR: violates check constraint "anchor_is_member"
--
-- -- One anchor per class-year:
-- --   inserting ('class', <class>, '2025-2026', 'mar', ...) twice
-- --   ERROR: duplicate key value violates "score_calendar_class_uniq"
--
-- -- INV-2: an account with zero rows — every screen identical to before this
-- -- migration, because resolveCalendar([]) is DEFAULT_CALENDAR in code.
-- =============================================================================
-- ROLLBACK (manual, if ever needed):
-- DROP TABLE IF EXISTS public.score_calendar_periods CASCADE;
-- =============================================================================
