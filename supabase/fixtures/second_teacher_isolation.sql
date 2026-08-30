-- =============================================================================
-- second_teacher_isolation.sql — a teacher whose data must stay invisible.
-- =============================================================================
-- Companion to `primary_ranking_teacher.sql`, seeding the ONE thing that
-- fixture cannot contain: somebody else's class. §33 requires proving that a
-- forged `class_id` or `student_id` reaches no unauthorised data, and that is
-- not provable with a database containing only the caller's own rows — every
-- query would return the right answer for the wrong reason.
--
-- So this adds a second teacher, their class ៤ខ, one pupil and one mark. The
-- teacher under test has no assignment to any of it, and
-- `scripts/verify-annual-live.mts` asserts they can read none of it, twice
-- over: once because `resolveServerScope` validates a requested class against
-- the caller's own assignments, and once because RLS refuses it independently.
--
-- REQUIRES both auth users to exist. Create them first, then substitute their
-- ids for the two placeholders below:
--
--   for EMAIL in ranktest@krusmart.local othertest@krusmart.local; do
--     curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
--       -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
--       -H 'Content-Type: application/json' \
--       -d "{\"email\":\"$EMAIL\",\"password\":\"...\",\"email_confirm\":true}"
--   done
--
-- Pass the id returned for othertest@krusmart.local as a psql variable — there
-- is deliberately no default, because a fixture that silently falls back to a
-- placeholder uuid fails halfway through a transaction with a foreign-key error
-- that says nothing about the real mistake:
--
--   psql ... -v OTHER_TEACHER_ID=<uuid> -f second_teacher_isolation.sql
--
-- LOCAL FIXTURE ONLY. Never run against a real project.
-- =============================================================================

\if :{?OTHER_TEACHER_ID}
\else
\echo 'ERROR: pass -v OTHER_TEACHER_ID=<uuid of othertest@krusmart.local>'
\quit
\endif

BEGIN;

-- A second class in the SAME school, year and grade as ៤ក. Same school on
-- purpose: isolation that only works because the classes are in different
-- schools would not test the class scope at all.
INSERT INTO public.classes (id, academic_year_id, grade_id, name)
VALUES ('c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002',
        'a0000000-0000-0000-0000-000000000004',
        '៤ខ')
ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, school_id, full_name)
VALUES (:'OTHER_TEACHER_ID', 'a0000000-0000-0000-0000-000000000001', 'គ្រូ ផ្សេង')
ON CONFLICT (id) DO UPDATE SET school_id = EXCLUDED.school_id;

INSERT INTO public.teacher_assignments (teacher_id, class_id, academic_year_id, is_homeroom, status)
VALUES (:'OTHER_TEACHER_ID', 'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002', true, 'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.students (id, teacher_id, student_id, grade, name_kh, gender, dob)
VALUES ('d0000000-0000-0000-0000-000000000001', :'OTHER_TEACHER_ID',
        'X01', '៤ខ', 'សិស្សក្រៅ', 'ប្រុស', '2015-05-01')
ON CONFLICT (id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id;

INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
VALUES ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000002', 'active')
ON CONFLICT DO NOTHING;

-- One mark, so "the other teacher's scores are unreadable" is a claim about
-- data that actually exists rather than about an empty table.
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value)
VALUES (:'OTHER_TEACHER_ID', 'd0000000-0000-0000-0000-000000000001',
        'kh_listen', 'semester', 'sem1-2025-2026', 10)
ON CONFLICT DO NOTHING;

COMMIT;

SELECT c.name AS class, count(e.student_id) AS pupils
FROM public.classes c
LEFT JOIN public.student_enrollments e ON e.class_id = c.id
GROUP BY c.name ORDER BY c.name;
