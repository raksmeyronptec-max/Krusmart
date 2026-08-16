-- =============================================================================
-- 00016_score_templates.sql
-- =============================================================================
-- Make the score subject list data, not code.
--
-- WHY
-- `app/(main)/score/enter/ScoreEnterClient.tsx` builds its subject picker from a
-- literal array, and `subjectConfigs.ts` holds the column layout for each key.
-- Both are the Cambodian *primary* curriculum, hard-coded. A lower-secondary
-- school signing up today gets a picker full of `ស្តាប់ / និយាយ / អាន / សរសេរ` —
-- primary-school Khmer skills — and no way to change it without a code deploy.
--
-- This table is where that list moves. It is layered, so a school can adjust
-- the national default and a class can adjust its school, without either of
-- them forking the whole curriculum:
--
--     scope='system'  national default, seeded here, read-only to everyone
--     scope='school'  a school's amendments      (school admins write)
--     scope='class'   one class's amendments     (assigned teachers write)
--
-- Resolution — lowest layer present wins per `subject_key` — lives in
-- `lib/scores/template.ts` rather than in SQL, because the same merge has to run
-- in the browser against a cached row set and on the server during render.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does not touch `public.scores`. `scores.subject` stays a TEXT key and
--     `scores_owner_period_uniq` is untouched. This changes which columns the UI
--     *offers*, never how a mark is stored, so no data migration is needed and
--     every mark already entered keeps resolving.
--   * There is no `coefficient` column. The design derives it (max_score / 50)
--     and it lands in a later phase; storing it now would let the stored value
--     and the derived one drift, and a wrong coefficient silently corrupts every
--     average, ranking and certificate in the product.
--   * Only the primary curriculum is seeded. Lower- and upper-secondary subject
--     lists and their full marks are not known here and must not be invented.
--
-- The seed reproduces the current picker exactly — same keys, same Khmer
-- labels, same groups, same order — so a teacher signed in today sees an
-- identical list tomorrow. That is the whole acceptance test for this phase.
--
-- REQUIRES: 00003 (schools, education_levels, grades, classes,
--           teacher_assignments, current_school_ids(), is_school_admin()),
--           00005 (PostgREST grants).
-- REQUIRES: PostgreSQL 15+ for `NULLS NOT DISTINCT` — see the index below.
--
-- SAFETY: additive only. No DROP, no destructive ALTER. Idempotent throughout.
-- ROLLBACK: see the foot of this file.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.score_template_subjects (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Which layer this row belongs to. The CHECK below ties it to the scoping
    -- columns so a school row cannot masquerade as a system one — which would
    -- publish one school's curriculum to every account, since the SELECT policy
    -- lets any authenticated user read `system`.
    scope      TEXT NOT NULL CHECK (scope IN ('system','school','class')),

    -- Optional narrowing, independent of `scope`: a system row may apply to one
    -- education level or one grade, or (NULL, NULL) to everything. These are
    -- per-school UUIDs, so the seeded national default leaves them NULL.
    education_level_id UUID REFERENCES public.education_levels(id) ON DELETE CASCADE,
    grade_id           UUID REFERENCES public.grades(id)           ON DELETE CASCADE,
    school_id          UUID REFERENCES public.schools(id)          ON DELETE CASCADE,
    class_id           UUID REFERENCES public.classes(id)          ON DELETE CASCADE,

    -- The value written to `scores.subject`, or — when `columns` has more than
    -- one entry — the key of the group whose column ids are written there.
    -- Persisted in every mark ever recorded: treat as schema, never rename.
    subject_key TEXT NOT NULL,

    label_km    TEXT NOT NULL,
    -- Optional heading in the picker (`ភាសាខ្មែរ`, `ការបំពេញបន្ថែម`, …).
    group_label TEXT,

    -- `[{ id, label, width?, type?, options? }]`, the shape `subjectConfigs`
    -- already uses. The ids inside are `scores.subject` values, so this JSON is
    -- as load-bearing as `subject_key` itself.
    columns     JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Full mark. 10 across the primary curriculum; secondary subjects differ,
    -- which is the reason this is a column and not a constant.
    max_score   NUMERIC NOT NULL DEFAULT 10 CHECK (max_score > 0),

    -- Whether the cells hold marks or Khmer words. The behavioural columns
    -- (`sem_eval_*`) are rated from a dropdown and land in `scores.score_text`,
    -- not `scores.score_value` — see `lib/utils/score-value.ts` and 00012.
    value_kind  TEXT NOT NULL DEFAULT 'numeric' CHECK (value_kind IN ('numeric','text')),

    -- Which of the `scores.score_type` values this subject appears under.
    -- `cardinality`, not `array_length`: array_length('{}', 1) is NULL, a CHECK
    -- only rejects FALSE, and an empty array satisfies `<@` — so the obvious
    -- spelling would let a subject exist that appears under no score type at
    -- all, i.e. is invisible everywhere.
    score_types TEXT[] NOT NULL DEFAULT ARRAY['monthly']::TEXT[]
                CHECK (score_types <@ ARRAY['monthly','semester','annual','homework']::TEXT[]
                       AND cardinality(score_types) >= 1),

    sort_order  INTEGER NOT NULL DEFAULT 0,

    -- Set on a lower layer to suppress a subject inherited from a higher one.
    -- A row is the unit of override, so hiding is a flag rather than a delete:
    -- deleting the inherited row is not possible from a school or a class.
    hidden      BOOLEAN NOT NULL DEFAULT false,

    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT score_template_subjects_scope_ck CHECK (
        (scope = 'system' AND school_id IS NULL     AND class_id IS NULL)
     OR (scope = 'school' AND school_id IS NOT NULL AND class_id IS NULL)
     OR (scope = 'class'  AND class_id  IS NOT NULL)
    )
);

-- One row per subject per scope target.
--
-- `NULLS NOT DISTINCT` is load-bearing, not decoration. Under default SQL
-- semantics NULL <> NULL, so the seeded system rows — where four of the five
-- scoping columns are NULL — would never conflict with each other and re-running
-- this migration would insert a second complete copy of the curriculum. It is
-- also what makes the `ON CONFLICT` target below infer at all.
--
-- A unique *index* rather than a table constraint, matching the
-- `teacher_assignments_*_uniq` indexes in 00003: `IF NOT EXISTS` makes it
-- idempotent without a DO block.
CREATE UNIQUE INDEX IF NOT EXISTS score_template_subjects_target_uniq
    ON public.score_template_subjects
       (scope, education_level_id, grade_id, school_id, class_id, subject_key)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_score_template_subjects_scope  ON public.score_template_subjects(scope);
CREATE INDEX IF NOT EXISTS idx_score_template_subjects_school ON public.score_template_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_score_template_subjects_class  ON public.score_template_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_score_template_subjects_grade  ON public.score_template_subjects(grade_id);

COMMENT ON TABLE public.score_template_subjects IS
    'Layered subject list for the score screens: system (national default) <
     school < class. Resolved in lib/scores/template.ts, lowest layer wins per
     subject_key. Does not affect how marks are stored — scores.subject is
     still a free TEXT key.';

ALTER TABLE public.score_template_subjects ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS
-- =============================================================================
-- Read: everyone authenticated sees the national default; school members see
-- their school's amendments; a class's amendments are visible to the teachers
-- assigned to it and to that school's admins.
--
-- No `TO authenticated` clause, matching the ~50 policies already in this
-- schema. `anon` holds no table privileges at all (00005 revokes them and the
-- default privileges grant only to `authenticated`), so the `scope = 'system'`
-- branch is not a public read.

DROP POLICY IF EXISTS "score_templates_select_visible" ON public.score_template_subjects;
CREATE POLICY "score_templates_select_visible" ON public.score_template_subjects
    FOR SELECT USING (
        scope = 'system'
        OR (scope = 'school' AND school_id IN (SELECT public.current_school_ids()))
        OR (scope = 'class' AND (
                EXISTS (SELECT 1 FROM public.teacher_assignments ta
                         WHERE ta.class_id = score_template_subjects.class_id
                           AND ta.teacher_id = auth.uid()
                           AND ta.status = 'active')
             OR EXISTS (SELECT 1 FROM public.classes c
                          JOIN public.academic_years ay ON ay.id = c.academic_year_id
                         WHERE c.id = score_template_subjects.class_id
                           AND public.is_school_admin(ay.school_id))
        ))
    );

-- Write, school layer: school admins only. Mirrors `education_levels_admin_write`.
DROP POLICY IF EXISTS "score_templates_school_write" ON public.score_template_subjects;
CREATE POLICY "score_templates_school_write" ON public.score_template_subjects
    FOR ALL USING       (scope = 'school' AND public.is_school_admin(school_id))
            WITH CHECK  (scope = 'school' AND public.is_school_admin(school_id));

-- Write, class layer: the teachers who actually teach the class, plus admins.
-- Mirrors `class_subjects_select_visible` / `class_subjects_admin_write`.
DROP POLICY IF EXISTS "score_templates_class_write" ON public.score_template_subjects;
CREATE POLICY "score_templates_class_write" ON public.score_template_subjects
    FOR ALL USING (
        scope = 'class' AND (
            EXISTS (SELECT 1 FROM public.teacher_assignments ta
                     WHERE ta.class_id = score_template_subjects.class_id
                       AND ta.teacher_id = auth.uid()
                       AND ta.status = 'active')
         OR EXISTS (SELECT 1 FROM public.classes c
                      JOIN public.academic_years ay ON ay.id = c.academic_year_id
                     WHERE c.id = score_template_subjects.class_id
                       AND public.is_school_admin(ay.school_id))
        )
    ) WITH CHECK (
        scope = 'class' AND (
            EXISTS (SELECT 1 FROM public.teacher_assignments ta
                     WHERE ta.class_id = score_template_subjects.class_id
                       AND ta.teacher_id = auth.uid()
                       AND ta.status = 'active')
         OR EXISTS (SELECT 1 FROM public.classes c
                      JOIN public.academic_years ay ON ay.id = c.academic_year_id
                     WHERE c.id = score_template_subjects.class_id
                       AND public.is_school_admin(ay.school_id))
        )
    );

-- `scope = 'system'` has no write policy on purpose: the national default is
-- changed by a migration, not by a user.

-- Without these, PostgREST answers 42501 whatever the policies say — the trap
-- 00005 exists to close. 00005's ALTER DEFAULT PRIVILEGES should already cover
-- a table created later, but stating it is cheaper than debugging it.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.score_template_subjects TO authenticated;
GRANT ALL ON public.score_template_subjects TO service_role;

-- =============================================================================
-- SEED — the Cambodian primary curriculum, as the picker renders it today
-- =============================================================================
-- Transcribed verbatim from `subjectOptions` in ScoreEnterClient.tsx (labels,
-- groups, order) and `subjectConfigs.ts` (columns). Fourteen rows, because the
-- picker offers fourteen of the ~51 keys `subjectConfigs` defines; the rest are
-- reachable only through a group key and are intentionally not listed here.
--
-- `sort_order` runs 10, 20, … within each score type, leaving room to insert.
-- The two sequences are independent: resolution filters by score type before
-- sorting, so they never interleave.
--
-- `value_kind = 'text'` covers `sem_behavior_all` as well as
-- `sem_eval_knowledge`: every column of that group is one of the four
-- `sem_eval_*` dropdowns, whose values are Khmer words stored in
-- `scores.score_text`.
--
-- ON CONFLICT DO NOTHING rather than DO UPDATE: re-running this file must not
-- silently revert an edit a school made on top of the default.
INSERT INTO public.score_template_subjects
    (scope, subject_key, label_km, group_label, columns, max_score, value_kind, score_types, sort_order)
VALUES
    -- ---------------------------------------------------------------- monthly
    ('system', 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},
        {"id":"kh_speak","label":"និយាយ","width":"80px"},
        {"id":"kh_read","label":"អាន","width":"80px"},
        {"id":"kh_write","label":"សរសេរ","width":"80px"},
        {"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},
        {"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},
        {"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),

    ('system', 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),

    ('system', 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),

    ('system', 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),

    ('system', 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),

    ('system', 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},
        {"id":"math_meas","label":"រង្វាស់","width":"70px"},
        {"id":"math_geo","label":"ធរណី","width":"70px"},
        {"id":"math_alg","label":"ពីជគណិត","width":"70px"},
        {"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),

    ('system', 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),

    ('system', 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),

    ('system', 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),

    ('system', 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),

    -- --------------------------------------------------------------- semester
    ('system', 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),

    ('system', 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),

    ('system', 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},
        {"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},
        {"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},
        {"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 30),

    ('system', 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 40)

ON CONFLICT (scope, education_level_id, grade_id, school_id, class_id, subject_key)
DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Fourteen system rows, ten monthly and four semester:
-- SELECT unnest(score_types) AS score_type, count(*)
--   FROM public.score_template_subjects WHERE scope = 'system'
--  GROUP BY 1;                                  -- expect monthly=10, semester=4
--
-- -- The picker, in order — must match subjectOptions in ScoreEnterClient.tsx:
-- SELECT subject_key, label_km, group_label
--   FROM public.score_template_subjects
--  WHERE scope = 'system' AND 'monthly' = ANY(score_types)
--  ORDER BY sort_order;
--
-- -- Re-running this file must not duplicate. Run it twice, then:
-- SELECT count(*) FROM public.score_template_subjects WHERE scope = 'system';
--                                                       -- expect 14, not 28
--
-- -- Policies (expect 3: class_write, school_write, select_visible):
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'score_template_subjects'
--  ORDER BY policyname;
--
-- -- A school row pretending to be a system row must be rejected:
-- --   INSERT ... (scope, school_id, subject_key, label_km)
-- --   VALUES ('system', '<uuid>', 'x', 'x');
-- --   ERROR: violates check constraint "score_template_subjects_scope_ck"
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.score_template_subjects CASCADE;
-- COMMIT;
-- =============================================================================
