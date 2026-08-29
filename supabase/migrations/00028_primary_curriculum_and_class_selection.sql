-- =============================================================================
-- 00028_primary_curriculum_and_class_selection.sql
-- =============================================================================
-- Two things, and they are two halves of one idea: the system says which
-- subjects EXIST, the teacher says which of them they TEACH.
--
--   1. Seed the primary curriculum (grades 1–6) at system scope, grade-aware,
--      the way 00026 did for grades 7–12.
--   2. `class_template_subjects` — the class's chosen subset of that
--      curriculum, plus which components of each subject it uses.
--
-- WHY A SEED AT ALL, WHEN 00016 ALREADY SEEDED "PRIMARY"
-- 00016 seeded fourteen rows: the picker as `ScoreEnterClient` shipped it.
-- That is a fraction of the primary curriculum — no science, no social
-- studies, no health, no life skills, no foreign language, and ten of the
-- fourteen semester subjects the totals grid already renders are missing from
-- the picker entirely. Those subjects were never absent from the product; they
-- lived in `subjectConfigs.ts` as a compiled-in fallback map, reachable by the
-- totals grid but not offerable by the picker. This migration promotes that
-- key space into the database, which is where §19 of the design says the
-- curriculum belongs.
--
-- NO SUBJECT KEY AND NO COLUMN ID IS INVENTED HERE. Every one of the 52
-- subject keys below already appears in `subjectConfigs.ts`, and every column
-- id inside `columns` is copied from it verbatim. That is the property that
-- makes this migration safe: `scores.subject` holds column ids, so a mark
-- already recorded under `sci_phy` or `soc_ethic` starts resolving in the
-- picker instead of only in the totals grid. Nothing detaches, because nothing
-- is renamed.
--
-- WHY EVERY GRADE GETS A COMPLETE SET
-- `filterRowsForContext` (lib/scores/template.ts) is all-or-nothing: if any
-- system row carries the class's `level_key`, the untagged rows stop applying
-- to that class entirely. So tagging *part* of the primary curriculum with
-- `level_key='primary'` would delete the rest of it from every primary class.
-- Each grade therefore carries its own complete set — 34 monthly + 18 semester
-- — exactly as 00026 seeds grades 7–12. Per-grade differences become a data
-- edit to one grade's rows rather than a schema change.
--
-- The six grades are seeded identically on purpose. The verified per-grade
-- MoEYS availability table is not in hand, and this file follows 00021's rule:
-- a wrong curriculum number silently corrupts every average, ranking and
-- certificate, so nothing is invented. The *shape* is grade-addressable now;
-- narrowing grade 1 to drop `math_alg`, say, is one DELETE against
-- (level_key,grade_number,subject_key) once the table is confirmed.
--
-- WHAT IS DELIBERATELY NOT TOUCHED
--   * The fourteen untagged rows from 00016. They remain the fallback for a
--     legacy account and for any class that resolves no education level, and
--     they are byte-identical to what shipped — the design doc's "primary
--     stays 100%" holds exactly where it was promised.
--   * `public.scores`. No mark is read, written or migrated.
--   * Secondary rows (00021/00026) and every school- and class-scope override.
--     Overrides match by `subject_key`, so a teacher's edit survives.
--   * Full marks. Primary is /10 with no coefficient (design §6); every row
--     below says 10.
--
-- REQUIRES: 00016 (table, RLS, grants), 00021 (level_key / grade_number /
--           track and the widened unique index), 00003 (classes).
-- SAFETY: additive. No DROP, no destructive ALTER, idempotent throughout.
-- ROLLBACK: see the foot of this file.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1 — the primary curriculum, grades 1–6
-- =============================================================================
-- `ON CONFLICT DO NOTHING` against the 00021 index, which covers
-- (scope, education_level_id, grade_id, school_id, class_id, level_key,
--  grade_number, track, subject_key) NULLS NOT DISTINCT — so re-running this
-- file cannot duplicate a row, and cannot revert an amendment made on top of
-- one either.

INSERT INTO public.score_template_subjects
    (scope, level_key, grade_number,
     subject_key, label_km, group_label, columns, max_score, value_kind, score_types, sort_order)
VALUES
    -- ============================ ថ្នាក់ទី1 ============================
    ('system', 'primary', 1, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 1, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 1, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 1, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 1, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 1, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 1, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 1, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 1, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 1, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 1, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 1, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 1, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 1, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 1, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 1, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 1, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 1, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 1, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 1, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 1, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 1, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 1, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 1, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 1, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 1, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 1, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 1, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 1, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 1, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 1, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 1, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 1, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 1, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 1, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 1, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 1, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 1, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 1, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 1, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 1, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 1, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 1, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 1, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 1, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 1, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 1, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 1, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 1, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 1, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 1, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 1, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180),
    -- ============================ ថ្នាក់ទី2 ============================
    ('system', 'primary', 2, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 2, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 2, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 2, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 2, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 2, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 2, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 2, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 2, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 2, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 2, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 2, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 2, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 2, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 2, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 2, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 2, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 2, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 2, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 2, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 2, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 2, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 2, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 2, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 2, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 2, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 2, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 2, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 2, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 2, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 2, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 2, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 2, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 2, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 2, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 2, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 2, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 2, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 2, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 2, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 2, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 2, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 2, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 2, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 2, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 2, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 2, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 2, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 2, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 2, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 2, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 2, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180),
    -- ============================ ថ្នាក់ទី3 ============================
    ('system', 'primary', 3, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 3, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 3, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 3, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 3, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 3, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 3, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 3, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 3, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 3, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 3, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 3, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 3, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 3, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 3, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 3, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 3, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 3, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 3, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 3, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 3, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 3, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 3, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 3, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 3, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 3, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 3, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 3, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 3, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 3, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 3, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 3, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 3, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 3, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 3, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 3, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 3, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 3, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 3, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 3, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 3, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 3, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 3, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 3, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 3, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 3, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 3, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 3, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 3, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 3, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 3, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 3, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180),
    -- ============================ ថ្នាក់ទី4 ============================
    ('system', 'primary', 4, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 4, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 4, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 4, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 4, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 4, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 4, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 4, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 4, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 4, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 4, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 4, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 4, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 4, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 4, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 4, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 4, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 4, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 4, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 4, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 4, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 4, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 4, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 4, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 4, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 4, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 4, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 4, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 4, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 4, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 4, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 4, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 4, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 4, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 4, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 4, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 4, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 4, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 4, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 4, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 4, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 4, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 4, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 4, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 4, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 4, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 4, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 4, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 4, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 4, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 4, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 4, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180),
    -- ============================ ថ្នាក់ទី5 ============================
    ('system', 'primary', 5, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 5, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 5, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 5, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 5, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 5, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 5, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 5, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 5, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 5, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 5, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 5, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 5, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 5, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 5, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 5, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 5, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 5, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 5, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 5, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 5, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 5, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 5, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 5, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 5, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 5, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 5, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 5, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 5, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 5, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 5, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 5, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 5, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 5, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 5, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 5, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 5, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 5, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 5, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 5, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 5, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 5, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 5, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 5, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 5, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 5, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 5, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 5, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 5, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 5, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 5, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 5, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180),
    -- ============================ ថ្នាក់ទី6 ============================
    ('system', 'primary', 6, 'khmer_all', 'ភាសាខ្មែរ (គ្រប់បំណិន)', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"80px"},{"id":"kh_speak","label":"និយាយ","width":"80px"},{"id":"kh_read","label":"អាន","width":"80px"},{"id":"kh_write","label":"សរសេរ","width":"80px"},{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"80px"},{"id":"kh_recitation","label":"មេសូត្រ","width":"80px"},{"id":"kh_essay","label":"តែងសេចក្តី","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 10),
    ('system', 'primary', 6, 'kh_listen', 'សមត្ថភាពស្តាប់', 'ភាសាខ្មែរ',
     '[{"id":"kh_listen","label":"ស្តាប់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 20),
    ('system', 'primary', 6, 'kh_speak', 'សមត្ថភាពនិយាយ', 'ភាសាខ្មែរ',
     '[{"id":"kh_speak","label":"និយាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 30),
    ('system', 'primary', 6, 'kh_read', 'សមត្ថភាពអាន', 'ភាសាខ្មែរ',
     '[{"id":"kh_read","label":"អាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 40),
    ('system', 'primary', 6, 'kh_write', 'សមត្ថភាពសរសេរ', 'ភាសាខ្មែរ',
     '[{"id":"kh_write","label":"សរសេរ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 50),
    ('system', 'primary', 6, 'kh_calligraphy', 'អក្សរផ្ចង់', 'ភាសាខ្មែរ',
     '[{"id":"kh_calligraphy","label":"អក្សរផ្ចង់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 60),
    ('system', 'primary', 6, 'kh_recitation', 'មេសូត្រ', 'ភាសាខ្មែរ',
     '[{"id":"kh_recitation","label":"មេសូត្រ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 70),
    ('system', 'primary', 6, 'kh_essay', 'តែងសេចក្តី', 'ភាសាខ្មែរ',
     '[{"id":"kh_essay","label":"តែងសេចក្តី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 80),
    ('system', 'primary', 6, 'math_general', 'គណិតវិទ្យា (គ្រប់ផ្នែក)', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"70px"},{"id":"math_meas","label":"រង្វាស់","width":"70px"},{"id":"math_geo","label":"ធរណី","width":"70px"},{"id":"math_alg","label":"ពីជគណិត","width":"70px"},{"id":"math_stat","label":"ស្ថិតិ","width":"70px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 90),
    ('system', 'primary', 6, 'math_num', 'ចំនួន', 'គណិតវិទ្យា',
     '[{"id":"math_num","label":"ចំនួន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 100),
    ('system', 'primary', 6, 'math_meas', 'រង្វាស់រង្វាល់', 'គណិតវិទ្យា',
     '[{"id":"math_meas","label":"រង្វាស់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 110),
    ('system', 'primary', 6, 'math_geo', 'ធរណីមាត្រ', 'គណិតវិទ្យា',
     '[{"id":"math_geo","label":"ធរណី","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 120),
    ('system', 'primary', 6, 'math_alg', 'ពីជគណិត', 'គណិតវិទ្យា',
     '[{"id":"math_alg","label":"ពីជគណិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 130),
    ('system', 'primary', 6, 'math_stat', 'ស្ថិតិ', 'គណិតវិទ្យា',
     '[{"id":"math_stat","label":"ស្ថិតិ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 140),
    ('system', 'primary', 6, 'science_all', 'វិទ្យាសាស្ត្រ (គ្រប់ផ្នែក)', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូប","width":"80px"},{"id":"sci_chem","label":"គីមី","width":"80px"},{"id":"sci_bio","label":"ជីវៈ","width":"80px"},{"id":"sci_earth","label":"ផែនដី","width":"80px"},{"id":"sci_applied","label":"អនុវត្តន៍","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 150),
    ('system', 'primary', 6, 'sci_phy', 'រូបវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_phy","label":"រូបវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 160),
    ('system', 'primary', 6, 'sci_chem', 'គីមីវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_chem","label":"គីមីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 170),
    ('system', 'primary', 6, 'sci_bio', 'ជីវវិទ្យា', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_bio","label":"ជីវវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 180),
    ('system', 'primary', 6, 'sci_earth', 'ផែនដីវិទ្យា-បរិស្ថាន', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_earth","label":"ផែនដីវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 190),
    ('system', 'primary', 6, 'sci_applied', 'វិទ្យាសាស្ត្រអនុវត្តន៍', 'វិទ្យាសាស្ត្រ',
     '[{"id":"sci_applied","label":"វិទ្យាសាស្ត្រអនុវត្តន៍","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 200),
    ('system', 'primary', 6, 'social_all', 'សិក្សាសង្គម (គ្រប់ផ្នែក)', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"80px"},{"id":"soc_geo","label":"ភូមិ","width":"80px"},{"id":"soc_hist","label":"ប្រវត្តិ","width":"80px"},{"id":"soc_home","label":"គេហៈ","width":"80px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 210),
    ('system', 'primary', 6, 'soc_ethic', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'សិក្សាសង្គម',
     '[{"id":"soc_ethic","label":"សីលធម៌","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 220),
    ('system', 'primary', 6, 'soc_geo', 'ភូមិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_geo","label":"ភូមិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 230),
    ('system', 'primary', 6, 'soc_hist', 'ប្រវត្តិវិទ្យា', 'សិក្សាសង្គម',
     '[{"id":"soc_hist","label":"ប្រវត្តិវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 240),
    ('system', 'primary', 6, 'soc_home', 'គេហវិទ្យា-អប់រំសិល្បៈ', 'សិក្សាសង្គម',
     '[{"id":"soc_home","label":"គេហវិទ្យា","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 250),
    ('system', 'primary', 6, 'health_all', 'អប់រំសុខភាព (គ្រប់ផ្នែក)', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"100px"},{"id":"health_hygiene","label":"សុខភាព","width":"100px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 260),
    ('system', 'primary', 6, 'pe_sport', 'អប់រំកាយ និងកីឡា', 'អប់រំសុខភាព',
     '[{"id":"pe_sport","label":"អប់រំកាយ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 270),
    ('system', 'primary', 6, 'health_hygiene', 'សុខភាព និងអនាម័យ', 'អប់រំសុខភាព',
     '[{"id":"health_hygiene","label":"សុខភាព និងអនាម័យ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 280),
    ('system', 'primary', 6, 'life_skill', 'អប់រំបំណិនជីវិត', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"life_skill","label":"បំណិនជីវិត","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 290),
    ('system', 'primary', 6, 'foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាផ្សេងៗ',
     '[{"id":"foreign","label":"ភាសាបរទេស","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 300),
    ('system', 'primary', 6, 'ex_oral', 'សំណួរផ្ទាល់មាត់', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_oral","label":"សំណួរផ្ទាល់មាត់","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 310),
    ('system', 'primary', 6, 'ex_att', 'វត្តមាន', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_att","label":"វត្តមាន","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 320),
    ('system', 'primary', 6, 'ex_book', 'សៀវភៅ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_book","label":"សៀវភៅ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 330),
    ('system', 'primary', 6, 'ex_hw', 'កិច្ចការផ្ទះ', 'ការបំពេញបន្ថែម',
     '[{"id":"ex_hw","label":"កិច្ចការផ្ទះ","width":"120px"}]'::jsonb,
     10, 'numeric', ARRAY['monthly']::TEXT[], 340),
    ('system', 'primary', 6, 'sem_kh_reading', 'អំណាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_reading","label":"អំណាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 10),
    ('system', 'primary', 6, 'sem_kh_listening_speaking', 'ស្តាប់-និយាយ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_listening_speaking","label":"ស្តាប់-និយាយ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 20),
    ('system', 'primary', 6, 'sem_kh_dictation', 'សរសេរតាមអាន', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_dictation","label":"សរសេរតាមអាន","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 30),
    ('system', 'primary', 6, 'sem_kh_essay', 'តែងសេចក្តី', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_kh_essay","label":"តែងសេចក្តី","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 40),
    ('system', 'primary', 6, 'sem_math', 'គណិតវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_math","label":"គណិតវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 50),
    ('system', 'primary', 6, 'sem_science', 'វិទ្យាសាស្ត្រ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_science","label":"វិទ្យាសាស្ត្រ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 60),
    ('system', 'primary', 6, 'sem_moral_civics', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_moral_civics","label":"សីលធម៌-ពលរដ្ឋ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 70),
    ('system', 'primary', 6, 'sem_geo', 'ភូមិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_geo","label":"ភូមិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 80),
    ('system', 'primary', 6, 'sem_hist', 'ប្រវត្តិវិទ្យា', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_hist","label":"ប្រវត្តិវិទ្យា","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 90),
    ('system', 'primary', 6, 'sem_home_arts', 'គេហវិទ្យា-សិល្បៈ', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_home_arts","label":"គេហៈ-សិល្បៈ","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 100),
    ('system', 'primary', 6, 'sem_life_skills', 'បំណិនជីវិត', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_life_skills","label":"បំណិនជីវិត","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 110),
    ('system', 'primary', 6, 'sem_foreign', 'ភាសាបរទេស', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_foreign","label":"ភាសាបរទេស","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 120),
    ('system', 'primary', 6, 'sem_sport', 'អប់រំកាយ-សុខភាព', 'មុខវិជ្ជាសិក្សា',
     '[{"id":"sem_sport","label":"អប់រំកាយ-សុខភាព","width":"150px"}]'::jsonb,
     10, 'numeric', ARRAY['semester']::TEXT[], 130),
    ('system', 'primary', 6, 'sem_behavior_all', 'វាយតម្លៃរួមទាំង៤', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]},{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"110px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 140),
    ('system', 'primary', 6, 'sem_eval_knowledge', 'ចំណេះដឹង', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_knowledge","label":"ចំណេះដឹង","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 150),
    ('system', 'primary', 6, 'sem_eval_skill', 'បំណិន-ចំណេះធ្វើ', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_skill","label":"បំណិន-ចំណេះធ្វើ","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 160),
    ('system', 'primary', 6, 'sem_eval_moral', 'តម្លៃ-សីលធម៌', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_moral","label":"តម្លៃ-សីលធម៌","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 170),
    ('system', 'primary', 6, 'sem_eval_participate', 'សាមគ្គីភាព-ការចូលរួម', 'ការវាយតម្លៃអាកប្បកិរិយា',
     '[{"id":"sem_eval_participate","label":"សាមគ្គីភាព-ការចូលរួម","width":"150px","type":"select","options":["ល្អ","ល្អបង្គួរ","មធ្យម","ខ្សោយ"]}]'::jsonb,
     10, 'text', ARRAY['semester']::TEXT[], 180)

ON CONFLICT (scope, education_level_id, grade_id, school_id, class_id,
             level_key, grade_number, track, subject_key)
DO NOTHING;

-- =============================================================================
-- PART 2 — class_template_subjects: which curriculum subjects a class teaches
-- =============================================================================
-- WHY THIS IS NOT A `score_template_subjects` ROW AT scope='class'
-- That layer already means something else, and the difference is load-bearing.
-- A class-scope row is a *definition override*: it answers "what is this
-- subject called, marked out of, made of, for this class". `updateClassSubject`
-- deletes one the moment it stops differing from what it inherits, precisely so
-- inheritance stays live (a redundant row pins the definition and would cut the
-- class off from every future change to the national default). A selection
-- carries no definition difference at all — "I teach Khmer" says nothing about
-- what Khmer is — so stored in that layer it would be deleted as redundant on
-- the next edit. Two meanings, two tables.
--
-- WHAT A ROW MEANS
--   present  -> this class's template includes this subject
--   absent   -> it does not
-- and, because absence is the default, a class with NO rows for a score type
-- is a class that has not chosen yet. That case resolves the full template,
-- exactly as the product behaved before this migration. Opt-in configuration
-- with no cliff for accounts that never opt in — the same "derive the mode from
-- data, never from a flag" rule the legacy/v2 scope resolver follows.
--
-- WHY NO academic_year_id
-- `classes.academic_year_id` already pins the year (00003), so `class_id`
-- implies it. Storing it again would let the two disagree, and a selection
-- filed under the wrong year renders an empty grid.
--
-- WHY subject_key IS NOT A FOREIGN KEY
-- It names a subject in the *resolved* template, which is three layers merged
-- at read time and includes rows scoped to other schools. There is no single
-- parent row to point at. The server action validates the key against the
-- class's own resolved template before inserting, and RLS bounds the class.

CREATE TABLE IF NOT EXISTS public.class_template_subjects (
    id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,

    -- The `subject_key` of a row in the class's resolved template. Not a
    -- column id: this names the subject, not one of its columns.
    subject_key TEXT NOT NULL,

    -- Which components of the subject this class actually marks, as
    -- `SubjectColumn.id` values. NULL means "every column the definition
    -- carries" — the common case, stored as NULL rather than a copy so that a
    -- later change to the subject's columns reaches this class.
    --
    -- Narrowing this NEVER deletes a mark. A column dropped here stops being
    -- offered; rows already in `scores` under its id keep resolving in the
    -- totals grid and on reports, the same contract `hidden` has.
    enabled_columns TEXT[],

    -- Position within the class's own list. Independent of the curriculum's
    -- `sort_order`, so a teacher can order their register their way.
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    -- An empty array would mean "a subject with no columns", which renders an
    -- unusable grid. NULL is how "all columns" is spelled.
    CONSTRAINT class_template_subjects_columns_ck
        CHECK (enabled_columns IS NULL OR cardinality(enabled_columns) >= 1)
);

-- §22: a subject may appear at most once in a class's template. Enforced here
-- as well as in the UI and the server action, because the UI can be raced by
-- two teachers on the same class and the action re-reads before it writes.
CREATE UNIQUE INDEX IF NOT EXISTS class_template_subjects_uniq
    ON public.class_template_subjects (class_id, subject_key);

CREATE INDEX IF NOT EXISTS idx_class_template_subjects_class
    ON public.class_template_subjects (class_id);

COMMENT ON TABLE public.class_template_subjects IS
    'Which curriculum subjects a class actually teaches, and which components of
     each. A class with no rows for a score type has not configured that grid
     and resolves the full template — absence means "not chosen yet", never
     "teaches nothing".';

ALTER TABLE public.class_template_subjects ENABLE ROW LEVEL SECURITY;

-- RLS mirrors `score_templates_class_write` in 00016 exactly: the teachers
-- assigned to the class, plus that school's admins. Stated as two policies
-- rather than one FOR ALL so the read side is legible on its own; the predicate
-- is the same either way.

DROP POLICY IF EXISTS "class_template_subjects_select" ON public.class_template_subjects;
CREATE POLICY "class_template_subjects_select" ON public.class_template_subjects
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = class_template_subjects.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active')
     OR EXISTS (SELECT 1 FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = class_template_subjects.class_id
                   AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "class_template_subjects_write" ON public.class_template_subjects;
CREATE POLICY "class_template_subjects_write" ON public.class_template_subjects
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = class_template_subjects.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active')
     OR EXISTS (SELECT 1 FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = class_template_subjects.class_id
                   AND public.is_school_admin(ay.school_id))
    ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = class_template_subjects.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active')
     OR EXISTS (SELECT 1 FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = class_template_subjects.class_id
                   AND public.is_school_admin(ay.school_id))
    );

-- Without these PostgREST answers 42501 whatever the policies say — the trap
-- 00005 exists to close.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_template_subjects TO authenticated;
GRANT ALL ON public.class_template_subjects TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- 312 primary rows: six grades x (34 monthly + 18 semester).
-- SELECT count(*) FROM public.score_template_subjects
--  WHERE scope='system' AND level_key='primary';            -- expect 312
--
-- -- Every grade complete and identical in size — the property that makes
-- -- filterRowsForContext safe (see header):
-- SELECT grade_number,
--        count(*) FILTER (WHERE 'monthly'  = ANY(score_types)) AS monthly,
--        count(*) FILTER (WHERE 'semester' = ANY(score_types)) AS semester
--   FROM public.score_template_subjects
--  WHERE scope='system' AND level_key='primary'
--  GROUP BY 1 ORDER BY 1;                    -- expect 6 rows of (34, 18)
--
-- -- The fourteen untagged rows from 00016 are untouched:
-- SELECT count(*) FROM public.score_template_subjects
--  WHERE scope='system' AND level_key IS NULL;              -- expect 14
--
-- -- Every key 00016 seeded still exists in every primary grade, so no class
-- -- can lose a subject by gaining the level tag:
-- SELECT g AS grade, k AS missing_key
--   FROM generate_series(1,6) g
--   CROSS JOIN (VALUES ('khmer_all'),('kh_listen'),('kh_write'),('kh_read'),
--                      ('kh_speak'),('math_general'),('ex_oral'),('ex_att'),
--                      ('ex_book'),('ex_hw'),('sem_math'),('sem_kh_reading'),
--                      ('sem_behavior_all'),('sem_eval_knowledge')) AS v(k)
--  WHERE NOT EXISTS (SELECT 1 FROM public.score_template_subjects s
--                     WHERE s.scope='system' AND s.level_key='primary'
--                       AND s.grade_number=g AND s.subject_key=v.k);
--                                                            -- expect 0 rows
--
-- -- Secondary is untouched (00026's 105 rows):
-- SELECT count(*) FROM public.score_template_subjects
--  WHERE scope='system' AND level_key IN ('lower_secondary','upper_secondary');
--
-- -- Re-running this file must not duplicate. Run twice, then re-check 312.
--
-- -- Selection policies (expect 2):
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='class_template_subjects'
--  ORDER BY policyname;
--
-- -- A subject may appear once per class:
-- --   INSERT INTO class_template_subjects (class_id, subject_key)
-- --   VALUES ('<uuid>','khmer_all'), ('<uuid>','khmer_all');
-- --   ERROR: duplicate key value violates "class_template_subjects_uniq"
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Removes only what this file added. The fourteen untagged rows, every
-- secondary row and every school/class override are matched by none of these
-- predicates, and no mark in `scores` is touched either way.
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.class_template_subjects CASCADE;
-- DELETE FROM public.score_template_subjects
--  WHERE scope = 'system' AND level_key = 'primary';
-- COMMIT;
-- =============================================================================
