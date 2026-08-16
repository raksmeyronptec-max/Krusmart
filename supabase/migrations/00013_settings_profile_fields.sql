-- =============================================================================
-- 00013_settings_profile_fields.sql
-- =============================================================================
-- Restore the teacher-profile fields lost in the migration from the legacy
-- build, and repair the column split that made five existing fields unwritable.
--
-- Two independent changes, both additive:
--
--   1. Nine new `settings` columns — the profile fields `/profile` dropped.
--   2. A backfill that connects the columns 00002 added to the values the old
--      profile form already wrote.
--
-- Nothing is dropped and no column changes type. Rollback is at the foot.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The nine missing profile columns
-- -----------------------------------------------------------------------------
-- The legacy `profile/index.html` persisted twenty fields. Ten never made it
-- into the Supabase build; `school_code` was recovered by 00002, leaving these
-- nine with nowhere to be stored.
--
-- Fields 8-10 (education, training, seniority) and 7 (gender) are the teacher's
-- own MoEYS personnel record. Fields 15-17 are the administrative location of
-- the *school*, which is a different thing from `students.curr_*` — those
-- describe where a pupil lives.
--
-- All nullable TEXT: every one is optional on the form, and `seniority_years`
-- is TEXT rather than INT on purpose — the legacy field accepted free text
-- ("១២ឆ្នាំ", "៥+"), and narrowing it would reject data teachers already have.

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS phone           TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS gender          TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS education_level TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS training_level  TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS seniority_years TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS principal_phone TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS admin_province  TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS admin_district  TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS admin_commune   TEXT;

COMMENT ON COLUMN public.settings.phone           IS 'Teacher''s own contact number.';
COMMENT ON COLUMN public.settings.gender          IS 'Teacher''s gender — ប្រុស / ស្រី.';
COMMENT ON COLUMN public.settings.education_level IS 'កម្រិតវប្បធម៌ — e.g. បរិញ្ញាប័ត្រ.';
COMMENT ON COLUMN public.settings.training_level  IS 'កម្រិតបណ្តុះបណ្តាល — e.g. ១២+៤.';
COMMENT ON COLUMN public.settings.seniority_years IS 'អតីតភាពឆ្នាំ. TEXT: the legacy field accepted free text.';
COMMENT ON COLUMN public.settings.principal_phone IS 'School principal''s contact number, printed on the record book.';
COMMENT ON COLUMN public.settings.admin_province  IS 'Administrative province of the SCHOOL, not of a student.';
COMMENT ON COLUMN public.settings.admin_district  IS 'Administrative district of the school.';
COMMENT ON COLUMN public.settings.admin_commune   IS 'Administrative commune of the school.';

-- -----------------------------------------------------------------------------
-- 2. Reconnect the columns 00002 added
-- -----------------------------------------------------------------------------
-- THE DEFECT
-- Migration 00002 added seven columns that exist in the live database:
-- photo_url, school_code, school_logo, director_name, manager_name,
-- teacher_name, province_date. The application reads five of them on printed
-- documents — 22 read sites across 12 routes — but NOTHING in the codebase
-- writes them. Verified:
--
--     grep -rn 'teacher_name:|director_name:|manager_name:|province_date:|school_code:'
--     -> no matches
--
-- So every certificate, ranking sheet, honour roll, parent report, ID card and
-- student list prints its signature block as placeholder dots.
--
-- The cause is a name split. Two pairs of columns hold one concept each, and
-- the two halves are read by different routes:
--
--   teacher_name   <- the signing teacher.   /ranking /honor-roll /print-list
--                     /parent-report /student-tracking read this;
--   homeroom_teacher  ...while /record-book /attendance/monthly /class-admin
--                     /score/print /inventory /print-student-age read this,
--                     and the profile form only ever wrote this one.
--
--   province_date  <- the province on the "ធ្វើនៅ ___" date line.
--                     Six routes read it;
--   province_for_date  ...the profile form wrote this, which nothing reads.
--
-- No file reads both halves of either pair, which confirms they are one concept
-- rather than two — verified by scanning every file that mentions either name.
--
-- THE FIX, IN TWO PARTS
-- Here: backfill, so a teacher who filled the old form does not have to retype
-- anything and their next printout is correct immediately.
-- In the application: `/profile` now writes both halves of each pair from a
-- single input, so the two cannot drift apart again.
--
-- COALESCE-guarded so this is idempotent and never overwrites a value that has
-- somehow already been set.

UPDATE public.settings
   SET province_date = COALESCE(NULLIF(province_date, ''), province_for_date)
 WHERE COALESCE(province_date, '') = ''
   AND COALESCE(province_for_date, '') <> '';

UPDATE public.settings
   SET teacher_name = COALESCE(NULLIF(teacher_name, ''), homeroom_teacher)
 WHERE COALESCE(teacher_name, '') = ''
   AND COALESCE(homeroom_teacher, '') <> '';

-- `director_name` and `manager_name` are likewise one concept — the principal's
-- name — read by four and five routes respectively. There is nothing to backfill
-- from: the legacy profile form had no such field (it carried `manager_role`,
-- the job title, which is a different thing and is already editable). Both are
-- therefore left NULL here and the rebuilt profile form writes both from one
-- input. Where one is already set, mirror it to the other.

UPDATE public.settings
   SET manager_name = director_name
 WHERE COALESCE(manager_name, '') = ''
   AND COALESCE(director_name, '') <> '';

UPDATE public.settings
   SET director_name = manager_name
 WHERE COALESCE(director_name, '') = ''
   AND COALESCE(manager_name, '') <> '';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- All nine columns present:
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='settings'
--    AND column_name IN ('phone','gender','education_level','training_level',
--                        'seniority_years','principal_phone','admin_province',
--                        'admin_district','admin_commune')
--  ORDER BY column_name;   -- expect 9 rows, all text
--
-- -- No row left with a source value but an empty target:
-- SELECT count(*) FROM public.settings
--  WHERE (COALESCE(province_for_date,'') <> '' AND COALESCE(province_date,'') = '')
--     OR (COALESCE(homeroom_teacher,'')  <> '' AND COALESCE(teacher_name,'')  = '');
-- -- expect 0
--
-- -- RLS unchanged: settings keeps the four auth.uid() = teacher_id policies
-- -- from 00001. Adding a column does not alter a policy, and no policy in this
-- -- file is created, dropped or replaced.
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='settings';   -- expect the original 4
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- The backfill is not reversible — it writes into columns that were empty, and
-- there is no record of which rows it touched. It is also harmless to keep:
-- every value it wrote was copied from another column on the same row.
--
-- BEGIN;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS admin_commune;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS admin_district;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS admin_province;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS principal_phone;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS seniority_years;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS training_level;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS education_level;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS gender;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS phone;
-- COMMIT;
-- =============================================================================
