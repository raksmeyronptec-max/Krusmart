-- =============================================================================
-- 00015_cognitive_assessments.sql
-- =============================================================================
-- Storage for the per-pupil cognitive assessment on `/score-analyse`.
--
-- WHAT THIS RESTORES
-- The legacy build let a teacher rate each pupil on four cognitive levels with
-- 0-100 sliders, and fed the result into that pupil's holistic profile and
-- printed detail sheet. It was implemented (`analysis/app-by-student.js:763`,
-- `window.saveCognitiveData`) and persisted to Firestore at
-- `users/{uid}/data/cognitive_{classId}` as a map of student id → four numbers.
--
-- Nothing in the Supabase build carried it over: no table, no type, no UI.
--
-- WHY A TABLE RATHER THAN `scores`
-- `scores` is keyed on `(teacher_id, student_id, subject, score_type,
-- score_period)` and already carries four different things behind that key
-- (monthly / semester / annual / homework — see CLAUDE.md). A cognitive rating
-- is not a mark in a subject for a period: it is one standing judgement per
-- pupil, on a 0-100 scale rather than the 0-10 one every reader of `scores`
-- assumes. Encoding it as four fake subjects would put values on a different
-- scale into a column that `gradeFor()` and every average in the app treat as a
-- mark out of ten.
-- =============================================================================

BEGIN;

-- The four levels are stored as separate SMALLINT columns rather than JSONB:
-- there are exactly four, they are fixed, and they are averaged and charted —
-- all of which is cheaper and better-typed as columns.
--
-- 0-100 to match the legacy slider range. CHECK rather than a domain so the
-- bound is visible in \d output.
CREATE TABLE IF NOT EXISTS public.cognitive_assessments (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id         UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,

    /** ដឹងយល់ — knowledge and comprehension. */
    knowing     SMALLINT NOT NULL DEFAULT 0 CHECK (knowing    BETWEEN 0 AND 100),
    /** អនុវត្ត — application. */
    applying    SMALLINT NOT NULL DEFAULT 0 CHECK (applying   BETWEEN 0 AND 100),
    /** វិភាគ — analysis. */
    analyzing   SMALLINT NOT NULL DEFAULT 0 CHECK (analyzing  BETWEEN 0 AND 100),
    /** វាយតម្លៃ — evaluation. */
    evaluating  SMALLINT NOT NULL DEFAULT 0 CHECK (evaluating BETWEEN 0 AND 100),

    note        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- `teacher_id` is part of the key for the same reason it is part of
    -- `scores_owner_period_uniq`: two teachers assigned to one class must be
    -- able to record their own judgement of a pupil without silently
    -- overwriting each other's. It is also the conflict target the upsert uses.
    UNIQUE (teacher_id, student_id)
);

ALTER TABLE public.cognitive_assessments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cognitive_assessments_teacher ON public.cognitive_assessments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_assessments_student ON public.cognitive_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_assessments_class   ON public.cognitive_assessments(class_id);

-- Four policies of the form `auth.uid() = teacher_id`, matching every other
-- teacher-owned table in this schema.
DROP POLICY IF EXISTS "cognitive_select_own" ON public.cognitive_assessments;
CREATE POLICY "cognitive_select_own" ON public.cognitive_assessments
    FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "cognitive_insert_own" ON public.cognitive_assessments;
CREATE POLICY "cognitive_insert_own" ON public.cognitive_assessments
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "cognitive_update_own" ON public.cognitive_assessments;
CREATE POLICY "cognitive_update_own" ON public.cognitive_assessments
    FOR UPDATE USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "cognitive_delete_own" ON public.cognitive_assessments;
CREATE POLICY "cognitive_delete_own" ON public.cognitive_assessments
    FOR DELETE USING (auth.uid() = teacher_id);

-- Without these, PostgREST returns 42501 regardless of the policies above —
-- the same trap 00005 was written to fix for the V2 tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cognitive_assessments TO authenticated;
GRANT ALL ON public.cognitive_assessments TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='cognitive_assessments' ORDER BY policyname;
-- -- expect 4 rows: delete_own, insert_own, select_own, update_own
--
-- -- Out-of-range values must be rejected:
-- --   INSERT ... (knowing) VALUES (101);
-- --   ERROR: new row violates check constraint "cognitive_assessments_knowing_check"
--
-- -- anon reads nothing:
-- --   GET /rest/v1/cognitive_assessments  (apikey only) -> []
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.cognitive_assessments CASCADE;
-- COMMIT;
-- =============================================================================
