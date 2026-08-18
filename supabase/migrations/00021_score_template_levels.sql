-- =============================================================================
-- 00021_score_template_levels.sql
-- =============================================================================
-- Give the score template its level, grade and track dimensions, and seed the
-- one secondary curriculum whose numbers are verified: grade 12, both tracks.
--
-- WHY THREE NEW COLUMNS INSTEAD OF THE FKs 00016 ALREADY HAS
-- `education_levels` and `grades` are per-school tables (`school_id NOT NULL`,
-- migration 00003): every school owns its own "បឋមសិក្សា" row with its own
-- UUID. A `scope='system'` template row therefore has no global id to point
-- `education_level_id` at — the design's §3.1 shape simply cannot express a
-- national default per level. These columns are the global vocabulary the
-- system layer needs; the per-school FKs stay for school-scope narrowing.
--
--     level_key    'primary' | 'lower_secondary' | 'upper_secondary'
--     grade_number 1–12   (grades.sort_order carries the same number per school)
--     track        'science' | 'social_science'  (grade 11–12 streams)
--
-- All three are NULLable, and NULL means "applies regardless" — which is what
-- every row written before this migration means, so nothing is backfilled and
-- nothing changes for any existing account. The resolver in
-- `lib/scores/template.ts` prefers rows tagged with the class's level and only
-- falls back to the untagged (primary/legacy) set when a level has no rows at
-- all, so the seeds below light up only for a class that actually resolves to
-- grade 12 with a chosen track.
--
-- WHAT IS SEEDED — AND, DELIBERATELY, WHAT IS NOT
-- Grade 12 science and social-science subject lists with their full marks are
-- transcribed from docs/score-system-design.md §6, which verified them against
-- kp-tralach.org (សីហា ២០២៦): totals 475, total coefficient 9.5 per track.
-- Everything else in that section is explicitly unverified and is NOT seeded:
--   * ភាសាបរទេស /25 — the doc's own hypothesis, marked "មិនទាន់បញ្ជាក់"
--   * lower secondary (grades 7–9) — every max is a "?" in §6
--   * grades 10–11 — "មិនទាន់មាន"
-- A wrong full mark silently corrupts every average, ranking and certificate,
-- so those wait for confirmed numbers; seeding them later is data, not code.
--
-- THE UNIQUE INDEX MOVES
-- The two tracks legitimately define the same subject_key twice at system
-- scope (hs_math /125 science, /75 social), which the 00016 index — ignorant
-- of the new columns — would reject under NULLS NOT DISTINCT. It is replaced
-- by one covering the full scoping vocabulary. Consequence worth stating:
-- 00016's seed names the old index's columns as its ON CONFLICT target, so
-- 00016 remains re-runnable only in its ordered position before this file —
-- which is how migrations run anyway.
--
-- REQUIRES: 00016. PostgreSQL 15+ (NULLS NOT DISTINCT).
-- SAFETY: additive; no rows modified, no policy touched. Idempotent.
-- ROLLBACK: see foot.
-- =============================================================================

BEGIN;

ALTER TABLE public.score_template_subjects
    ADD COLUMN IF NOT EXISTS level_key TEXT
        CHECK (level_key IN ('primary','lower_secondary','upper_secondary'));

ALTER TABLE public.score_template_subjects
    ADD COLUMN IF NOT EXISTS grade_number INTEGER
        CHECK (grade_number BETWEEN 1 AND 12);

ALTER TABLE public.score_template_subjects
    ADD COLUMN IF NOT EXISTS track TEXT
        CHECK (track IN ('science','social_science'));

-- Grade 11–12 classes stream into ក្រុមវិទ្យាសាស្ត្រ / វិទ្យាសាស្ត្រសង្គម, and
-- the same subject carries a different full mark per stream, so the class row
-- itself must know which one it is — resolution reads it from here.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS track TEXT
        CHECK (track IN ('science','social_science'));

-- One row per subject per scope target, now including the global dimensions.
DROP INDEX IF EXISTS score_template_subjects_target_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS score_template_subjects_target_lvl_uniq
    ON public.score_template_subjects
       (scope, education_level_id, grade_id, school_id, class_id,
        level_key, grade_number, track, subject_key)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_score_template_subjects_level
    ON public.score_template_subjects(level_key, grade_number, track);

-- =============================================================================
-- SEED — grade 12, both tracks (verified; see header)
-- =============================================================================
-- Single-column subjects: the column id equals the subject_key, matching every
-- seeded single-column subject in 00016, so `scores.subject` stores the key.
-- sort_order follows the doc's table order, spaced by 10.
INSERT INTO public.score_template_subjects
    (scope, level_key, grade_number, track,
     subject_key, label_km, group_label, columns, max_score, value_kind, score_types, sort_order)
VALUES
    -- ---------------------------------------------------- ក្រុមវិទ្យាសាស្ត្រ
    ('system', 'upper_secondary', 12, 'science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     125, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),
    ('system', 'upper_secondary', 12, 'science', 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),
    ('system', 'upper_secondary', 12, 'science', 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),
    ('system', 'upper_secondary', 12, 'science', 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),
    ('system', 'upper_secondary', 12, 'science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),
    ('system', 'upper_secondary', 12, 'science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    -- ---------------------------------------------- ក្រុមវិទ្យាសាស្ត្រសង្គម
    ('system', 'upper_secondary', 12, 'social_science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     125, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),
    ('system', 'upper_secondary', 12, 'social_science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),
    ('system', 'upper_secondary', 12, 'social_science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),
    ('system', 'upper_secondary', 12, 'social_science', 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),
    ('system', 'upper_secondary', 12, 'social_science', 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),
    ('system', 'upper_secondary', 12, 'social_science', 'hs_earth', 'ផែនដីវិទ្យា', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60)

ON CONFLICT (scope, education_level_id, grade_id, school_id, class_id,
             level_key, grade_number, track, subject_key)
DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Six subjects per track, totals matching the doc (475 marks, coeff 9.5):
-- SELECT track, count(*) AS subjects, sum(max_score) AS total_marks,
--        sum(max_score / 50.0) AS total_coefficient
--   FROM public.score_template_subjects
--  WHERE scope = 'system' AND level_key = 'upper_secondary' AND grade_number = 12
--  GROUP BY track;
--   -- expect: science 6 475 9.5 | social_science 6 475 9.5
--
-- -- The 14 primary rows from 00016 are untouched and untagged:
-- SELECT count(*) FROM public.score_template_subjects
--  WHERE scope = 'system' AND level_key IS NULL;          -- expect 14
--
-- -- Re-running this file must not duplicate (expect 12):
-- SELECT count(*) FROM public.score_template_subjects WHERE level_key IS NOT NULL;
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DELETE FROM public.score_template_subjects WHERE level_key IS NOT NULL;
-- DROP INDEX IF EXISTS score_template_subjects_target_lvl_uniq;
-- CREATE UNIQUE INDEX IF NOT EXISTS score_template_subjects_target_uniq
--     ON public.score_template_subjects
--        (scope, education_level_id, grade_id, school_id, class_id, subject_key)
--     NULLS NOT DISTINCT;
-- ALTER TABLE public.score_template_subjects
--     DROP COLUMN IF EXISTS level_key,
--     DROP COLUMN IF EXISTS grade_number,
--     DROP COLUMN IF EXISTS track;
-- ALTER TABLE public.classes DROP COLUMN IF EXISTS track;
-- COMMIT;
-- =============================================================================
