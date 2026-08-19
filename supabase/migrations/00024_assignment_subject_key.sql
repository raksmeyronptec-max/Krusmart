-- =============================================================================
-- 00024_assignment_subject_key.sql
-- =============================================================================
-- Let a teaching assignment name the subject the score system actually uses.
--
-- THE PROBLEM
-- `teacher_assignments.subject_id` is a UUID FK to `public.subjects`. The score
-- template identifies a subject by `subject_key` TEXT, and that is what
-- `scores.subject` stores. Two identity systems for one concept, and nothing
-- joins them:
--
--   * `public.subjects` is empty for every self-serve school. 00004 backfills
--     it only for schools that already had marks (deriving `name`/`code` from
--     the raw `scores.subject` keys), and `app/admin/actions.ts` inserts rows
--     with free-typed names. The Prompt-2 onboarding path never writes it at
--     all — `grep -c subjects app/onboarding/actions.ts` is 0.
--   * So a self-serve school cannot express "Dara teaches hs_physics in 12A":
--     there is no `subjects` row for `subject_id` to point at, and if one were
--     minted its `name` would have no guaranteed relationship to any template
--     key.
--
-- WHY A COLUMN AND NOT MINTED `subjects` ROWS
-- Minting rows would mean keeping two catalogues in step across four template
-- layers (system seeds, school overrides, class overrides, teacher custom
-- subjects), for a mapping that is not 1:1 — system rows are global, `subjects`
-- is per-school, class overrides are per-class. That is precisely the
-- two-sources-of-truth drift docs/score-system-design.md §3.2 refuses for the
-- coefficient, and it would need a backfill that cannot disambiguate
-- admin-typed names from template keys.
--
-- `subject_key` is already the canonical identity for everything score-shaped:
-- the template resolves on it, `scores.subject` stores it, `/score/subjects`
-- edits it. Naming it directly on the assignment adds no second catalogue.
--
-- `public.subjects` keeps its existing job — the admin console's own list, and
-- the `class_subjects` max-score rows — and is deliberately NOT made
-- load-bearing for grading. `subject_id` is untouched, so every existing
-- assignment and the admin console keep working exactly as they do.
--
-- NO FK, ON PURPOSE
-- There is no single table a `subject_key` FK could target: the same key exists
-- at system, school and class scope, and (for grades 11–12) once per track.
-- The key is validated by the application against the *resolved* template for
-- the class, which is the only place that knows which of those rows applies.
--
-- REQUIRES: 00003. SAFETY: additive, nullable, no existing row modified.
-- ROLLBACK: see foot.
-- =============================================================================

BEGIN;

ALTER TABLE public.teacher_assignments
    ADD COLUMN IF NOT EXISTS subject_key TEXT;

COMMENT ON COLUMN public.teacher_assignments.subject_key IS
    'Score-template subject this assignment covers, e.g. hs_physics. NULL means
     a homeroom (whole-class) assignment. Deliberately TEXT and not a FK: the
     same key exists at several template scopes and, for grades 11-12, once per
     track, so only the resolved template for the class can validate it.';

-- One assignment per teacher, class, subject and year — the subject_key
-- counterpart of `teacher_assignments_subject_uniq`.
--
-- Partial on `subject_key IS NOT NULL` for exactly the reason 00003 documents
-- for the `subject_id` pair: NULL <> NULL under SQL semantics, so a plain
-- unique index would let unlimited identical homeroom rows coexist and no
-- ON CONFLICT against it would ever fire. The existing homeroom index already
-- covers the NULL side and is untouched.
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_subject_key_uniq
    ON public.teacher_assignments (teacher_id, class_id, subject_key, academic_year_id)
    WHERE subject_key IS NOT NULL;

-- The collection screen asks "who teaches this subject in this class?" — a
-- class-first lookup, which neither existing index serves.
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class_subject
    ON public.teacher_assignments (class_id, subject_key)
    WHERE status = 'active';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Column and indexes exist:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'teacher_assignments' AND column_name = 'subject_key';
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'teacher_assignments' ORDER BY indexname;
--
-- -- Existing rows are untouched (every one still has NULL subject_key):
-- SELECT count(*) FILTER (WHERE subject_key IS NOT NULL) FROM public.teacher_assignments;
--   -- expect 0 immediately after this migration
--
-- -- A duplicate subject assignment must fail:
-- --   ERROR: duplicate key value violates "teacher_assignments_subject_key_uniq"
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_teacher_assignments_class_subject;
-- DROP INDEX IF EXISTS teacher_assignments_subject_key_uniq;
-- ALTER TABLE public.teacher_assignments DROP COLUMN IF EXISTS subject_key;
-- COMMIT;
-- =============================================================================
