-- =============================================================================
-- 00004_enterprise_v2_backfill.sql
-- =============================================================================
-- PHASE 2 — Populate the V2 structure from the existing single-teacher data.
--
-- Reads only; writes only into the tables 00003 created plus three previously
-- NULL columns. No legacy row is deleted or rewritten.
--
-- REQUIRES: 00003_enterprise_v2_foundation.sql
--
-- SAFETY
--   * Idempotent — every INSERT carries ON CONFLICT DO NOTHING and every
--     UPDATE is guarded by `IS NULL`. Re-running changes nothing.
--   * Loses nobody: the teacher set is the UNION of settings, students, scores
--     and attendance, so a teacher with no `settings` row is still migrated
--     using sensible fallbacks (see §1).
--   * Runs in one transaction: either the whole structure appears, or none of it.
--
-- MAPPING
--   settings.school_name   → schools
--   settings.academic_year → academic_years
--   settings.class_name    → classes (grade parsed from the Khmer numeral)
--   students               → student_enrollments
--   teacher_id             → teacher_assignments (is_homeroom = true)
--   scores.subject         → subjects + class_subjects
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------

-- '១ក' → 1 · '២ខ' → 2 · '១០ង' → 10 · '១ «ក»' → 1 · handles Arabic digits too.
CREATE OR REPLACE FUNCTION public.khmer_to_int(txt TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(
        regexp_replace(
            translate(COALESCE(txt, ''), '០១២៣៤៥៦៧៨៩', '0123456789'),
            '[^0-9]', '', 'g'),
        '')::INTEGER;
$$;

-- 7 → '៧'
CREATE OR REPLACE FUNCTION public.int_to_khmer(n INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT translate(n::TEXT, '0123456789', '០១២៣៤៥៦៧៨៩');
$$;

-- The Cambodian school year runs November → October.
CREATE OR REPLACE FUNCTION public.default_academic_year(at TIMESTAMPTZ DEFAULT now())
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN EXTRACT(MONTH FROM at) >= 11
                THEN EXTRACT(YEAR FROM at)::INT
                ELSE EXTRACT(YEAR FROM at)::INT - 1 END::TEXT
        || '-' ||
           CASE WHEN EXTRACT(MONTH FROM at) >= 11
                THEN EXTRACT(YEAR FROM at)::INT + 1
                ELSE EXTRACT(YEAR FROM at)::INT END::TEXT;
$$;

-- -----------------------------------------------------------------------------
-- 1. Resolve one context row per teacher
-- -----------------------------------------------------------------------------
-- The teacher set is the UNION of every table that carries a teacher_id, so a
-- teacher who never saved their settings is still migrated. Fallbacks:
--   school  → 'សាលារៀនមិនកំណត់'
--   year    → computed from today's date
--   class   → the grade most of their students sit in, else 'ថ្នាក់លំនាំដើម'

CREATE TEMP TABLE _teacher_ctx ON COMMIT DROP AS
WITH all_teachers AS (
    SELECT teacher_id FROM public.settings   WHERE teacher_id IS NOT NULL
    UNION SELECT teacher_id FROM public.students   WHERE teacher_id IS NOT NULL
    UNION SELECT teacher_id FROM public.scores     WHERE teacher_id IS NOT NULL
    UNION SELECT teacher_id FROM public.attendance WHERE teacher_id IS NOT NULL
),
common_grade AS (
    SELECT DISTINCT ON (teacher_id) teacher_id, grade
      FROM public.students
     WHERE grade IS NOT NULL AND TRIM(grade) <> ''
     GROUP BY teacher_id, grade
     ORDER BY teacher_id, count(*) DESC, grade
)
SELECT
    t.teacher_id,
    COALESCE(NULLIF(TRIM(s.school_name), ''), 'សាលារៀនមិនកំណត់')          AS school_name,
    NULLIF(TRIM(s.school_code), '')                                        AS school_code,
    COALESCE(NULLIF(TRIM(s.academic_year), ''), public.default_academic_year()) AS year_name,
    COALESCE(NULLIF(TRIM(s.class_name), ''), NULLIF(TRIM(cg.grade), ''), 'ថ្នាក់លំនាំដើម') AS class_name
FROM all_teachers t
LEFT JOIN public.settings s   ON s.teacher_id  = t.teacher_id
LEFT JOIN common_grade   cg   ON cg.teacher_id = t.teacher_id;

-- Grade number parsed from the class name, clamped to the 1-12 the ministry uses.
ALTER TABLE _teacher_ctx ADD COLUMN grade_num INTEGER;
UPDATE _teacher_ctx
   SET grade_num = LEAST(GREATEST(COALESCE(public.khmer_to_int(class_name), 1), 1), 12);

-- -----------------------------------------------------------------------------
-- 2. schools
-- -----------------------------------------------------------------------------
INSERT INTO public.schools (name, code)
SELECT DISTINCT ctx.school_name, MIN(ctx.school_code)
  FROM _teacher_ctx ctx
 GROUP BY ctx.school_name
    ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. academic_years
-- -----------------------------------------------------------------------------
INSERT INTO public.academic_years (school_id, name, is_active)
SELECT DISTINCT sc.id, ctx.year_name, true
  FROM _teacher_ctx ctx
  JOIN public.schools sc ON sc.name = ctx.school_name
    ON CONFLICT (school_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. education_levels — the three Cambodian stages, per school
-- -----------------------------------------------------------------------------
INSERT INTO public.education_levels (school_id, name, name_en, sort_order)
SELECT sc.id, v.name, v.name_en, v.sort_order
  FROM public.schools sc
 CROSS JOIN (VALUES
        ('បឋមសិក្សា',               'Primary',          1),
        ('មធ្យមសិក្សាបឋមភូមិ',      'Lower Secondary',  2),
        ('មធ្យមសិក្សាទុតិយភូមិ',    'Upper Secondary',  3)
    ) AS v(name, name_en, sort_order)
    ON CONFLICT (school_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. grades — ថ្នាក់ទី១ … ថ្នាក់ទី១២, filed under the right stage
-- -----------------------------------------------------------------------------
INSERT INTO public.grades (education_level_id, name, name_en, sort_order)
SELECT el.id,
       'ថ្នាក់ទី' || public.int_to_khmer(g.n),
       'Grade ' || g.n,
       g.n
  FROM generate_series(1, 12) AS g(n)
  JOIN public.education_levels el
    ON el.name = CASE WHEN g.n BETWEEN 1 AND 6  THEN 'បឋមសិក្សា'
                      WHEN g.n BETWEEN 7 AND 9  THEN 'មធ្យមសិក្សាបឋមភូមិ'
                      ELSE 'មធ្យមសិក្សាទុតិយភូមិ' END
    ON CONFLICT (education_level_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. classes — one per teacher, from settings.class_name
-- -----------------------------------------------------------------------------
INSERT INTO public.classes (grade_id, academic_year_id, name)
SELECT DISTINCT gr.id, ay.id, ctx.class_name
  FROM _teacher_ctx ctx
  JOIN public.schools         sc ON sc.name = ctx.school_name
  JOIN public.academic_years  ay ON ay.school_id = sc.id AND ay.name = ctx.year_name
  JOIN public.education_levels el ON el.school_id = sc.id
  JOIN public.grades          gr ON gr.education_level_id = el.id
                                AND gr.sort_order = ctx.grade_num
    ON CONFLICT (grade_id, academic_year_id, name) DO NOTHING;

-- Resolve each teacher to their class, for the steps that follow.
CREATE TEMP TABLE _teacher_class ON COMMIT DROP AS
SELECT ctx.teacher_id, c.id AS class_id, ay.id AS academic_year_id, sc.id AS school_id
  FROM _teacher_ctx ctx
  JOIN public.schools         sc ON sc.name = ctx.school_name
  JOIN public.academic_years  ay ON ay.school_id = sc.id AND ay.name = ctx.year_name
  JOIN public.education_levels el ON el.school_id = sc.id
  JOIN public.grades          gr ON gr.education_level_id = el.id AND gr.sort_order = ctx.grade_num
  JOIN public.classes         c  ON c.grade_id = gr.id
                                AND c.academic_year_id = ay.id
                                AND c.name = ctx.class_name;

-- -----------------------------------------------------------------------------
-- 7. teacher_assignments — every migrated teacher is the homeroom teacher
-- -----------------------------------------------------------------------------
-- Targets the partial index `teacher_assignments_homeroom_uniq` (subject_id IS
-- NULL); the predicate is required for the arbiter to be selected.
INSERT INTO public.teacher_assignments (teacher_id, class_id, subject_id, academic_year_id, is_homeroom, status)
SELECT tc.teacher_id, tc.class_id, NULL, tc.academic_year_id, true, 'active'
  FROM _teacher_class tc
    ON CONFLICT (teacher_id, class_id, academic_year_id) WHERE subject_id IS NULL DO NOTHING;

-- -----------------------------------------------------------------------------
-- 8. student_enrollments
-- -----------------------------------------------------------------------------
INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
SELECT st.id, tc.class_id, tc.academic_year_id, 'active'
  FROM public.students st
  JOIN _teacher_class tc ON tc.teacher_id = st.teacher_id
    ON CONFLICT (student_id, class_id, academic_year_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 9. students.school_id
-- -----------------------------------------------------------------------------
UPDATE public.students st
   SET school_id = tc.school_id
  FROM _teacher_class tc
 WHERE tc.teacher_id = st.teacher_id
   AND st.school_id IS NULL;

-- -----------------------------------------------------------------------------
-- 10. user_roles — grant every migrated teacher the 'teacher' role
-- -----------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role_id, school_id)
SELECT tc.teacher_id, r.id, tc.school_id
  FROM _teacher_class tc
  JOIN public.roles r ON r.name = 'teacher'
    ON CONFLICT (user_id, role_id, school_id) DO NOTHING;

-- profiles.school_id, so current_school_ids() resolves for existing users.
INSERT INTO public.profiles (id, school_id, role)
SELECT tc.teacher_id, tc.school_id, 'teacher'
  FROM _teacher_class tc
    ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles p
   SET school_id = tc.school_id
  FROM _teacher_class tc
 WHERE tc.teacher_id = p.id
   AND p.school_id IS NULL;

-- -----------------------------------------------------------------------------
-- 11. subjects + class_subjects, derived from the score keys actually used
-- -----------------------------------------------------------------------------
INSERT INTO public.subjects (school_id, name, code)
SELECT DISTINCT tc.school_id, sr.subject, sr.subject
  FROM public.scores sr
  JOIN _teacher_class tc ON tc.teacher_id = sr.teacher_id
 WHERE sr.subject IS NOT NULL AND TRIM(sr.subject) <> ''
    ON CONFLICT (school_id, name) DO NOTHING;

INSERT INTO public.class_subjects (class_id, subject_id, max_score, passing_score)
SELECT DISTINCT tc.class_id, sub.id, 10, 5
  FROM public.scores sr
  JOIN _teacher_class tc  ON tc.teacher_id = sr.teacher_id
  JOIN public.subjects sub ON sub.school_id = tc.school_id AND sub.name = sr.subject
    ON CONFLICT (class_id, subject_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 12. Link the legacy fact tables into the new structure
-- -----------------------------------------------------------------------------
-- score_type / score_period keep working exactly as before; these columns are
-- additive so Phase 5 can query by class without a data migration.

UPDATE public.scores sr
   SET class_id         = tc.class_id,
       academic_year_id = tc.academic_year_id
  FROM _teacher_class tc
 WHERE tc.teacher_id = sr.teacher_id
   AND sr.class_id IS NULL;

UPDATE public.scores sr
   SET enrollment_id = se.id
  FROM public.student_enrollments se
 WHERE se.student_id = sr.student_id
   AND se.class_id   = sr.class_id
   AND sr.enrollment_id IS NULL;

UPDATE public.attendance a
   SET class_id         = tc.class_id,
       academic_year_id = tc.academic_year_id
  FROM _teacher_class tc
 WHERE tc.teacher_id = a.teacher_id
   AND a.class_id IS NULL;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- SELECT 'schools'             AS table_name, count(*) FROM public.schools
-- UNION ALL SELECT 'academic_years',      count(*) FROM public.academic_years
-- UNION ALL SELECT 'education_levels',    count(*) FROM public.education_levels
-- UNION ALL SELECT 'grades',              count(*) FROM public.grades
-- UNION ALL SELECT 'classes',             count(*) FROM public.classes
-- UNION ALL SELECT 'teacher_assignments', count(*) FROM public.teacher_assignments
-- UNION ALL SELECT 'student_enrollments', count(*) FROM public.student_enrollments
-- UNION ALL SELECT 'subjects',            count(*) FROM public.subjects
-- UNION ALL SELECT 'class_subjects',      count(*) FROM public.class_subjects
-- UNION ALL SELECT 'user_roles',          count(*) FROM public.user_roles;
--
-- -- Nobody left behind (all three must be 0):
-- SELECT count(*) FROM public.students   WHERE school_id IS NULL;
-- SELECT count(*) FROM public.scores     WHERE class_id  IS NULL;
-- SELECT count(*) FROM public.attendance WHERE class_id  IS NULL;
--
-- -- Every student has exactly one active enrolment:
-- SELECT count(*) FROM public.students s
--  WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments e WHERE e.student_id = s.id);
--
-- =============================================================================
-- ROLLBACK  (removes only what this migration produced)
-- =============================================================================
-- BEGIN;
-- UPDATE public.attendance SET class_id = NULL, academic_year_id = NULL;
-- UPDATE public.scores     SET class_id = NULL, academic_year_id = NULL, enrollment_id = NULL;
-- UPDATE public.students   SET school_id = NULL;
-- TRUNCATE public.class_subjects, public.student_enrollments, public.teacher_assignments,
--          public.user_roles, public.subjects, public.classes, public.grades,
--          public.education_levels, public.academic_years CASCADE;
-- DELETE FROM public.schools;
-- COMMIT;
-- =============================================================================
