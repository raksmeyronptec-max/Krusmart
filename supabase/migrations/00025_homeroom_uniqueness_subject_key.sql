-- =============================================================================
-- 00025_homeroom_uniqueness_subject_key.sql
-- =============================================================================
-- Let one teacher hold a homeroom row AND subject rows — or several subject
-- rows — in the same class.
--
-- THE PROBLEM
-- 00003's homeroom uniqueness is keyed on the OLD subject identity:
--
--   teacher_assignments_homeroom_uniq
--       ON (teacher_id, class_id, academic_year_id) WHERE subject_id IS NULL
--
-- A subject assignment written the NEW way (00024's `subject_key`) leaves
-- `subject_id` NULL by definition — so to this index it *is* a homeroom row.
-- Consequences, both real and both found by scripts/validate-rls.mjs the
-- first time it gave one teacher a second row in one class:
--
--   * a teacher with a homeroom row cannot be assigned any specific subject
--     in that class — the INSERT dies on this index with 23505, surfaced to
--     the admin as the misleading "គ្រូនេះត្រូវបានចាត់តាំងរួចហើយ";
--   * one teacher cannot teach TWO subjects in one class (both rows have
--     `subject_id IS NULL`), which is the ordinary secondary-school case the
--     subject_key column exists to model.
--
-- THE FIX
-- A homeroom row is one with NO subject under EITHER identity. The predicate
-- says so explicitly. New name, because the old and new indexes mean
-- different things and a re-run must be able to tell them apart.
--
-- Nothing at runtime names the old index: the app only ever plain-INSERTs
-- into teacher_assignments, and the one ON CONFLICT arbiter that inferred it
-- (00004's backfill) runs strictly earlier in the sequence and is never
-- re-run.
--
-- REQUIRES: 00024 (`subject_key` column). SAFETY: metadata only, no row is
-- read or written; uniqueness is briefly unenforced between the two
-- statements, which the surrounding transaction closes.
-- ROLLBACK: see foot.
-- =============================================================================

BEGIN;

DROP INDEX IF EXISTS teacher_assignments_homeroom_uniq;

-- One homeroom row per teacher, class and year. Subject rows — either
-- identity — fall outside the predicate and are governed by their own
-- indexes: `teacher_assignments_subject_uniq` (00003, subject_id) and
-- `teacher_assignments_subject_key_uniq` (00024, subject_key).
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_homeroom_key_uniq
    ON public.teacher_assignments (teacher_id, class_id, academic_year_id)
    WHERE subject_id IS NULL AND subject_key IS NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Expect exactly the new index, with both NULL tests in its predicate:
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE tablename = 'teacher_assignments' AND indexname LIKE '%homeroom%';
-- -- Behavioural: as a school admin, insert a homeroom row and a subject_key
-- -- row for the same (teacher, class, year) — both succeed; repeat either —
-- -- 23505.
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS teacher_assignments_homeroom_key_uniq;
-- CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_homeroom_uniq
--     ON public.teacher_assignments (teacher_id, class_id, academic_year_id)
--     WHERE subject_id IS NULL;
-- COMMIT;
--
-- WARNING — the old index cannot be rebuilt if any teacher already holds both
-- a homeroom row and a subject_key row (or two subject_key rows) in one
-- class: those rows are duplicates under the old predicate and the CREATE
-- fails with 23505. That is data this migration exists to allow, so rolling
-- back after real use means first deleting the newer of the colliding rows:
--
--   SELECT teacher_id, class_id, academic_year_id, count(*)
--     FROM public.teacher_assignments WHERE subject_id IS NULL
--    GROUP BY 1,2,3 HAVING count(*) > 1;   -- what would collide
-- =============================================================================
