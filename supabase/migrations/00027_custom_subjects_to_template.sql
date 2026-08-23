-- =============================================================================
-- 00027_custom_subjects_to_template.sql
-- =============================================================================
-- Retires `custom_subjects` (00012) by converting every row into a
-- `score_template_subjects` row at `scope='class'`. Closes the last item in
-- docs/score-system-design.md §8 (stage 5) and the §3.4 note that has said
-- since the start that these two stores must not both run.
--
-- WHY NOW
-- `custom_subjects` is keyed on `teacher_id`. Since 4B put several teachers on
-- one class that is an active defect, not just duplication: two colleagues
-- teaching the same class see DIFFERENT subject lists, and a mark one of them
-- enters under a subject the other cannot see renders as a bare column key on
-- the colleague's grid. Class-scope template rows are read by everyone on the
-- class, which is the whole point of moving them.
--
-- THE ONE SAFETY PROPERTY: COLUMN IDS ARE COPIED VERBATIM
-- `custom_subjects.columns` is JSONB of `SubjectColumn`, and `SubjectColumn.id`
-- — not the subject key — is what `scores.subject` stores. This migration
-- copies `columns` across as a whole JSONB value and never rewrites an id, so
-- every mark already entered resolves against the new row exactly as it did
-- against the old one. `scores` is not touched, and neither is
-- `scores_owner_period_uniq`.
--
-- EVERY ROW HAS class_id IS NULL — AND THAT IS NOT AN EDGE CASE
-- Neither writer ever set it: `createCustomSubject` inserts
-- (teacher_id, name, scope, columns) and `importCustomSubjects` adds only
-- order_index. Those two plus two reads were the only code touching the table,
-- and no migration ever inserted a row. So the column has never held a value
-- in any database, and `class_id IS NULL` means "this teacher's subject, on
-- whichever class they are looking at" — `listCustomSubjects` filtered on
-- teacher_id alone, so the subject appeared on EVERY class they opened.
--
-- The conversion preserves exactly that: one custom subject becomes one
-- class-scope row PER ACTIVE CLASS the teacher holds. Fanning out is safe
-- because `scores` is keyed on (teacher_id, student_id, subject, ...) and
-- never on class — duplicating the *definition* across classes cannot orphan
-- a mark, and narrowing to a single class would instead HIDE the subject on
-- classes where it is showing today.
--
-- TEACHERS WITH NO ACTIVE CLASS CANNOT BE MIGRATED
-- `score_template_subjects_scope_ck` requires class_id NOT NULL when
-- scope='class', so a legacy account (no teacher_assignments row) has nowhere
-- for the row to go; `/score/subjects` refuses those accounts for the same
-- reason. Their rows are LEFT IN PLACE by this migration and reported by the
-- verification query below.
--
--   *** PRODUCT DECISION, RECORDED DELIBERATELY ***
--   The application code that read `custom_subjects` is removed in the same
--   change as this migration. For a legacy teacher that means their custom
--   subjects stop appearing in the picker, while the marks entered under them
--   stay in `scores` and render as bare column keys. This was chosen with the
--   trade-off stated; it is not an oversight. Run the verification query
--   BEFORE deploying — if it returns rows, those are the accounts affected.
--
-- SUBJECT KEY
-- Minted as `cs_<the custom_subjects UUID, hyphens stripped>`. Three
-- properties matter: it is DETERMINISTIC (so re-running produces the same key
-- and the ON CONFLICT below is a true no-op), it is UNIQUE by construction (it
-- is a primary key), and the `cs_` prefix is disjoint from every other key
-- space in the system — `hs_`/`kh_`/`math_`/`sem_` (national, 00016/00021/
-- 00026), `cls_` (minted by /score/subjects `addClassSubject`) and `custom_`
-- (the column ids themselves). That disjointness is what makes the rollback
-- below able to identify its own rows without a marker column.
--
-- Note this deliberately does NOT reuse the column id as the subject key for
-- single-column subjects, which is the convention 00016 follows. Nothing reads
-- that equality — `columnsFor()` maps subject -> columns off the row itself —
-- and a deterministic key derived from the primary key is worth more here than
-- cosmetic consistency.
--
-- SCOPE -> score_types
--   'monthly'  -> ARRAY['monthly']
--   'semester' -> ARRAY['semester']
--   'both'     -> ARRAY['monthly','semester']   (two array entries, one row)
--
-- max_score is 10, matching DEFAULT_SCHEME_CONFIG.maxScore in
-- lib/grading/scheme.ts — the value the grid already applied to custom
-- subjects, since they never carried a maximum of their own.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Safety assertion — the property the whole migration rests on
-- -----------------------------------------------------------------------------
-- If a custom subject's columns JSONB is not an array of objects carrying an
-- `id`, copying it verbatim would produce a template row whose columns cannot
-- be resolved. Fail loudly rather than write it.
DO $$
DECLARE
    bad_rows INTEGER;
BEGIN
    SELECT count(*) INTO bad_rows
      FROM public.custom_subjects cs
     WHERE jsonb_typeof(cs.columns) <> 'array'
        OR EXISTS (
             SELECT 1 FROM jsonb_array_elements(cs.columns) e
              WHERE jsonb_typeof(e) <> 'object'
                 OR nullif(e->>'id', '') IS NULL);

    IF bad_rows > 0 THEN
        RAISE EXCEPTION
            'custom_subjects has % row(s) whose columns are not [{id,label,...}]; '
            'migrating them would detach marks. Inspect before re-running.', bad_rows;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. The conversion
-- -----------------------------------------------------------------------------
-- One source row becomes one row per class the teacher actively holds. A row
-- that somehow DOES carry a class_id (no writer ever produced one, but the
-- column exists) migrates to that class alone.
INSERT INTO public.score_template_subjects (
    scope, class_id, subject_key, label_km, group_label,
    columns, max_score, value_kind, score_types, sort_order, hidden
)
SELECT
    'class',
    target.class_id,
    'cs_' || replace(cs.id::text, '-', ''),
    cs.name,
    -- The picker heading these subjects have always appeared under. Keeping it
    -- verbatim is what makes the grouping survive the move.
    'មុខវិជ្ជាបន្ថែម',
    cs.columns,                       -- VERBATIM. Every SubjectColumn.id intact.
    10,
    'numeric',
    CASE cs.scope
        WHEN 'monthly'  THEN ARRAY['monthly']
        WHEN 'semester' THEN ARRAY['semester']
        ELSE                 ARRAY['monthly', 'semester']
    END,
    -- Far enough down that every seeded subject sorts first, while the
    -- teacher's own relative order is preserved.
    1000 + (cs.order_index * 10),
    false
  FROM public.custom_subjects cs
  CROSS JOIN LATERAL (
      SELECT DISTINCT ta.class_id
        FROM public.teacher_assignments ta
       WHERE ta.teacher_id = cs.teacher_id
         AND ta.status = 'active'
         AND (cs.class_id IS NULL OR ta.class_id = cs.class_id)
  ) AS target
 ON CONFLICT (scope, education_level_id, grade_id, school_id, class_id,
              level_key, grade_number, track, subject_key)
 DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- 1. What moved. One row per (custom subject x active class):
-- SELECT count(*) AS migrated_rows,
--        count(DISTINCT subject_key) AS distinct_subjects
--   FROM public.score_template_subjects
--  WHERE scope = 'class' AND subject_key LIKE 'cs\_%';
--
-- -- 2. *** RUN THIS BEFORE DEPLOYING ***  Rows that CANNOT be migrated,
-- --    because the teacher holds no active class. These accounts lose the
-- --    subject from their picker once the old code path is removed:
-- SELECT cs.teacher_id, cs.id, cs.name
--   FROM public.custom_subjects cs
--  WHERE NOT EXISTS (SELECT 1 FROM public.teacher_assignments ta
--                     WHERE ta.teacher_id = cs.teacher_id AND ta.status = 'active');
--
-- -- 3. Column ids survived verbatim — expect ZERO rows:
-- SELECT cs.id, cs.name
--   FROM public.custom_subjects cs
--   JOIN public.score_template_subjects sts
--     ON sts.subject_key = 'cs_' || replace(cs.id::text, '-', '')
--  WHERE sts.columns IS DISTINCT FROM cs.columns;
--
-- -- 4. No mark was orphaned — every scores.subject that resolved before still
-- --    resolves. Expect ZERO rows:
-- SELECT DISTINCT s.subject
--   FROM public.scores s
--  WHERE s.subject LIKE 'custom\_%'
--    AND NOT EXISTS (
--        SELECT 1 FROM public.score_template_subjects sts,
--                      jsonb_array_elements(sts.columns) c
--         WHERE c->>'id' = s.subject);
--
-- -- 5. Idempotency — re-running section 2 adds nothing (count from 1 is stable).
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Self-identifying: the `cs_` prefix is minted only here. `/score/subjects`
-- mints `cls_`, and the national seeds use hs_/kh_/math_/sem_/soc_/sci_ — so
-- this DELETE cannot reach a row a teacher or a seed created.
--
-- Safe to run at any time: `custom_subjects` is never modified or emptied by
-- this migration, so the source rows are still there to convert again.
--
-- BEGIN;
-- DELETE FROM public.score_template_subjects
--  WHERE scope = 'class' AND subject_key LIKE 'cs\_%';
-- COMMIT;
--
-- Nothing in `scores` is touched by the rollback, exactly as nothing is touched
-- by the migration: the marks stay where they are and simply go back to being
-- resolved from `custom_subjects` by the pre-00027 code.
-- =============================================================================
