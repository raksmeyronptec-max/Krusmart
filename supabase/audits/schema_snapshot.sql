-- =============================================================================
-- schema_snapshot.sql — what is actually on this database?
-- =============================================================================
-- READ-ONLY. Nothing here writes. Safe on live, during business hours.
--
-- WHY
-- Migration 00017's header records a dependency nobody could have predicted
-- from reading the migration files: `schools_select_member` reads
-- `profiles.school_id`, not `user_roles.school_id`, so granting a role alone
-- produced a school its own creator could not read back. That was found by
-- inspecting the live schema, not by reading SQL. Assume at least one more
-- surprise like it is waiting, and look before applying anything.
--
-- HOW TO USE
--   1. Run this on LIVE (Supabase dashboard → SQL Editor). Save each result set.
--   2. Compare against the committed baseline in this directory, which was
--      produced by running this same file against a local database with
--      00001–00017 applied.
--   3. Investigate every difference before starting the runbook. Do NOT assume
--      the two will match — finding where they do not is the entire point.
--
-- The last query (section 7) is the quick one: it reports which of 00001–00017
-- are detectably present, so you can tell at a glance where live actually is.
-- Run that first if you are short of time, then come back for the detail.
-- =============================================================================


-- =============================================================================
-- 1. TABLES AND COLUMNS — type, nullability, default
-- =============================================================================
SELECT 'columns' AS section,
       c.table_name,
       c.ordinal_position AS pos,
       c.column_name,
       c.data_type,
       c.is_nullable,
       c.column_default
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
 WHERE c.table_schema = 'public'
   AND t.table_type = 'BASE TABLE'
 ORDER BY c.table_name, c.ordinal_position;


-- =============================================================================
-- 2. RLS — is it enabled, and what does each policy actually say?
-- =============================================================================
-- `rowsecurity = false` on a table holding teacher data is the finding that
-- matters most here; a table with policies but RLS disabled enforces nothing.
SELECT 'rls enabled' AS section,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

SELECT 'policies' AS section,
       tablename,
       policyname,
       cmd,
       permissive,
       roles::text AS applies_to,
       qual        AS using_clause,
       with_check  AS with_check_clause
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;


-- =============================================================================
-- 3. FUNCTIONS — SECURITY DEFINER status and pinned search_path
-- =============================================================================
-- A SECURITY DEFINER function without a pinned `search_path` is a privilege
-- escalation waiting to happen: the definer's rights follow whatever schema
-- the caller puts first. Every definer in this schema is supposed to carry
-- `SET search_path = public, pg_temp`. Anything here that does not is a finding.
SELECT 'functions' AS section,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'security invoker' END AS security,
       CASE WHEN p.prosecdef AND (p.proconfig IS NULL
              OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                              WHERE cfg LIKE 'search_path=%'))
            THEN 'NO search_path — INVESTIGATE'
            ELSE coalesce(array_to_string(p.proconfig, ', '), '')
       END AS search_path,
       l.lanname AS language
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l  ON l.oid = p.prolang
 WHERE n.nspname = 'public'
 ORDER BY p.proname;


-- =============================================================================
-- 4. INDEXES
-- =============================================================================
SELECT 'indexes' AS section, tablename, indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;


-- =============================================================================
-- 5. CONSTRAINTS — primary keys, foreign keys, uniques, checks
-- =============================================================================
SELECT 'constraints' AS section,
       rel.relname AS table_name,
       con.conname AS constraint_name,
       CASE con.contype WHEN 'p' THEN 'PRIMARY KEY'
                        WHEN 'f' THEN 'FOREIGN KEY'
                        WHEN 'u' THEN 'UNIQUE'
                        WHEN 'c' THEN 'CHECK'
                        ELSE con.contype::text END AS kind,
       pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
 WHERE n.nspname = 'public'
 ORDER BY rel.relname, con.conname;


-- =============================================================================
-- 6. GRANTS — the trap 00005 exists to close
-- =============================================================================
-- RLS filters rows; GRANT decides whether the role may touch the table at all.
-- Postgres checks the grant FIRST, so a table with perfect policies and no
-- grant returns `42501 permission denied` to every request. `anon` should hold
-- nothing; `authenticated` should hold SELECT/INSERT/UPDATE/DELETE everywhere.
SELECT 'grants' AS section,
       c.relname AS table_name,
       g.grantee,
       string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type) AS privileges
  FROM information_schema.role_table_grants g
  JOIN pg_class c ON c.relname = g.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = g.table_schema
 WHERE g.table_schema = 'public'
   AND g.grantee IN ('anon', 'authenticated', 'service_role')
   AND c.relkind = 'r'
 GROUP BY c.relname, g.grantee
 ORDER BY c.relname, g.grantee;

-- Tables `authenticated` cannot SELECT — expect zero rows.
SELECT 'grant gaps' AS section, c.relname AS table_missing_select
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
 ORDER BY c.relname;


-- =============================================================================
-- 7. WHICH MIGRATIONS ARE DETECTABLY PRESENT — run this first if rushed
-- =============================================================================
-- Presence is inferred from a distinctive object each migration creates. This
-- detects *structure*, not whether a data backfill ran, so a `present` verdict
-- for 00004 means its tables exist, not that every row was migrated.
WITH probe(migration, what, present) AS (
  VALUES
    ('00001 init',                 'students table',
      to_regclass('public.students') IS NOT NULL),
    ('00002 reconciliation',       'scores.score_period column',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='scores' AND column_name='score_period')),
    ('00003 enterprise v2',        'teacher_assignments table',
      to_regclass('public.teacher_assignments') IS NOT NULL),
    ('00004 v2 backfill',          'class_subjects table',
      to_regclass('public.class_subjects') IS NOT NULL),
    ('00005 postgrest grants',     'authenticated can SELECT students',
      to_regclass('public.students') IS NOT NULL
        AND has_table_privilege('authenticated', 'public.students', 'SELECT')),
    ('00006 students class access','can_access_student()',
      to_regprocedure('public.can_access_student(uuid)') IS NOT NULL),
    ('00007 scores class access',  'scores_select_own_or_assigned policy',
      EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
               AND tablename='scores' AND policyname='scores_select_own_or_assigned')),
    ('00008 profiles admin read',  'profiles admin SELECT policy',
      EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
               AND tablename='profiles' AND policyname ILIKE '%admin%')),
    ('00009 grading schemes seed', 'at least one default grading scheme',
      to_regclass('public.grading_schemes') IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.grading_schemes WHERE is_default)),
    ('00010 parent portal',        'parent_students table',
      to_regclass('public.parent_students') IS NOT NULL),
    ('00011 write requires rel.',  'can_write_for_student()',
      to_regprocedure('public.can_write_for_student(uuid)') IS NOT NULL),
    ('00012 legacy features',      'custom_subjects table',
      to_regclass('public.custom_subjects') IS NOT NULL),
    ('00013 settings profile',     'settings.school_logo column',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='settings' AND column_name='school_logo')),
    ('00014 attendance locks',     'attendance_locks teacher policy',
      EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
               AND tablename='attendance_locks')),
    ('00015 cognitive',            'cognitive_assessments table',
      to_regclass('public.cognitive_assessments') IS NOT NULL),
    ('00016 score templates',      'score_template_subjects table',
      to_regclass('public.score_template_subjects') IS NOT NULL),
    ('00017 teacher org RPC',      'create_teacher_organisation()',
      to_regprocedure('public.create_teacher_organisation(text,text,text)') IS NOT NULL
        OR to_regprocedure('public.create_teacher_organisation(text,text)') IS NOT NULL),
    -- The seven this deployment is about. All should read `absent` before you
    -- start the runbook; each becomes `present` as you apply it.
    ('00018 backfill enrolments',  'backfill_teacher_enrolments()',
      to_regprocedure('public.backfill_teacher_enrolments(uuid)') IS NOT NULL),
    ('00019 never-enrolled only',  'cannot be detected structurally — see note',
      NULL),
    ('00020 teacher profile',      'teacher_profiles table',
      to_regclass('public.teacher_profiles') IS NOT NULL),
    ('00021 template levels',      'score_template_subjects.level_key column',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='score_template_subjects'
                 AND column_name='level_key')),
    ('00022 join requests',        'join_requests table',
      to_regclass('public.join_requests') IS NOT NULL),
    ('00023 secondary schemes',    'a /50 coefficient default scheme',
      to_regclass('public.grading_schemes') IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.grading_schemes
                     WHERE is_default AND config->>'weighting' = 'coefficient')),
    ('00024 assignment subj key',  'teacher_assignments.subject_key column',
      EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='teacher_assignments'
                 AND column_name='subject_key')),
    ('00025 homeroom key uniq',    'teacher_assignments_homeroom_key_uniq index',
      EXISTS (SELECT 1 FROM pg_indexes
               WHERE tablename='teacher_assignments'
                 AND indexname='teacher_assignments_homeroom_key_uniq'))
)
SELECT 'migration presence' AS section,
       migration,
       what AS detected_by,
       CASE WHEN present IS NULL THEN 'INDETERMINATE'
            WHEN present THEN 'present'
            ELSE 'absent' END AS verdict
  FROM probe
 ORDER BY migration;

-- 00019 note: it neither creates nor drops an object — it redefines the
-- function 00018 created, so no structural probe can distinguish the two
-- versions. Tell them apart by reading the body:
--
--   SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'backfill_teacher_enrolments';
--
--   contains 'NOT EXISTS' against student_enrollments with NO academic-year
--   filter  → 00019 applied (enrols only never-enrolled students)
--   contains a guard scoped to the target academic year
--           → 00018 only (the cross-year promotion bug is live)
