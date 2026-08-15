-- =============================================================================
-- 00012_legacy_features.sql
-- =============================================================================
-- Phase 11.5 — storage for the features carried over from the legacy build.
--
-- Four independent changes, all additive:
--
--   1. `scores.score_text`  — fixes silent data loss on behavioural ratings.
--   2. `custom_subjects`    — moves teacher-defined subjects off localStorage.
--   3. `inventory_items`    — moves the classroom inventory off localStorage.
--   4. `class_admin_entries`— backs the 13-book class administration suite.
--
-- Nothing is dropped and no column changes type, so a rollback is a DROP of the
-- new objects (see the foot of this file). Existing rows are untouched.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. scores.score_text — behavioural ratings
-- -----------------------------------------------------------------------------
-- THE DEFECT
-- The semester grid has four behavioural columns — sem_eval_knowledge,
-- sem_eval_skill, sem_eval_moral, sem_eval_participate — whose values are Khmer
-- words picked from a dropdown: ល្អ / ល្អបង្គួរ / មធ្យម / ខ្សោយ.
--
-- `scores.score_value` is NUMERIC, and `saveScores` coerces every cell with
-- `parseFloat`. `parseFloat('ល្អ')` is NaN, and `JSON.stringify` renders NaN as
-- `null`, so the request that reaches PostgREST is:
--
--     {"subject":"sem_eval_moral", ..., "score_value": null}   -> 201 Created
--
-- The teacher sees a success toast, the row is written, and the rating is gone.
-- Verified against the live database: HTTP 201, stored value NULL. Writing the
-- word directly is not an option either — NUMERIC rejects it with 22P02.
--
-- THE FIX
-- A sibling TEXT column. Numeric marks keep using `score_value` exactly as
-- before; text ratings land in `score_text`. Readers coalesce the two.
-- Additive, so every existing row and every numeric write is unaffected.
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS score_text TEXT;

COMMENT ON COLUMN public.scores.score_text IS
    'Non-numeric mark, e.g. the behavioural ratings ល្អ/ល្អបង្គួរ/មធ្យម/ខ្សោយ on
     the sem_eval_* columns. Mutually exclusive with score_value: a row carries
     one or the other, never both. See migration 00012.';

-- A row is one kind of mark or the other. Written as NOT (both non-null) so the
-- constraint accepts the all-NULL row an upsert produces when a cell is cleared.
ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_one_value_kind;
ALTER TABLE public.scores ADD CONSTRAINT scores_one_value_kind
    CHECK (score_value IS NULL OR score_text IS NULL);

-- -----------------------------------------------------------------------------
-- 2. custom_subjects
-- -----------------------------------------------------------------------------
-- Teacher-defined subject groups, previously localStorage key `custom_subjects`
-- (lib/storage/custom-subjects.ts). Being client-only meant they vanished on a
-- new device and could not be read by the parent portal, which is why the
-- portal currently renders raw column keys for them.
--
-- `columns` keeps the legacy JSON shape — [{ id, label, width?, mode? }] — so a
-- browser's existing value can be imported verbatim.
CREATE TABLE IF NOT EXISTS public.custom_subjects (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id     UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    /** monthly | semester | both — which score grid the subject appears in. */
    scope        TEXT NOT NULL DEFAULT 'both'
                 CHECK (scope IN ('monthly', 'semester', 'both')),
    columns      JSONB NOT NULL DEFAULT '[]'::jsonb,
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.custom_subjects ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_subjects_teacher ON public.custom_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_custom_subjects_class   ON public.custom_subjects(class_id);

-- `class_id` is nullable, and NULL <> NULL, so a plain UNIQUE would let the
-- same class-less subject be inserted twice. Two partial indexes instead — the
-- same pattern migration 00004 needed for teacher_assignments.
CREATE UNIQUE INDEX IF NOT EXISTS custom_subjects_teacher_class_name_uniq
    ON public.custom_subjects(teacher_id, class_id, name) WHERE class_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS custom_subjects_teacher_name_uniq
    ON public.custom_subjects(teacher_id, name) WHERE class_id IS NULL;

-- -----------------------------------------------------------------------------
-- 3. inventory_items
-- -----------------------------------------------------------------------------
-- Classroom inventory, previously localStorage key `inventoryItems`.
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id     UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    qty          NUMERIC NOT NULL DEFAULT 0,
    unit         TEXT,
    note         TEXT,
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inventory_items_teacher ON public.inventory_items(teacher_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_class   ON public.inventory_items(class_id);

-- -----------------------------------------------------------------------------
-- 4. class_admin_entries — the 13-book suite
-- -----------------------------------------------------------------------------
-- The legacy suite is 13 heterogeneous MoEYS forms, each of which was its own
-- Firestore collection or single document (daily_quotes, recommendations,
-- demo_classes, material_production, meeting_agendas, class_committee,
-- teacher_plans, composition_correction, ...).
--
-- Thirteen tables would be thirteen sets of near-identical policies for forms
-- that are, structurally, "a dated list of rows belonging to one teacher". One
-- table with a `book` discriminator and a JSONB payload covers both shapes the
-- legacy code used:
--
--   * row-list books  — one entry row per record, `seq` orders them;
--   * document books  — a single entry row, `seq = 0`, everything in `data`.
--
-- `data` is JSONB rather than columns because the 13 forms share no fields: the
-- committee book stores names and villages, the plan book stores four weeks of
-- activities, the quotes book stores a time and a passage. Typed accessors live
-- in lib/class-admin/books.ts so callers are not hand-indexing JSON.
CREATE TABLE IF NOT EXISTS public.class_admin_entries (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id         UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
    /** Which of the 13 books this row belongs to. Values in BOOK_IDS. */
    book             TEXT NOT NULL,
    /** Optional date shown in the form's own date column. */
    entry_date       DATE,
    /** Display order within a book; 0 for single-document books. */
    seq              INTEGER NOT NULL DEFAULT 0,
    data             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.class_admin_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_class_admin_teacher_book
    ON public.class_admin_entries(teacher_id, book);
CREATE INDEX IF NOT EXISTS idx_class_admin_class
    ON public.class_admin_entries(class_id);
CREATE INDEX IF NOT EXISTS idx_class_admin_book_seq
    ON public.class_admin_entries(book, seq);

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
-- All three new tables are teacher-private working documents: a lesson-plan
-- book or an inventory list is not a student record, so there is no parent
-- branch and no cross-teacher read. School admins can read (not write) the
-- class-admin books, which is what the paper originals are inspected for.
--
-- Written as four explicit policies per table rather than FOR ALL, matching the
-- convention established in 00003.

-- custom_subjects
DROP POLICY IF EXISTS "custom_subjects_select_own" ON public.custom_subjects;
CREATE POLICY "custom_subjects_select_own" ON public.custom_subjects
    FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "custom_subjects_insert_own" ON public.custom_subjects;
CREATE POLICY "custom_subjects_insert_own" ON public.custom_subjects
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "custom_subjects_update_own" ON public.custom_subjects;
CREATE POLICY "custom_subjects_update_own" ON public.custom_subjects
    FOR UPDATE USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "custom_subjects_delete_own" ON public.custom_subjects;
CREATE POLICY "custom_subjects_delete_own" ON public.custom_subjects
    FOR DELETE USING (auth.uid() = teacher_id);

-- inventory_items
DROP POLICY IF EXISTS "inventory_items_select_own" ON public.inventory_items;
CREATE POLICY "inventory_items_select_own" ON public.inventory_items
    FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "inventory_items_insert_own" ON public.inventory_items;
CREATE POLICY "inventory_items_insert_own" ON public.inventory_items
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "inventory_items_update_own" ON public.inventory_items;
CREATE POLICY "inventory_items_update_own" ON public.inventory_items
    FOR UPDATE USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "inventory_items_delete_own" ON public.inventory_items;
CREATE POLICY "inventory_items_delete_own" ON public.inventory_items
    FOR DELETE USING (auth.uid() = teacher_id);

-- class_admin_entries
DROP POLICY IF EXISTS "class_admin_select_own_or_admin" ON public.class_admin_entries;
CREATE POLICY "class_admin_select_own_or_admin" ON public.class_admin_entries
    FOR SELECT USING (
        auth.uid() = teacher_id
        -- `classes` carries no school_id of its own; the school hangs off the
        -- academic year, so the admin check joins through it.
        OR (class_id IS NOT NULL AND EXISTS (
                SELECT 1
                  FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = class_admin_entries.class_id
                   AND public.is_school_admin(ay.school_id)))
    );

DROP POLICY IF EXISTS "class_admin_insert_own" ON public.class_admin_entries;
CREATE POLICY "class_admin_insert_own" ON public.class_admin_entries
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "class_admin_update_own" ON public.class_admin_entries;
CREATE POLICY "class_admin_update_own" ON public.class_admin_entries
    FOR UPDATE USING (auth.uid() = teacher_id) WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "class_admin_delete_own" ON public.class_admin_entries;
CREATE POLICY "class_admin_delete_own" ON public.class_admin_entries
    FOR DELETE USING (auth.uid() = teacher_id);

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
-- 00005 granted on ALL TABLES as they stood then; these three are newer and
-- need their own grant or every request 403s before RLS is even consulted.
-- `anon` deliberately gets nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_subjects      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_admin_entries  TO authenticated;

GRANT ALL ON public.custom_subjects     TO service_role;
GRANT ALL ON public.inventory_items     TO service_role;
GRANT ALL ON public.class_admin_entries TO service_role;

COMMIT;

-- PostgREST caches the schema; a brand-new table 404s as PGRST205 until it is
-- told to reload.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Behavioural rating now survives a round trip (as the student's teacher):
-- --   POST /rest/v1/scores {"subject":"sem_eval_moral","score_text":"ល្អ", ...}
-- --   GET  ...  -> score_text = 'ល្អ', score_value = NULL
--
-- -- The check constraint rejects a row claiming to be both:
-- --   INSERT ... (score_value, score_text) VALUES (7, 'ល្អ');   -- 23514
--
-- -- RLS is on and every new table has four policies:
-- SELECT tablename, count(*) FROM pg_policies
--  WHERE schemaname='public'
--    AND tablename IN ('custom_subjects','inventory_items','class_admin_entries')
--  GROUP BY tablename;
--
-- -- anon can read nothing:
-- --   GET /rest/v1/inventory_items  (apikey only) -> []
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP TABLE IF EXISTS public.class_admin_entries CASCADE;
-- DROP TABLE IF EXISTS public.inventory_items     CASCADE;
-- DROP TABLE IF EXISTS public.custom_subjects     CASCADE;
-- ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_one_value_kind;
-- -- Only safe while no behavioural rating has been written:
-- --   SELECT count(*) FROM public.scores WHERE score_text IS NOT NULL;  -- must be 0
-- ALTER TABLE public.scores DROP COLUMN IF EXISTS score_text;
-- COMMIT;
-- =============================================================================
