-- =============================================================================
-- primary_ranking_teacher.sql — a complete primary teacher, for live testing.
-- =============================================================================
-- Seeds the shape `resolveRankingMonthly` needs end to end: school -> academic
-- year -> education level -> grade 4 -> class ៤ខ តេស្ត -> homeroom assignment ->
-- five pupils -> a three-subject class selection (00028) -> monthly, semester
-- and April marks.
--
-- The marks are chosen to exercise the ranking semantics rather than to look
-- realistic:
--   សុខា    9,9  -> average 9, rank 1
--   ដារា    7,7  -> average 7, rank 2  (tied)
--   វិចិត្រ  7,7  -> average 7, rank 2  (tied)
--   រតនា    none -> average NULL, no rank, sorts last
-- so a run proves ties share a rank, the next rank skips to 4, and an unmarked
-- pupil is never printed as a zero.
--
-- ── THE FIXTURE OWNS ITS OWN CLASS ─────────────────────────────────────────
--
-- It used to seed into ៤ក, which is also the class the `ranktest` account is
-- used to browse the app with. Two things then happened, and between them they
-- left `verify-ranking-live` and `verify-annual-live` failing for four phases:
--
--   * thirty pupils, ninety-three September marks and a fourth subject were
--     added to ៤ក through the app, so the class stopped matching anything this
--     file describes;
--   * the enrolment step read
--         SELECT id FROM public.students WHERE teacher_id = <the teacher>
--     which sweeps EVERY pupil the account owns into the fixture's class. One
--     pupil created in the app became one more pupil in the harness's roster.
--
-- So the fixture now seeds `៤ខ តេស្ត` — its own class, in the same school —
-- enumerates the five pupil ids it enrols rather than selecting by owner, and
-- reclaims those five from any other class in the year. Browse ៤ក freely; it
-- is no longer part of any assertion.
--
-- ── AND IT FINDS ITS OWN TEACHER ───────────────────────────────────────────
--
-- The teacher's uuid used to be a literal that the header asked you to replace
-- by hand after creating the auth user. That is exactly what went stale: the
-- committed literal named a user this machine does not have. Every statement
-- below resolves the account from `auth.users` by email instead, so the file
-- applies unedited wherever the user exists.
--
-- REQUIRES the auth user to exist. Create it first:
--   curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
--     -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
--     -H 'Content-Type: application/json' \
--     -d '{"email":"ranktest@krusmart.local","password":"RankTest12345!","email_confirm":true}'
--
-- Re-runnable: every insert is ON CONFLICT DO NOTHING, and the three DELETEs
-- are bounded to the fixture's OWN class and its own five pupils, so a second
-- run restores the described shape without touching anything else.
--
-- LOCAL FIXTURE ONLY. Never run against a real project.
-- =============================================================================

BEGIN;

-- ------------------------------------------------------------------ the school
INSERT INTO public.schools (id, name)
 VALUES ('a0000000-0000-0000-0000-000000000001','សាលាបឋមសិក្សា តេស្ត') ON CONFLICT DO NOTHING;
INSERT INTO public.academic_years (id, school_id, name)
 VALUES ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','2025-2026') ON CONFLICT DO NOTHING;
INSERT INTO public.education_levels (id, school_id, name, sort_order)
 VALUES ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','បឋមសិក្សា',1) ON CONFLICT DO NOTHING;
INSERT INTO public.grades (id, education_level_id, name, sort_order)
 VALUES ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000003','ថ្នាក់ទី៤',4) ON CONFLICT DO NOTHING;

-- The fixture's own class. `...0005` (៤ក) is deliberately NOT reused — see the
-- header. Both live harnesses target this id.
INSERT INTO public.classes (id, academic_year_id, grade_id, name)
 VALUES ('a0000000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004','៤ខ តេស្ត') ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------- the teacher
-- `schools_select_member` reads PROFILES, not user_roles, so the school stamp
-- is required rather than decorative.
INSERT INTO public.profiles (id, school_id, full_name)
 SELECT u.id,'a0000000-0000-0000-0000-000000000001','គ្រូ តេស្ត' FROM auth.users u
 WHERE u.email = 'ranktest@krusmart.local'
 ON CONFLICT (id) DO UPDATE SET school_id = EXCLUDED.school_id;

INSERT INTO public.teacher_assignments (teacher_id, class_id, academic_year_id, is_homeroom, status)
 SELECT u.id,'a0000000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000002',true,'active'
 FROM auth.users u WHERE u.email = 'ranktest@krusmart.local'
 ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------ the pupils
INSERT INTO public.students (id, teacher_id, student_id, grade, name_kh, gender, dob)
 SELECT v.id, u.id, v.code, '៤ខ តេស្ត', v.name_kh, v.gender, v.dob
 FROM auth.users u CROSS JOIN (VALUES
   ('b0000000-0000-0000-0000-000000000001'::uuid,'S01','សុខា','ប្រុស','2015-01-01'::date),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'S02','ដារា','ស្រី','2015-02-01'::date),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'S03','វិចិត្រ','ប្រុស','2015-03-01'::date),
   ('b0000000-0000-0000-0000-000000000004'::uuid,'S04','រតនា','ស្រី','2015-04-01'::date),
   -- The fifth gives the honour fixture a clean boundary case (a failing
   -- subject on an otherwise strong average).
   ('b0000000-0000-0000-0000-000000000005'::uuid,'S05','ភក្តី','ស្រី','2015-05-01'::date)
 ) AS v(id, code, name_kh, gender, dob)
 WHERE u.email = 'ranktest@krusmart.local'
 ON CONFLICT DO NOTHING;

-- Reclaim the five from any OTHER class in this year, so the fixture's pupils
-- sit in exactly one place. A pupil actively enrolled in two classes of one
-- year is a state `currentEnrolment` cannot read correctly, and it is how these
-- five ended up padding ៤ក's roster. Bounded to the five ids: nothing the app
-- created is touched.
DELETE FROM public.student_enrollments
 WHERE academic_year_id = 'a0000000-0000-0000-0000-000000000002'
   AND class_id <> 'a0000000-0000-0000-0000-000000000015'
   AND student_id IN (
     'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',
     'b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004',
     'b0000000-0000-0000-0000-000000000005');

-- ENUMERATED, never `WHERE teacher_id = …`. The blanket select is what turned
-- every pupil the account owns into a member of the harness's roster.
INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
 SELECT v.id,'a0000000-0000-0000-0000-000000000015','a0000000-0000-0000-0000-000000000002','active'
 FROM (VALUES
   ('b0000000-0000-0000-0000-000000000001'::uuid),('b0000000-0000-0000-0000-000000000002'::uuid),
   ('b0000000-0000-0000-0000-000000000003'::uuid),('b0000000-0000-0000-0000-000000000004'::uuid),
   ('b0000000-0000-0000-0000-000000000005'::uuid)
 ) AS v(id)
 ON CONFLICT DO NOTHING;

-- ...and nobody else is in it. Bounded to the fixture's own class.
DELETE FROM public.student_enrollments
 WHERE class_id = 'a0000000-0000-0000-0000-000000000015'
   AND student_id NOT IN (
     'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',
     'b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004',
     'b0000000-0000-0000-0000-000000000005');

-- --------------------------------------------------------------- the selection
-- Exactly three, so `applySelection` provably narrows the 34-subject primary
-- curriculum. The count is asserted by both harnesses, which is why the DELETE
-- below matters: a fourth subject ticked in `/score/subjects` would break them.
INSERT INTO public.class_template_subjects (class_id, subject_key, sort_order) VALUES
 ('a0000000-0000-0000-0000-000000000015','khmer_all',10),
 ('a0000000-0000-0000-0000-000000000015','math_general',20),
 ('a0000000-0000-0000-0000-000000000015','science_all',30) ON CONFLICT DO NOTHING;

DELETE FROM public.class_template_subjects
 WHERE class_id = 'a0000000-0000-0000-0000-000000000015'
   AND subject_key NOT IN ('khmer_all','math_general','science_all');

-- ------------------------------------------------------------------ the marks
-- Keyed on the pupil, not the class, so they survive the class change above.
--
--   nov / dec  monthly, for the coursework half of semester 1
--   sem1       the exam half
--   apr        semester 2, so the honour criteria are exercised without
--              disturbing anything semester 1 asserts
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value)
 SELECT u.id, v.student_id, v.subject, v.score_type, v.score_period, v.score_value
 FROM auth.users u CROSS JOIN (VALUES
   -- November: សុខា 9,9 · ដារា 7,7 · វិចិត្រ 7,7 · រតនា none
   ('b0000000-0000-0000-0000-000000000001'::uuid,'kh_listen','monthly','nov-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000001'::uuid,'math_num','monthly','nov-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'kh_listen','monthly','nov-2025-2026',7),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'math_num','monthly','nov-2025-2026',7),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'kh_listen','monthly','nov-2025-2026',7),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'math_num','monthly','nov-2025-2026',7),

   -- Semester-1 EXAM marks: សុខា 9 · ដារា 8 · វិចិត្រ 6
   ('b0000000-0000-0000-0000-000000000001'::uuid,'kh_listen','semester','sem1-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000001'::uuid,'math_num','semester','sem1-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'kh_listen','semester','sem1-2025-2026',8),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'math_num','semester','sem1-2025-2026',8),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'kh_listen','semester','sem1-2025-2026',6),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'math_num','semester','sem1-2025-2026',6),

   -- December, so the coursework half spans nov+dec:
   --   សុខា   9 -> 9  monthly 9  => semester (9+9)/2 = 9
   --   ដារា   7 -> 5  monthly 6  => semester (8+6)/2 = 7
   --   វិចិត្រ 7 -> 9  monthly 8  => semester (6+8)/2 = 7  <- ties ដារា from the other half
   ('b0000000-0000-0000-0000-000000000001'::uuid,'kh_listen','monthly','dec-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000001'::uuid,'math_num','monthly','dec-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'kh_listen','monthly','dec-2025-2026',5),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'math_num','monthly','dec-2025-2026',5),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'kh_listen','monthly','dec-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'math_num','monthly','dec-2025-2026',9),

   -- April, chosen to exercise the honour criteria exactly:
   --   សុខា   9,9    avg 9.0   -> ELIGIBLE (clears 8, nothing failing)
   --   ដារា   8,8    avg 8.0   -> ELIGIBLE (exactly ON the boundary)
   --   វិចិត្រ 8,7    avg 7.5   -> NOT eligible (below 8)
   --   រតនា   10,4   avg 7.0   -> NOT eligible (failing subject AND below 8)
   --   ភក្តី   10,4.5 avg 7.25  -> NOT eligible (a failing subject)
   ('b0000000-0000-0000-0000-000000000001'::uuid,'kh_listen','monthly','apr-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000001'::uuid,'math_num','monthly','apr-2025-2026',9),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'kh_listen','monthly','apr-2025-2026',8),
   ('b0000000-0000-0000-0000-000000000002'::uuid,'math_num','monthly','apr-2025-2026',8),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'kh_listen','monthly','apr-2025-2026',8),
   ('b0000000-0000-0000-0000-000000000003'::uuid,'math_num','monthly','apr-2025-2026',7),
   ('b0000000-0000-0000-0000-000000000004'::uuid,'kh_listen','monthly','apr-2025-2026',10),
   ('b0000000-0000-0000-0000-000000000004'::uuid,'math_num','monthly','apr-2025-2026',4),
   ('b0000000-0000-0000-0000-000000000005'::uuid,'kh_listen','monthly','apr-2025-2026',10),
   ('b0000000-0000-0000-0000-000000000005'::uuid,'math_num','monthly','apr-2025-2026',4.5)
 ) AS v(student_id, subject, score_type, score_period, score_value)
 WHERE u.email = 'ranktest@krusmart.local'
 ON CONFLICT DO NOTHING;

-- ...and the five carry ONLY the marks below.
--
-- The same pollution as the enrolment sweep, one table over: twenty-five
-- September marks were entered against these pupils through the app, and a
-- year-wide fetch counts every month at once — so they changed a figure the
-- harness asserts exactly. Bounded twice over: to the fixture's own five pupil
-- ids, and to periods this file does not seed. Nothing belonging to a pupil the
-- app created is reachable from here.
DELETE FROM public.scores
 WHERE student_id IN (
     'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',
     'b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000004',
     'b0000000-0000-0000-0000-000000000005')
   AND (score_type, score_period) NOT IN (
     ('monthly','nov-2025-2026'), ('monthly','dec-2025-2026'),
     ('monthly','apr-2025-2026'), ('semester','sem1-2025-2026'));

COMMIT;

-- What a good run looks like: 5 pupils, 5 enrolments, 3 subjects, 30 marks
-- across four periods, and nothing the app wrote inside the fixture's own rows.
SELECT
  (SELECT count(*) FROM public.student_enrollments
    WHERE class_id='a0000000-0000-0000-0000-000000000015')                    AS enrolled,
  (SELECT count(*) FROM public.class_template_subjects
    WHERE class_id='a0000000-0000-0000-0000-000000000015')                    AS subjects,
  (SELECT count(*) FROM public.scores sc
     JOIN public.student_enrollments e ON e.student_id = sc.student_id
    WHERE e.class_id='a0000000-0000-0000-0000-000000000015')                  AS marks;
SELECT score_type, score_period, count(*) FROM public.scores sc
 JOIN public.student_enrollments e ON e.student_id = sc.student_id
 WHERE e.class_id = 'a0000000-0000-0000-0000-000000000015'
 GROUP BY 1,2 ORDER BY 1,2;
