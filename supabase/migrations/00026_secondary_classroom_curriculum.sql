-- =============================================================================
-- 00026_secondary_classroom_curriculum.sql
-- =============================================================================
-- The real classroom curriculum for grades 7–12, from the product owner's
-- verified table (2026-08-19). Supersedes 00021's Grade-12 SEED — 00021's
-- schema work (the level/grade/track columns and indexes) stands untouched;
-- only its twelve seeded rows are corrected and completed here.
--
-- WHY THE 00021 SEED WAS WRONG
-- It transcribed the BacII *national exam* weighting (six subjects per track,
-- hs_math at 125) from kp-tralach.org. Classroom marking uses twelve to
-- thirteen subjects with hs_math at 100. Both tables are real; KruSmart holds
-- teacher-entered classroom marks, so only the classroom one belongs here —
-- the product owner has ruled BacII out of the system entirely (see
-- docs/score-system-design.md §3.3 for the note that stops it coming back).
-- Ruling 2 of the same decision: foreign language is an ordinary /50 subject
-- at every grade — the /25 and both minus-25 rules do not exist.
--
-- SUBJECT KEYS — one key per subject across ALL of grades 7–12
-- The row dimensions (level_key, grade_number, track) carry where and at what
-- full mark a subject is taught; the key carries only WHICH subject it is.
-- That is what keeps a pupil's history attached when they move up: a grade-9
-- and a grade-10 maths mark both live under `scores.subject` values resolved
-- from the same `hs_math` subject. The `hs_` prefix is historical (00021
-- coined it for grade 12) and now spans lower secondary too — renaming it to
-- something prettier would detach every mark already entered, so it stays.
-- Six keys are new here: hs_foreign, hs_ict, hs_lifeskill, hs_arts, hs_pe,
-- hs_econ. The design doc's provisional `sec_*` names were never seeded
-- anywhere, so nothing detaches.
--
-- SHAPE OF THE ROWS
--   * An absent subject is an ABSENT row (grade 7 has no chemistry row, upper
--     secondary no life-skills row) — never a zero, which would silently drag
--     every average down, and never hidden=true.
--   * Grades 7–10 carry track NULL. Grades 11–12 carry one row PER track even
--     where both tracks share a mark, because `filterRowsForContext` treats a
--     NULL-track row as matching ANY track — including a class whose track is
--     still unset, which must keep falling back to the primary list rather
--     than receive a partial /50 curriculum.
--   * Coefficient is never stored: it is max_score ÷ 50 by definition
--     (docs/score-system-design.md §3.2).
--
-- IDEMPOTENCY AND SELF-IDENTIFICATION
-- One statement, ON CONFLICT DO UPDATE against the 00021 unique index. The
-- natural key (scope='system', level_key, grade_number, track, subject_key)
-- IS the provenance — no user can create scope='system' rows (00016's write
-- policies grant only the school and class layers), so every row at these
-- coordinates is this seed's to correct. The UPDATE is what converges 00021's
-- twelve BacII rows (all a membership subset of this table) to classroom
-- values in place: hs_math science 125→100, hs_khmer social 125→100,
-- hs_earth's label gains និងបរិស្ថាន. Its WHERE clause makes a second run a
-- true no-op — nothing is touched when nothing differs.
--
-- REQUIRES: 00021 (columns + unique index). SAFETY: touches only
-- scope='system' rows at secondary coordinates; school and class overrides
-- match by subject_key and are untouched, so every teacher edit survives.
-- ROLLBACK: see foot.
-- =============================================================================

BEGIN;

INSERT INTO public.score_template_subjects
    (scope, level_key, grade_number, track,
     subject_key, label_km, group_label, columns, max_score, value_kind, score_types, sort_order)
VALUES
    ('system', 'lower_secondary', 7, NULL, 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'lower_secondary', 7, NULL, 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'lower_secondary', 7, NULL, 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'lower_secondary', 7, NULL, 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'lower_secondary', 7, NULL, 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'lower_secondary', 7, NULL, 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'lower_secondary', 7, NULL, 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'lower_secondary', 7, NULL, 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'lower_secondary', 7, NULL, 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'lower_secondary', 7, NULL, 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'lower_secondary', 7, NULL, 'hs_lifeskill', 'បំណិនជីវិត', NULL,
     '[{"id":"hs_lifeskill","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 120),

    ('system', 'lower_secondary', 7, NULL, 'hs_arts', 'សិល្បៈសិក្សា', NULL,
     '[{"id":"hs_arts","label":"សិល្បៈសិក្សា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 130),

    ('system', 'lower_secondary', 7, NULL, 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'lower_secondary', 8, NULL, 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'lower_secondary', 8, NULL, 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'lower_secondary', 8, NULL, 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'lower_secondary', 8, NULL, 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'lower_secondary', 8, NULL, 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'lower_secondary', 8, NULL, 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'lower_secondary', 8, NULL, 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'lower_secondary', 8, NULL, 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'lower_secondary', 8, NULL, 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'lower_secondary', 8, NULL, 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'lower_secondary', 8, NULL, 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'lower_secondary', 8, NULL, 'hs_lifeskill', 'បំណិនជីវិត', NULL,
     '[{"id":"hs_lifeskill","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 120),

    ('system', 'lower_secondary', 8, NULL, 'hs_arts', 'សិល្បៈសិក្សា', NULL,
     '[{"id":"hs_arts","label":"សិល្បៈសិក្សា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 130),

    ('system', 'lower_secondary', 8, NULL, 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'lower_secondary', 9, NULL, 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'lower_secondary', 9, NULL, 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'lower_secondary', 9, NULL, 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'lower_secondary', 9, NULL, 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'lower_secondary', 9, NULL, 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'lower_secondary', 9, NULL, 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'lower_secondary', 9, NULL, 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'lower_secondary', 9, NULL, 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'lower_secondary', 9, NULL, 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'lower_secondary', 9, NULL, 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'lower_secondary', 9, NULL, 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'lower_secondary', 9, NULL, 'hs_lifeskill', 'បំណិនជីវិត', NULL,
     '[{"id":"hs_lifeskill","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 120),

    ('system', 'lower_secondary', 9, NULL, 'hs_arts', 'សិល្បៈសិក្សា', NULL,
     '[{"id":"hs_arts","label":"សិល្បៈសិក្សា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 130),

    ('system', 'lower_secondary', 9, NULL, 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 10, NULL, 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'upper_secondary', 10, NULL, 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'upper_secondary', 10, NULL, 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'upper_secondary', 10, NULL, 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'upper_secondary', 10, NULL, 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'upper_secondary', 10, NULL, 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'upper_secondary', 10, NULL, 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'upper_secondary', 10, NULL, 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'upper_secondary', 10, NULL, 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'upper_secondary', 10, NULL, 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'upper_secondary', 10, NULL, 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'upper_secondary', 10, NULL, 'hs_lifeskill', 'បំណិនជីវិត', NULL,
     '[{"id":"hs_lifeskill","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 120),

    ('system', 'upper_secondary', 10, NULL, 'hs_arts', 'សិល្បៈសិក្សា', NULL,
     '[{"id":"hs_arts","label":"សិល្បៈសិក្សា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 130),

    ('system', 'upper_secondary', 10, NULL, 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 11, 'science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'upper_secondary', 11, 'science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'upper_secondary', 11, 'science', 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'upper_secondary', 11, 'science', 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'upper_secondary', 11, 'science', 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'upper_secondary', 11, 'science', 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'upper_secondary', 11, 'science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'upper_secondary', 11, 'science', 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'upper_secondary', 11, 'science', 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'upper_secondary', 11, 'science', 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'upper_secondary', 11, 'science', 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'upper_secondary', 11, 'science', 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 11, 'social_science', 'hs_econ', 'សេដ្ឋកិច្ចវិទ្យា', NULL,
     '[{"id":"hs_econ","label":"សេដ្ឋកិច្ចវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 150),

    ('system', 'upper_secondary', 12, 'science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'upper_secondary', 12, 'science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'upper_secondary', 12, 'science', 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'upper_secondary', 12, 'science', 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'upper_secondary', 12, 'science', 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'upper_secondary', 12, 'science', 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'upper_secondary', 12, 'science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'upper_secondary', 12, 'science', 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'upper_secondary', 12, 'science', 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'upper_secondary', 12, 'science', 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'upper_secondary', 12, 'science', 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'upper_secondary', 12, 'science', 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_khmer', 'ភាសាខ្មែរ', NULL,
     '[{"id":"hs_khmer","label":"ភាសាខ្មែរ","width":"150px"}]'::jsonb,
     100, 'numeric', ARRAY['monthly','semester']::TEXT[], 10),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_math', 'គណិតវិទ្យា', NULL,
     '[{"id":"hs_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 20),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_physics', 'រូបវិទ្យា', NULL,
     '[{"id":"hs_physics","label":"រូបវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 30),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_chemistry', 'គីមីវិទ្យា', NULL,
     '[{"id":"hs_chemistry","label":"គីមីវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 40),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_biology', 'ជីវវិទ្យា', NULL,
     '[{"id":"hs_biology","label":"ជីវវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 50),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_earth', 'ផែនដីវិទ្យា និងបរិស្ថាន', NULL,
     '[{"id":"hs_earth","label":"ផែនដីវិទ្យា និងបរិស្ថាន","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 60),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_history', 'ប្រវត្តិវិទ្យា', NULL,
     '[{"id":"hs_history","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 70),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_geography', 'ភូមិវិទ្យា', NULL,
     '[{"id":"hs_geography","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 80),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_moral_civics', 'សីលធម៌–ពលរដ្ឋវិជ្ជា', NULL,
     '[{"id":"hs_moral_civics","label":"សីលធម៌–ពលរដ្ឋវិជ្ជា","width":"150px"}]'::jsonb,
     75, 'numeric', ARRAY['monthly','semester']::TEXT[], 90),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_foreign', 'ភាសាបរទេស', NULL,
     '[{"id":"hs_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 100),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_ict', 'ព័ត៌មានវិទ្យា (ICT)', NULL,
     '[{"id":"hs_ict","label":"ព័ត៌មានវិទ្យា (ICT)","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 110),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_pe', 'អប់រំកាយ និងកីឡា', NULL,
     '[{"id":"hs_pe","label":"អប់រំកាយ និងកីឡា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 140),

    ('system', 'upper_secondary', 12, 'social_science', 'hs_econ', 'សេដ្ឋកិច្ចវិទ្យា', NULL,
     '[{"id":"hs_econ","label":"សេដ្ឋកិច្ចវិទ្យា","width":"150px"}]'::jsonb,
     50, 'numeric', ARRAY['monthly','semester']::TEXT[], 150)

ON CONFLICT (scope, education_level_id, grade_id, school_id, class_id,
             level_key, grade_number, track, subject_key)
DO UPDATE SET
    label_km    = EXCLUDED.label_km,
    group_label = EXCLUDED.group_label,
    columns     = EXCLUDED.columns,
    max_score   = EXCLUDED.max_score,
    value_kind  = EXCLUDED.value_kind,
    score_types = EXCLUDED.score_types,
    sort_order  = EXCLUDED.sort_order,
    updated_at  = now()
WHERE (score_template_subjects.label_km,  score_template_subjects.group_label,
       score_template_subjects.columns,   score_template_subjects.max_score,
       score_template_subjects.value_kind,score_template_subjects.score_types,
       score_template_subjects.sort_order)
      IS DISTINCT FROM
      (EXCLUDED.label_km, EXCLUDED.group_label, EXCLUDED.columns, EXCLUDED.max_score,
       EXCLUDED.value_kind, EXCLUDED.score_types, EXCLUDED.sort_order);

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Per grade and track: subject count, total marks, Σ coefficient. Expect
-- -- exactly the product owner's checksums —
-- --   7        | 13 | 750 | 15.0          10          | 14 | 800 | 16.0
-- --   8, 9     | 14 | 800 | 16.0          11,12 sci   | 12 | 750 | 15.0
-- --                                       11,12 soc   | 13 | 800 | 16.0
-- SELECT grade_number, track, count(*) AS subjects,
--        sum(max_score) AS total, sum(max_score / 50.0) AS coef
--   FROM public.score_template_subjects
--  WHERE scope = 'system' AND level_key IN ('lower_secondary','upper_secondary')
--  GROUP BY 1, 2 ORDER BY 1, 2;
--
-- -- BacII weightings must be gone — expect 0:
-- SELECT count(*) FROM public.score_template_subjects
--  WHERE scope = 'system' AND max_score = 125;
--
-- -- Absence is absence — expect 0 rows for these:
-- SELECT grade_number, subject_key FROM public.score_template_subjects
--  WHERE scope = 'system'
--    AND ((grade_number = 7  AND subject_key IN ('hs_chemistry','hs_econ'))
--      OR (grade_number >= 11 AND subject_key IN ('hs_lifeskill','hs_arts'))
--      OR (grade_number <= 11 AND track IS NOT NULL AND grade_number < 11));
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Two steps, in one transaction. Step 1 is executable below; step 2 is a
-- pointer (the 00019 precedent — duplicating 00021's twelve rows here would
-- give the repo two copies to drift apart).
--
-- BEGIN;
-- -- 1. Remove every system-scope secondary row — this seed's coordinates,
-- --    which no user can write, so nothing of a school's own is touched.
-- DELETE FROM public.score_template_subjects
--  WHERE scope = 'system'
--    AND level_key IN ('lower_secondary', 'upper_secondary');
-- -- 2. Re-run 00021's INSERT block verbatim (from `INSERT INTO` down to
-- --    `DO NOTHING;`) to restore the pre-00026 grade-12 seed.
-- COMMIT;
--
-- Rolling back re-introduces the BacII weighting and empties grades 7–11 —
-- do it only if this seed itself is wrong, and expect the level picker to be
-- reverted with it (lib/onboarding/curriculum.ts curriculumStatus).
-- =============================================================================
