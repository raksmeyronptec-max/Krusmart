-- =============================================================================
-- 00020_teacher_profile_extended.sql
-- =============================================================================
-- The /profile rebuild adds the extended teacher record (national ID, civil-
-- servant career data, family, addresses) plus two new document assets
-- (teacher signature, director seal).
--
-- WHY A SEPARATE TABLE AND NOT MORE `settings` COLUMNS
-- ----------------------------------------------------
-- `settings` is parent-readable: 00010 added `settings_select_own_or_parent`
-- so the parent portal can print the school name and logo on the student
-- card. That policy exposes the ENTIRE row to every linked parent. The new
-- fields are sensitive PII — national ID numbers, date of birth, spouse and
-- children data — which a parent has no business reading. Putting them in
-- `settings` would silently widen that exposure, so they live in
-- `teacher_profiles`, readable and writable ONLY by the owning teacher.
--
-- The two image columns added to `settings` (`teacher_signature`,
-- `director_seal`) are deliberately NOT in the PII table: they are document
-- assets in the same class as `school_logo` — they print on the report
-- header a parent receives anyway — and future report templates (and the
-- parent portal's student card) must be able to read them. Both store data
-- URLs, the established pattern for every image in this app (see
-- `photo_url` / `school_logo`, 00002).
--
-- Children are a JSONB array (`[{ "name", "gender", "dob" }]`) rather than a
-- child table: they are only ever read and written as a unit by the profile
-- form, nothing joins on them, and a separate table would need its own RLS
-- surface for no query benefit.
--
-- All columns are nullable: the profile is filled in over time, and the row
-- is created lazily on first save (same lifecycle as `settings`).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Document assets on `settings` (parent-readable by design, like school_logo)
-- -----------------------------------------------------------------------------
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS teacher_signature TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS director_seal     TEXT;

COMMENT ON COLUMN public.settings.teacher_signature IS
    'Teacher''s handwritten signature as a data URL; printed in the report signature block.';
COMMENT ON COLUMN public.settings.director_seal IS
    'School director''s stamp/seal as a data URL; printed beside the director''s name.';

-- -----------------------------------------------------------------------------
-- 2. The extended teacher record (PII — teacher-only, no parent policy)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_profiles (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Personal identity
    date_of_birth   DATE,
    nationality     TEXT,
    ethnicity       TEXT,
    disability_type TEXT,

    -- National ID card
    id_card_type   TEXT,   -- មានសុពលភាព / អចិន្ត្រៃយ៍
    id_card_number TEXT,
    id_card_expiry DATE,

    -- Work
    specialized_subjects   JSONB DEFAULT '[]'::jsonb,  -- string[] of subject names (chips)
    grade_levels           TEXT,                        -- កម្រិតថ្នាក់បង្រៀន
    teacher_code           TEXT,                        -- លេខសម្គាល់គ្រូ
    service_start_date     DATE,                        -- ថ្ងៃចូលបម្រើការ
    teaching_type          TEXT,                        -- ប្រភេទនៃការបង្រៀន
    shift                  TEXT,                        -- វេន
    teacher_status         TEXT,                        -- ស្ថានភាពគ្រូបង្រៀន
    appointment_start_date DATE,
    appointment_end_date   DATE,

    -- Civil servant (ព័ត៌មានមន្ត្រីរាជការ)
    civil_servant_id         TEXT,  -- អត្តលេខមន្ត្រីរាជការ
    rank_position            TEXT,  -- ឋានៈ និងមុខតំណែង
    function_role            TEXT,  -- មុខងារ
    work_type                TEXT,  -- ប្រភេទការងារ
    framework_category       TEXT,  -- ក្របខណ្ឌ
    rank_class               TEXT,  -- ថ្នាក់
    rank_step                TEXT,  -- កាំ
    rank_type                TEXT,  -- ប្រភេទឋានៈ
    appointment_decree_number TEXT, -- លេខប្រកាសតែងតាំង
    appointment_decree_date  DATE,  -- កាលបរិច្ឆេទប្រកាសតែងតាំង
    salary_rank              TEXT,  -- កាំប្រាក់ និងឋានន្តរស័ក្ត

    -- Training (កម្រិតវប្បធម៌ / កម្រិតបណ្តុះបណ្តាល stay on `settings`; 00013)
    diploma TEXT,  -- សញ្ញាបត្រ

    -- Family
    marital_status   TEXT,
    spouse_name      TEXT,
    spouse_occupation TEXT,
    spouse_phone     TEXT,
    children_count   INTEGER,
    children         JSONB DEFAULT '[]'::jsonb,  -- [{ name, gender, dob }]

    -- Current residence (same denormalised Khmer strings as students.curr_*)
    res_province TEXT,
    res_district TEXT,
    res_commune  TEXT,
    res_village  TEXT,

    -- Birthplace
    birth_province TEXT,
    birth_district TEXT,
    birth_commune  TEXT,
    birth_village  TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- Owner-only, both directions. Unlike `settings` there is deliberately no
-- parent SELECT policy — see the header comment.
DROP POLICY IF EXISTS "teacher_profiles_own" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles_own" ON public.teacher_profiles
    FOR ALL
    USING (auth.uid() = teacher_id)
    WITH CHECK (auth.uid() = teacher_id);

-- 00005 granted on tables that existed then; this one is newer.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_profiles TO authenticated;
GRANT ALL ON public.teacher_profiles TO service_role;

COMMIT;

-- PostgREST caches the schema; without this the new table 404s as PGRST205.
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Fully reversible; nothing else reads these yet.
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.teacher_profiles;
--   ALTER TABLE public.settings DROP COLUMN IF EXISTS teacher_signature;
--   ALTER TABLE public.settings DROP COLUMN IF EXISTS director_seal;
--   COMMIT;
--   NOTIFY pgrst, 'reload schema';
-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- As teacher A: upsert own row succeeds; SELECT returns 1 row.
-- -- As teacher B: SELECT * FROM teacher_profiles WHERE teacher_id = <A> → 0 rows.
-- -- As a linked parent: SELECT * FROM teacher_profiles → 0 rows (no policy).
-- -- As the same parent: SELECT school_name FROM settings → still works (00010).
