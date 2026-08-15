-- =============================================================================
-- 00003_enterprise_v2_foundation.sql
-- =============================================================================
-- PHASE 1 — Non-destructive Enterprise V2 foundation.
--
-- Introduces the organisation, academic-structure, teaching, enrolment, RBAC,
-- grading and operations layers. Existing single-teacher tables keep working
-- untouched: every column added to them is NULLable, and nothing is dropped.
--
-- REQUIRES: 00002_schema_reconciliation.sql (creates public.schools and
--           public.profiles, which this file references).
--
-- SAFETY
--   * No DROP TABLE, no DROP COLUMN, no destructive ALTER.
--   * Every new column on an existing table is NULLable — the current app keeps
--     running with them empty until Phase 2 backfills and Phase 5 reads them.
--   * RLS is enabled on all 17 new tables before any policy is defined.
--   * Idempotent: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS throughout.
--
-- ROLLBACK: see the foot of this file.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. RBAC LAYER  (must precede the helper functions below)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    display_name TEXT,
    sort_order   INTEGER DEFAULT 0
);

INSERT INTO public.roles (name, display_name, sort_order) VALUES
    ('owner',        'ម្ចាស់',          1),
    ('principal',    'នាយក',            2),
    ('school_admin', 'អ្នកគ្រប់គ្រង',    3),
    ('teacher',      'គ្រូបង្រៀន',       4),
    ('staff',        'បុគ្គលិក',         5),
    ('parent',       'មាតាបិតា',        6),
    ('student',      'សិស្ស',           7)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.permissions (
    id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    role_id  UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    resource TEXT NOT NULL,
    action   TEXT NOT NULL,
    UNIQUE (role_id, resource, action)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    school_id  UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (user_id, role_id, school_id)
);

-- =============================================================================
-- 2. AUTHORISATION HELPERS
-- =============================================================================
-- Defined after the RBAC tables: PostgreSQL validates `LANGUAGE sql` bodies
-- at CREATE time, so these cannot be declared before roles/user_roles exist.
--
-- RLS policies that read other tables recurse if written inline. These
-- SECURITY DEFINER helpers break the cycle and keep the policies legible.
-- `search_path` is pinned so the definer's rights cannot be redirected.

CREATE OR REPLACE FUNCTION public.current_school_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT ur.school_id FROM public.user_roles ur
     WHERE ur.user_id = auth.uid() AND ur.school_id IS NOT NULL
    UNION
    SELECT p.school_id FROM public.profiles p
     WHERE p.id = auth.uid() AND p.school_id IS NOT NULL;
$$;

COMMENT ON FUNCTION public.current_school_ids() IS
    'Schools the calling user belongs to, via user_roles or their profile.';

CREATE OR REPLACE FUNCTION public.has_school_role(target_school UUID, role_names TEXT[])
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = auth.uid()
           AND r.name = ANY(role_names)
           AND (ur.school_id = target_school OR ur.school_id IS NULL)
    );
$$;

COMMENT ON FUNCTION public.has_school_role(UUID, TEXT[]) IS
    'True when the caller holds any of role_names in target_school. A NULL
     school_id on the assignment denotes a global (platform owner) grant.';

CREATE OR REPLACE FUNCTION public.is_school_admin(target_school UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT public.has_school_role(target_school, ARRAY['owner','principal','school_admin']);
$$;


-- =============================================================================
-- 3. ORGANISATION LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.academic_years (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,                       -- '2025-2026'
    start_date DATE,
    end_date   DATE,
    is_active  BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (school_id, name)
);

-- =============================================================================
-- 4. ACADEMIC STRUCTURE LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.education_levels (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,                       -- 'បឋមសិក្សា'
    name_en    TEXT,
    sort_order INTEGER DEFAULT 0,
    UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.grades (
    id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    education_level_id UUID NOT NULL REFERENCES public.education_levels(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,               -- 'ថ្នាក់ទី១'
    name_en            TEXT,
    sort_order         INTEGER DEFAULT 0,
    UNIQUE (education_level_id, name)
);

CREATE TABLE IF NOT EXISTS public.classes (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    grade_id         UUID NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,                 -- '១ក'
    capacity         INTEGER,
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (grade_id, academic_year_id, name)
);

CREATE TABLE IF NOT EXISTS public.subjects (
    id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,                        -- 'គណិតវិទ្យា'
    name_en   TEXT,
    code      TEXT,
    is_active BOOLEAN DEFAULT true,
    UNIQUE (school_id, name)
);

-- Per-class subject configuration (Firestore subjects/{id}.max_score / passing_score)
CREATE TABLE IF NOT EXISTS public.class_subjects (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id      UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id    UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    max_score     NUMERIC DEFAULT 100,
    passing_score NUMERIC DEFAULT 50,
    is_active     BOOLEAN DEFAULT true,
    UNIQUE (class_id, subject_id)
);

-- =============================================================================
-- 5. TEACHING LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.teacher_assignments (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    teacher_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id         UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id       UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    is_homeroom      BOOLEAN DEFAULT false,
    status           TEXT DEFAULT 'active',
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Uniqueness is split in two because `subject_id` is NULLable and, under SQL
-- semantics, NULL <> NULL — a plain UNIQUE(teacher_id, class_id, subject_id,
-- academic_year_id) therefore lets an unlimited number of identical homeroom
-- rows (subject_id IS NULL) coexist, and any ON CONFLICT against it never fires.
ALTER TABLE public.teacher_assignments
    DROP CONSTRAINT IF EXISTS teacher_assignments_teacher_id_class_id_subject_id_academic_key;

-- subject-specific assignments
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_subject_uniq
    ON public.teacher_assignments (teacher_id, class_id, subject_id, academic_year_id)
    WHERE subject_id IS NOT NULL;

-- homeroom (subject-less) assignments: one per teacher, class and year
CREATE UNIQUE INDEX IF NOT EXISTS teacher_assignments_homeroom_uniq
    ON public.teacher_assignments (teacher_id, class_id, academic_year_id)
    WHERE subject_id IS NULL;

-- =============================================================================
-- 6. STUDENT LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.student_enrollments (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id         UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    status           TEXT DEFAULT 'active',    -- active | promoted | transferred | withdrawn
    enrolled_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    left_at          TIMESTAMPTZ,
    UNIQUE (student_id, class_id, academic_year_id)
);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_school_id_fkey') THEN
        ALTER TABLE public.students
            ADD CONSTRAINT students_school_id_fkey
            FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =============================================================================
-- 7. GRADING & ASSESSMENT LAYER
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.grading_schemes (
    id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    education_level_id UUID REFERENCES public.education_levels(id) ON DELETE SET NULL,
    name               TEXT NOT NULL,
    config             JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_default         BOOLEAN DEFAULT false,
    created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.assessments (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_subject_id UUID NOT NULL REFERENCES public.class_subjects(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL,          -- assignment|quiz|midterm|final|project|monthly|semester|yearly
    max_score        NUMERIC NOT NULL DEFAULT 100,
    weight           NUMERIC DEFAULT 1.0,
    term             TEXT,
    date             DATE,
    status           TEXT DEFAULT 'active',
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_cards (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    enrollment_id    UUID NOT NULL REFERENCES public.student_enrollments(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    term             TEXT,
    data             JSONB DEFAULT '{}'::jsonb,
    status           TEXT DEFAULT 'draft',   -- draft | published | approved
    created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Link the existing scores table into the new structure. All NULLable:
-- the legacy score_type/score_period discrimination keeps working untouched.
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS enrollment_id    UUID REFERENCES public.student_enrollments(id) ON DELETE SET NULL;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS assessment_id    UUID REFERENCES public.assessments(id)         ON DELETE SET NULL;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS class_id         UUID REFERENCES public.classes(id)             ON DELETE SET NULL;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id)      ON DELETE SET NULL;

-- =============================================================================
-- 8. OPERATIONS LAYER
-- =============================================================================

ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS class_id         UUID REFERENCES public.classes(id)        ON DELETE SET NULL;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL;

-- Firestore attendance/{date}.locked_dates
CREATE TABLE IF NOT EXISTS public.attendance_locks (
    id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id  UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    date      DATE NOT NULL,
    locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (class_id, date)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id   UUID REFERENCES public.schools(id) ON DELETE SET NULL,
    actor_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT,
    old_value   JSONB,
    new_value   JSONB,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcements (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT,
    audience   TEXT DEFAULT 'all',            -- all | teachers | parents | students
    status     TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Firestore premium_requests + premium_request_meta
CREATE TABLE IF NOT EXISTS public.premium_requests (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan         TEXT NOT NULL,
    status       TEXT DEFAULT 'pending',      -- pending | approved | rejected
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata     JSONB DEFAULT '{}'::jsonb,
    notes        TEXT
);

-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_levels    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_schemes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_locks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_requests    ENABLE ROW LEVEL SECURITY;

-- --- reference data: readable by any signed-in user, writable by nobody ------
DROP POLICY IF EXISTS "roles_select_all" ON public.roles;
CREATE POLICY "roles_select_all" ON public.roles
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "permissions_select_all" ON public.permissions;
CREATE POLICY "permissions_select_all" ON public.permissions
    FOR SELECT TO authenticated USING (true);

-- --- user_roles --------------------------------------------------------------
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
    FOR SELECT USING (user_id = auth.uid() OR public.is_school_admin(school_id));

DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;
CREATE POLICY "user_roles_admin_write" ON public.user_roles
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

-- --- school-scoped structure: members read, admins write ---------------------
DROP POLICY IF EXISTS "academic_years_select_member" ON public.academic_years;
CREATE POLICY "academic_years_select_member" ON public.academic_years
    FOR SELECT USING (school_id IN (SELECT public.current_school_ids()));

DROP POLICY IF EXISTS "academic_years_admin_write" ON public.academic_years;
CREATE POLICY "academic_years_admin_write" ON public.academic_years
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "education_levels_select_member" ON public.education_levels;
CREATE POLICY "education_levels_select_member" ON public.education_levels
    FOR SELECT USING (school_id IN (SELECT public.current_school_ids()));

DROP POLICY IF EXISTS "education_levels_admin_write" ON public.education_levels;
CREATE POLICY "education_levels_admin_write" ON public.education_levels
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "grades_select_member" ON public.grades;
CREATE POLICY "grades_select_member" ON public.grades
    FOR SELECT USING (
        education_level_id IN (
            SELECT el.id FROM public.education_levels el
             WHERE el.school_id IN (SELECT public.current_school_ids())
        )
    );

DROP POLICY IF EXISTS "grades_admin_write" ON public.grades;
CREATE POLICY "grades_admin_write" ON public.grades
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.education_levels el
                 WHERE el.id = grades.education_level_id
                   AND public.is_school_admin(el.school_id))
    );

DROP POLICY IF EXISTS "subjects_select_member" ON public.subjects;
CREATE POLICY "subjects_select_member" ON public.subjects
    FOR SELECT USING (school_id IN (SELECT public.current_school_ids()));

DROP POLICY IF EXISTS "subjects_admin_write" ON public.subjects;
CREATE POLICY "subjects_admin_write" ON public.subjects
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

-- --- classes: assigned teachers read; school admins do everything ------------
DROP POLICY IF EXISTS "classes_select_assigned_or_admin" ON public.classes;
CREATE POLICY "classes_select_assigned_or_admin" ON public.classes
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = classes.id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = classes.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "classes_admin_write" ON public.classes;
CREATE POLICY "classes_admin_write" ON public.classes
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.academic_years ay
                 WHERE ay.id = classes.academic_year_id
                   AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "class_subjects_select_visible" ON public.class_subjects;
CREATE POLICY "class_subjects_select_visible" ON public.class_subjects
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = class_subjects.class_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c
                     JOIN public.academic_years ay ON ay.id = c.academic_year_id
                    WHERE c.id = class_subjects.class_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "class_subjects_admin_write" ON public.class_subjects;
CREATE POLICY "class_subjects_admin_write" ON public.class_subjects
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = class_subjects.class_id
                   AND public.is_school_admin(ay.school_id))
    );

-- --- teacher_assignments -----------------------------------------------------
DROP POLICY IF EXISTS "teacher_assignments_select_own_or_admin" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_select_own_or_admin" ON public.teacher_assignments
    FOR SELECT USING (
        teacher_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = teacher_assignments.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "teacher_assignments_admin_write" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_admin_write" ON public.teacher_assignments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.academic_years ay
                 WHERE ay.id = teacher_assignments.academic_year_id
                   AND public.is_school_admin(ay.school_id))
    );

-- --- student_enrollments -----------------------------------------------------
DROP POLICY IF EXISTS "student_enrollments_select_assigned_or_admin" ON public.student_enrollments;
CREATE POLICY "student_enrollments_select_assigned_or_admin" ON public.student_enrollments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = student_enrollments.class_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = student_enrollments.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "student_enrollments_write_assigned_or_admin" ON public.student_enrollments;
CREATE POLICY "student_enrollments_write_assigned_or_admin" ON public.student_enrollments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = student_enrollments.class_id
                   AND ta.teacher_id = auth.uid() AND ta.is_homeroom)
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = student_enrollments.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

-- --- grading / assessment ----------------------------------------------------
DROP POLICY IF EXISTS "grading_schemes_select_member" ON public.grading_schemes;
CREATE POLICY "grading_schemes_select_member" ON public.grading_schemes
    FOR SELECT USING (school_id IN (SELECT public.current_school_ids()));

DROP POLICY IF EXISTS "grading_schemes_admin_write" ON public.grading_schemes;
CREATE POLICY "grading_schemes_admin_write" ON public.grading_schemes
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "assessments_select_assigned_or_admin" ON public.assessments;
CREATE POLICY "assessments_select_assigned_or_admin" ON public.assessments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.class_subjects cs
                  JOIN public.teacher_assignments ta ON ta.class_id = cs.class_id
                 WHERE cs.id = assessments.class_subject_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = assessments.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "assessments_write_assigned_or_admin" ON public.assessments;
CREATE POLICY "assessments_write_assigned_or_admin" ON public.assessments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.class_subjects cs
                  JOIN public.teacher_assignments ta ON ta.class_id = cs.class_id
                 WHERE cs.id = assessments.class_subject_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = assessments.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "report_cards_select_assigned_or_admin" ON public.report_cards;
CREATE POLICY "report_cards_select_assigned_or_admin" ON public.report_cards
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.student_enrollments se
                  JOIN public.teacher_assignments ta ON ta.class_id = se.class_id
                 WHERE se.id = report_cards.enrollment_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = report_cards.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "report_cards_write_assigned_or_admin" ON public.report_cards;
CREATE POLICY "report_cards_write_assigned_or_admin" ON public.report_cards
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.student_enrollments se
                  JOIN public.teacher_assignments ta ON ta.class_id = se.class_id
                 WHERE se.id = report_cards.enrollment_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.academic_years ay
                    WHERE ay.id = report_cards.academic_year_id
                      AND public.is_school_admin(ay.school_id))
    );

-- --- operations --------------------------------------------------------------
DROP POLICY IF EXISTS "attendance_locks_select_assigned" ON public.attendance_locks;
CREATE POLICY "attendance_locks_select_assigned" ON public.attendance_locks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = attendance_locks.class_id AND ta.teacher_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.classes c
                     JOIN public.academic_years ay ON ay.id = c.academic_year_id
                    WHERE c.id = attendance_locks.class_id
                      AND public.is_school_admin(ay.school_id))
    );

DROP POLICY IF EXISTS "attendance_locks_admin_write" ON public.attendance_locks;
CREATE POLICY "attendance_locks_admin_write" ON public.attendance_locks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.classes c
                  JOIN public.academic_years ay ON ay.id = c.academic_year_id
                 WHERE c.id = attendance_locks.class_id
                   AND public.is_school_admin(ay.school_id))
    );

-- audit_logs: append-only. Actors insert; only admins read. No UPDATE/DELETE
-- policy exists, so the trail is immutable through PostgREST.
DROP POLICY IF EXISTS "audit_logs_insert_self" ON public.audit_logs;
CREATE POLICY "audit_logs_insert_self" ON public.audit_logs
    FOR INSERT WITH CHECK (actor_id = auth.uid());

DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
    FOR SELECT USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "announcements_select_member" ON public.announcements;
CREATE POLICY "announcements_select_member" ON public.announcements
    FOR SELECT USING (school_id IN (SELECT public.current_school_ids()));

DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
CREATE POLICY "announcements_admin_write" ON public.announcements
    FOR ALL USING (public.is_school_admin(school_id))
            WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS "premium_requests_select_own" ON public.premium_requests;
CREATE POLICY "premium_requests_select_own" ON public.premium_requests
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "premium_requests_insert_own" ON public.premium_requests;
CREATE POLICY "premium_requests_insert_own" ON public.premium_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 10. INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_teacher  ON public.teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_class    ON public.teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_assignments_year     ON public.teacher_assignments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_student  ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_class    ON public.student_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_student_enrollments_year     ON public.student_enrollments(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user              ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school            ON public.user_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_school            ON public.audit_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor             ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_classes_academic_year        ON public.classes(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_classes_grade                ON public.classes(grade_id);
CREATE INDEX IF NOT EXISTS idx_scores_class                 ON public.scores(class_id);
CREATE INDEX IF NOT EXISTS idx_scores_academic_year         ON public.scores(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_scores_enrollment            ON public.scores(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class             ON public.attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_academic_year     ON public.attendance(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_academic_years_school        ON public.academic_years(school_id);
CREATE INDEX IF NOT EXISTS idx_education_levels_school      ON public.education_levels(school_id);
CREATE INDEX IF NOT EXISTS idx_grades_level                 ON public.grades(education_level_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school              ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class         ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject       ON public.class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_assessments_class_subject    ON public.assessments(class_subject_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_enrollment      ON public.report_cards(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_students_school              ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_announcements_school         ON public.announcements(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_premium_requests_user        ON public.premium_requests(user_id);

COMMIT;

-- =============================================================================
-- VERIFICATION — run after applying
-- =============================================================================
-- -- 17 new tables, RLS on every one:
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname='public' AND tablename IN (
--    'roles','permissions','user_roles','academic_years','education_levels',
--    'grades','classes','subjects','class_subjects','teacher_assignments',
--    'student_enrollments','grading_schemes','assessments','report_cards',
--    'attendance_locks','audit_logs','announcements','premium_requests')
--  ORDER BY tablename;                       -- expect rowsecurity = true for all
--
-- -- roles seeded:
-- SELECT name, display_name FROM public.roles ORDER BY sort_order;   -- expect 7
--
-- -- every existing row still present and untouched:
-- SELECT 'students' t, count(*) FROM public.students
-- UNION ALL SELECT 'scores', count(*) FROM public.scores
-- UNION ALL SELECT 'attendance', count(*) FROM public.attendance
-- UNION ALL SELECT 'settings', count(*) FROM public.settings;
--
-- -- new columns are present and empty (backfill is Phase 2):
-- SELECT count(*) FROM public.scores WHERE class_id IS NOT NULL;      -- expect 0
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Entirely additive. To undo:
--
-- BEGIN;
-- ALTER TABLE public.scores     DROP COLUMN IF EXISTS enrollment_id,
--                               DROP COLUMN IF EXISTS assessment_id,
--                               DROP COLUMN IF EXISTS class_id,
--                               DROP COLUMN IF EXISTS academic_year_id;
-- ALTER TABLE public.attendance DROP COLUMN IF EXISTS class_id,
--                               DROP COLUMN IF EXISTS academic_year_id;
-- ALTER TABLE public.students   DROP CONSTRAINT IF EXISTS students_school_id_fkey;
-- ALTER TABLE public.students   DROP COLUMN IF EXISTS school_id;
-- DROP TABLE IF EXISTS public.premium_requests, public.announcements,
--      public.audit_logs, public.attendance_locks, public.report_cards,
--      public.assessments, public.grading_schemes, public.student_enrollments,
--      public.teacher_assignments, public.class_subjects, public.subjects,
--      public.classes, public.grades, public.education_levels,
--      public.academic_years, public.user_roles, public.permissions,
--      public.roles CASCADE;
-- DROP FUNCTION IF EXISTS public.is_school_admin(UUID);
-- DROP FUNCTION IF EXISTS public.has_school_role(UUID, TEXT[]);
-- DROP FUNCTION IF EXISTS public.current_school_ids();
-- COMMIT;
-- =============================================================================
