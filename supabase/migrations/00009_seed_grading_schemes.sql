-- =============================================================================
-- 00009_seed_grading_schemes.sql
-- =============================================================================
-- Give every education level a default grading scheme.
--
-- The seeded config reproduces the A-F ladder the application has always used
-- — A≥9, B≥8, C≥7, D≥6, E≥5, F below, out of 10 — which six feature clients
-- each carried their own copy of. Seeding it makes the ladder configurable per
-- education level without changing a single existing result.
--
-- Idempotent: one default scheme per (school, education level).
-- =============================================================================

BEGIN;

INSERT INTO public.grading_schemes (school_id, education_level_id, name, is_default, config)
SELECT
    el.school_id,
    el.id,
    'ការវាយតម្លៃស្តង់ដារ · ' || el.name,
    true,
    jsonb_build_object(
        'maxScore', 10,
        'passMark', 5,
        'bands', jsonb_build_array(
            jsonb_build_object('letter','A','min',9,'max',10,   'label','ល្អណាស់'),
            jsonb_build_object('letter','B','min',8,'max',8.99, 'label','ល្អ'),
            jsonb_build_object('letter','C','min',7,'max',7.99, 'label','ល្អបង្គួរ'),
            jsonb_build_object('letter','D','min',6,'max',6.99, 'label','មធ្យម'),
            jsonb_build_object('letter','E','min',5,'max',5.99, 'label','ខ្សោយ'),
            jsonb_build_object('letter','F','min',0,'max',4.99, 'label','ធ្លាក់')
        ),
        -- Relative weight per assessment type, applied by `weightedAverage`.
        -- Chosen to leave the legacy monthly/semester paths untouched: those do
        -- not go through assessments at all.
        'typeWeights', jsonb_build_object(
            'monthly',    1,
            'quiz',       1,
            'assignment', 1,
            'midterm',    2,
            'final',      3,
            'semester',   2,
            'yearly',     3
        )
    )
FROM public.education_levels el
WHERE NOT EXISTS (
    SELECT 1 FROM public.grading_schemes gs
     WHERE gs.education_level_id = el.id AND gs.is_default
);

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT el.name AS level, gs.name AS scheme,
--        gs.config->>'maxScore' AS max, gs.config->>'passMark' AS pass,
--        jsonb_array_length(gs.config->'bands') AS bands
--   FROM public.grading_schemes gs
--   JOIN public.education_levels el ON el.id = gs.education_level_id
--  ORDER BY el.school_id, el.sort_order;     -- expect 3 rows per school, 6 bands each
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DELETE FROM public.grading_schemes WHERE is_default;
-- =============================================================================
