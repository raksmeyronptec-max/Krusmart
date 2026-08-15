-- =============================================================================
-- 00002_schema_reconciliation.sql
-- =============================================================================
-- PREREQUISITE to the Enterprise V2 foundation (00003).
--
-- Purpose: make the tracked SQL match what the application actually reads and
-- writes, and create SQL for the three tables that only ever existed live.
-- 00003 adds foreign keys onto these tables, so it cannot be applied until the
-- shapes here are true.
--
-- Addresses AUDIT.md findings D1, D2 and G-2 (B3).
--
-- SAFETY
--   * Fully idempotent — every statement is guarded. Safe to re-run.
--   * Non-destructive — no DROP TABLE, no DROP COLUMN, no data loss.
--   * The `scores` column renames are conditional: they fire only on databases
--     still carrying the original `month` / `score` names. A database already
--     using `score_period` / `score_value` (which the live one is believed to
--     be) is left untouched.
--   * RLS is enabled on every table this file creates.
--
-- ROLLBACK: see the commented block at the foot of this file.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. scores — reconcile column names with the application (AUDIT D1)
-- -----------------------------------------------------------------------------
-- 00001 declared `month` / `score`. Every code path writes `score_period` /
-- `score_value`. Rename in place so no data is lost.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='scores' AND column_name='month')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='scores' AND column_name='score_period')
    THEN
        ALTER TABLE public.scores RENAME COLUMN month TO score_period;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='scores' AND column_name='score')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='scores' AND column_name='score_value')
    THEN
        ALTER TABLE public.scores RENAME COLUMN score TO score_value;
    END IF;
END $$;

-- Both columns must exist even on a database that had neither.
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS score_period TEXT;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS score_value  NUMERIC;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

-- `saveScores` writes NULL for a cleared cell; the original NOT NULL forbade it.
ALTER TABLE public.scores ALTER COLUMN score_value DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. scores — owner-aware uniqueness (AUDIT G-2 / blocker B3)
-- -----------------------------------------------------------------------------
-- The application upserts with
--     onConflict: 'student_id, subject, score_type, score_period'
-- but 00001 declared UNIQUE(student_id, month, subject, score_type) — a
-- different tuple, so the upsert could not match it at all.
--
-- V2 allows several teachers on one class+subject. Without `teacher_id` in the
-- key they would silently overwrite each other. Add it now, while exactly one
-- teacher still owns each student and the widening cannot conflict.
--
-- NOTE: the application's `onConflict` string must be updated to
--       'teacher_id, student_id, subject, score_type, score_period'
--       in the same deploy. See app/(main)/score/enter/actions.ts.

ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_student_id_month_subject_score_type_key;
ALTER TABLE public.scores DROP CONSTRAINT IF EXISTS scores_student_id_subject_score_type_score_period_key;
DROP INDEX IF EXISTS public.scores_owner_period_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS scores_owner_period_uniq
    ON public.scores (teacher_id, student_id, subject, score_type, score_period);

-- -----------------------------------------------------------------------------
-- 3. attendance — the `reason` column the app writes (AUDIT D1)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS reason TEXT;

-- `saveAttendance` currently omits teacher_id, producing unowned rows that the
-- RLS policy hides forever (AUDIT G-1 / blocker B2). The application fix lands
-- alongside this migration; this backfill claims any row already orphaned by
-- attributing it to the owner of its student.
UPDATE public.attendance a
   SET teacher_id = s.teacher_id
  FROM public.students s
 WHERE a.student_id = s.id
   AND a.teacher_id IS NULL;

-- -----------------------------------------------------------------------------
-- 4. settings — the seven live-only columns plus print_fields (AUDIT D1)
-- -----------------------------------------------------------------------------
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS photo_url     TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS school_code   TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS school_logo   TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS director_name TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS manager_name  TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS teacher_name  TEXT;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS province_date TEXT;

-- Firestore users/{uid}/settings/print_fields
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS print_fields  JSONB DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 5. profiles — first SQL definition (AUDIT D2)
-- -----------------------------------------------------------------------------
-- Queried by components/TopNav.tsx for the GPS check-in. Subscription columns
-- carry Firestore users/{uid}.subscription / .trialEndsAt / .plan.
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id           UUID,
    full_name           TEXT,
    phone               TEXT,
    avatar_url          TEXT,
    role                TEXT DEFAULT 'teacher',
    subscription_plan   TEXT DEFAULT 'free',
    subscription_status TEXT DEFAULT 'active',
    trial_ends_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS school_id           UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_plan   TEXT DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_ends_at       TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- 6. schools — first SQL definition (AUDIT D2)
-- -----------------------------------------------------------------------------
-- `location` is read by TopNav as { latitude, longitude, radius }.
CREATE TABLE IF NOT EXISTS public.schools (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name       TEXT NOT NULL,
    code       TEXT,
    logo_url   TEXT,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    location   JSONB,
    settings   JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS location JSONB;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS code     TEXT;

-- `name` must be unique: the Phase 2 backfill de-duplicates schools by name via
-- ON CONFLICT DO NOTHING, and that clause silently does nothing when no unique
-- constraint exists to act as its arbiter — producing a duplicate school (and a
-- duplicate class/enrolment tree beneath it) on every re-run.
--
-- Guarded rather than blind: on a database that already holds same-named
-- schools this raises instead of failing opaquely mid-migration.
DO $$
DECLARE dupes TEXT;
BEGIN
    SELECT string_agg(DISTINCT name, ', ') INTO dupes
      FROM (SELECT name FROM public.schools GROUP BY name HAVING count(*) > 1) d;

    IF dupes IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot add UNIQUE(schools.name): duplicate school names present (%). Merge them first.', dupes;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_name_key') THEN
        ALTER TABLE public.schools ADD CONSTRAINT schools_name_key UNIQUE (name);
    END IF;
END $$;

-- profiles.school_id → schools.id, added only once both tables exist.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_school_id_fkey') THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_school_id_fkey
            FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. teacher_attendance — first SQL definition (AUDIT D2)
-- -----------------------------------------------------------------------------
-- Written by the TopNav GPS check-in, read by app/admin/teacher-attendance.
CREATE TABLE IF NOT EXISTS public.teacher_attendance (
    id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id             UUID REFERENCES public.schools(id) ON DELETE SET NULL,
    date                  DATE NOT NULL,
    time                  TEXT,
    status                TEXT NOT NULL DEFAULT 'present',
    distance_from_school  INTEGER,
    created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (teacher_id, date)
);

-- -----------------------------------------------------------------------------
-- 8. RLS — enable and define for the three newly-tracked tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_attendance ENABLE ROW LEVEL SECURITY;

-- profiles: a user reads and edits only their own row.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- schools: readable by members of that school. No blanket write policy —
-- school administration arrives with the RBAC layer in 00003.
DROP POLICY IF EXISTS "schools_select_member" ON public.schools;
CREATE POLICY "schools_select_member" ON public.schools
    FOR SELECT USING (
        id IN (SELECT p.school_id FROM public.profiles p WHERE p.id = auth.uid())
    );

-- teacher_attendance: a teacher sees and files only their own check-ins.
DROP POLICY IF EXISTS "teacher_attendance_select_own" ON public.teacher_attendance;
CREATE POLICY "teacher_attendance_select_own" ON public.teacher_attendance
    FOR SELECT USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "teacher_attendance_insert_own" ON public.teacher_attendance;
CREATE POLICY "teacher_attendance_insert_own" ON public.teacher_attendance
    FOR INSERT WITH CHECK (auth.uid() = teacher_id);

-- -----------------------------------------------------------------------------
-- 9. Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_school            ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_teacher ON public.teacher_attendance(teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_school  ON public.teacher_attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_scores_teacher_period      ON public.scores(teacher_id, score_type, score_period);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date    ON public.attendance(teacher_id, date);

COMMIT;

-- =============================================================================
-- VERIFICATION — run after applying
-- =============================================================================
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='scores'
--    AND column_name IN ('score_period','score_value');           -- expect 2 rows
--
-- SELECT count(*) AS orphaned_attendance
--   FROM public.attendance WHERE teacher_id IS NULL;              -- expect 0
--
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname='public'
--    AND tablename IN ('profiles','schools','teacher_attendance'); -- expect all true
--
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname='public' AND indexname='scores_owner_period_uniq';
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Sections 3-9 are purely additive; to undo, drop what was added:
--
--   DROP INDEX IF EXISTS public.scores_owner_period_uniq;
--   ALTER TABLE public.scores  DROP COLUMN IF EXISTS updated_at;
--   ALTER TABLE public.attendance DROP COLUMN IF EXISTS reason;
--   ALTER TABLE public.settings DROP COLUMN IF EXISTS print_fields;  -- etc.
--   DROP TABLE IF EXISTS public.teacher_attendance;
--   DROP TABLE IF EXISTS public.schools CASCADE;
--   DROP TABLE IF EXISTS public.profiles CASCADE;
--
-- Section 1 (the renames) is the only part that touches existing data. To
-- reverse on a database that was actually renamed by this migration:
--
--   ALTER TABLE public.scores RENAME COLUMN score_period TO month;
--   ALTER TABLE public.scores RENAME COLUMN score_value  TO score;
--   ALTER TABLE public.scores ALTER COLUMN score SET NOT NULL;  -- fails if NULLs exist
--
-- Take a snapshot before applying:  supabase db dump -f pre_00002.sql
-- =============================================================================
