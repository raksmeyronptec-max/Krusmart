-- =============================================================================
-- 00023_secondary_grading_schemes.sql
-- =============================================================================
-- Make the stored grading schemes agree with the multi-level engine.
--
-- 00009 seeded every education level — including មធ្យមសិក្សាបឋមភូមិ and
-- មធ្យមសិក្សាទុតិយភូមិ — with the *primary* /10 ladder, because at the time it
-- was the only ladder the app had. The engine now carries the secondary scheme
-- (docs/score-system-design.md §3.2–3.3): a /50 average, coefficient weighting
-- with the national unit of 50, and descriptors shifted one step
-- (A=ល្អប្រសើរ …). The stored rows must say the same thing, or the admin
-- grading screen displays a ladder no calculation uses.
--
-- Runtime note: the score screens resolve the scheme from the level through
-- `lib/grading/levelSchemes.ts` and do not read these rows yet — the admin
-- screen is display-only, so no admin-edited scheme exists to preserve. The
-- guard below still refuses to touch any row that no longer looks like the
-- untouched 00009 seed (no `weighting` key, maxScore 10), out of plain
-- caution.
--
-- Levels created by self-serve onboarding after 00009 have no scheme row at
-- all; the INSERT half seeds those, both primary and secondary shapes, with
-- the same NOT EXISTS rule 00009 used. `seedEducationLevel` in
-- app/onboarding/actions.ts now does the same at creation time, so this
-- backfill and the app cannot drift apart on new schools.
--
-- REQUIRES: 00009. SAFETY: touches only untouched 00009 seeds and inserts
-- missing defaults; primary rows are never modified. Idempotent.
-- =============================================================================

BEGIN;

-- --- correct the secondary defaults 00009 stamped with the primary ladder ----
UPDATE public.grading_schemes gs
   SET config = jsonb_build_object(
        'maxScore', 50,
        'passMark', 25,
        'weighting', 'coefficient',
        'coefficientUnit', 50,
        'bands', jsonb_build_array(
            jsonb_build_object('letter','A','min',45,'max',50,   'label','ល្អប្រសើរ'),
            jsonb_build_object('letter','B','min',40,'max',44.99,'label','ល្អណាស់'),
            jsonb_build_object('letter','C','min',35,'max',39.99,'label','ល្អ'),
            jsonb_build_object('letter','D','min',30,'max',34.99,'label','ល្អបង្គួរ'),
            jsonb_build_object('letter','E','min',25,'max',29.99,'label','មធ្យម'),
            jsonb_build_object('letter','F','min',0, 'max',24.99,'label','ខ្សោយ')
        )
   )
  FROM public.education_levels el
 WHERE el.id = gs.education_level_id
   AND el.name IN ('មធ្យមសិក្សាបឋមភូមិ', 'មធ្យមសិក្សាទុតិយភូមិ')
   AND gs.is_default
   -- Only the untouched 00009 shape: primary maxScore and no weighting key.
   AND NOT (gs.config ? 'weighting')
   AND gs.config->>'maxScore' = '10';

-- --- seed defaults for levels created after 00009 ----------------------------
INSERT INTO public.grading_schemes (school_id, education_level_id, name, is_default, config)
SELECT
    el.school_id,
    el.id,
    'ការវាយតម្លៃស្តង់ដារ · ' || el.name,
    true,
    CASE
        WHEN el.name IN ('មធ្យមសិក្សាបឋមភូមិ', 'មធ្យមសិក្សាទុតិយភូមិ') THEN
            jsonb_build_object(
                'maxScore', 50, 'passMark', 25,
                'weighting', 'coefficient', 'coefficientUnit', 50,
                'bands', jsonb_build_array(
                    jsonb_build_object('letter','A','min',45,'max',50,   'label','ល្អប្រសើរ'),
                    jsonb_build_object('letter','B','min',40,'max',44.99,'label','ល្អណាស់'),
                    jsonb_build_object('letter','C','min',35,'max',39.99,'label','ល្អ'),
                    jsonb_build_object('letter','D','min',30,'max',34.99,'label','ល្អបង្គួរ'),
                    jsonb_build_object('letter','E','min',25,'max',29.99,'label','មធ្យម'),
                    jsonb_build_object('letter','F','min',0, 'max',24.99,'label','ខ្សោយ')
                )
            )
        ELSE
            jsonb_build_object(
                'maxScore', 10, 'passMark', 5,
                'weighting', 'simple',
                'bands', jsonb_build_array(
                    jsonb_build_object('letter','A','min',9,'max',10,  'label','ល្អណាស់'),
                    jsonb_build_object('letter','B','min',8,'max',8.99,'label','ល្អ'),
                    jsonb_build_object('letter','C','min',7,'max',7.99,'label','ល្អបង្គួរ'),
                    jsonb_build_object('letter','D','min',6,'max',6.99,'label','មធ្យម'),
                    jsonb_build_object('letter','E','min',5,'max',5.99,'label','ខ្សោយ'),
                    jsonb_build_object('letter','F','min',0,'max',4.99,'label','ធ្លាក់')
                )
            )
    END
FROM public.education_levels el
WHERE NOT EXISTS (
    SELECT 1 FROM public.grading_schemes gs
     WHERE gs.education_level_id = el.id AND gs.is_default
);

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Every secondary default is /50 coefficient; every primary default /10:
-- SELECT el.name, gs.config->>'maxScore' AS max, gs.config->>'weighting' AS w
--   FROM public.grading_schemes gs
--   JOIN public.education_levels el ON el.id = gs.education_level_id
--  WHERE gs.is_default ORDER BY el.name;
--
-- -- Re-running changes nothing (UPDATE guard + NOT EXISTS).
--
-- =============================================================================
-- ROLLBACK: restore 00009's config on the two secondary names, or re-run 00009
-- after deleting affected rows. Primary rows were never touched.
-- =============================================================================
