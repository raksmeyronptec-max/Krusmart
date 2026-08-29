-- =============================================================================
-- primary_ranking_teacher.sql — a complete primary teacher, for live testing.
-- =============================================================================
-- Seeds the shape `resolveRankingMonthly` needs end to end: school -> academic
-- year -> education level -> grade 4 -> class ៤ក -> homeroom assignment ->
-- four pupils -> a three-subject class selection (00028) -> November marks.
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
-- REQUIRES the auth user below to exist. Create it first:
--   curl -X POST http://127.0.0.1:54321/auth/v1/admin/users \
--     -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
--     -H 'Content-Type: application/json' \
--     -d '{"email":"ranktest@krusmart.local","password":"RankTest12345!","email_confirm":true}'
-- then replace the uuid below with the id it returns.
--
-- LOCAL FIXTURE ONLY. Never run against a real project.
-- =============================================================================

BEGIN;
INSERT INTO public.schools (id, name) VALUES ('a0000000-0000-0000-0000-000000000001','សាលាបឋមសិក្សា តេស្ត') ON CONFLICT DO NOTHING;
INSERT INTO public.academic_years (id, school_id, name) VALUES ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','2025-2026') ON CONFLICT DO NOTHING;
INSERT INTO public.education_levels (id, school_id, name, sort_order) VALUES ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','បឋមសិក្សា',1) ON CONFLICT DO NOTHING;
INSERT INTO public.grades (id, education_level_id, name, sort_order) VALUES ('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000003','ថ្នាក់ទី៤',4) ON CONFLICT DO NOTHING;
INSERT INTO public.classes (id, academic_year_id, grade_id, name) VALUES ('a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000004','៤ក') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, school_id, full_name) VALUES ('45ba9888-af55-4664-afb7-a5085c7b8ae7','a0000000-0000-0000-0000-000000000001','គ្រូ តេស្ត') ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id;
INSERT INTO public.teacher_assignments (teacher_id, class_id, academic_year_id, is_homeroom, status) VALUES ('45ba9888-af55-4664-afb7-a5085c7b8ae7','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000002',true,'active') ON CONFLICT DO NOTHING;
INSERT INTO public.students (id, teacher_id, student_id, grade, name_kh, gender, dob) VALUES
 ('b0000000-0000-0000-0000-000000000001','45ba9888-af55-4664-afb7-a5085c7b8ae7','S01','៤ក','សុខា','ប្រុស','2015-01-01'),
 ('b0000000-0000-0000-0000-000000000002','45ba9888-af55-4664-afb7-a5085c7b8ae7','S02','៤ក','ដារា','ស្រី','2015-02-01'),
 ('b0000000-0000-0000-0000-000000000003','45ba9888-af55-4664-afb7-a5085c7b8ae7','S03','៤ក','វិចិត្រ','ប្រុស','2015-03-01'),
 ('b0000000-0000-0000-0000-000000000004','45ba9888-af55-4664-afb7-a5085c7b8ae7','S04','៤ក','រតនា','ស្រី','2015-04-01') ON CONFLICT DO NOTHING;
INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
 SELECT id,'a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000002','active' FROM public.students WHERE teacher_id='45ba9888-af55-4664-afb7-a5085c7b8ae7' ON CONFLICT DO NOTHING;
INSERT INTO public.class_template_subjects (class_id, subject_key, sort_order) VALUES
 ('a0000000-0000-0000-0000-000000000005','khmer_all',10),
 ('a0000000-0000-0000-0000-000000000005','math_general',20),
 ('a0000000-0000-0000-0000-000000000005','science_all',30) ON CONFLICT DO NOTHING;
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value) VALUES
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','kh_listen','monthly','nov-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','math_num','monthly','nov-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','kh_listen','monthly','nov-2025-2026',7),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','math_num','monthly','nov-2025-2026',7),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','kh_listen','monthly','nov-2025-2026',7),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','math_num','monthly','nov-2025-2026',7)
 ON CONFLICT DO NOTHING;
COMMIT;
SELECT (SELECT count(*) FROM public.students WHERE teacher_id='45ba9888-af55-4664-afb7-a5085c7b8ae7') AS pupils,
       (SELECT count(*) FROM public.scores WHERE teacher_id='45ba9888-af55-4664-afb7-a5085c7b8ae7') AS marks,
       (SELECT count(*) FROM public.class_template_subjects WHERE class_id='a0000000-0000-0000-0000-000000000005') AS subjects;
BEGIN;
-- Semester-1 EXAM marks (score_type='semester', period 'sem1-2025-2026').
--   សុខា   9,9  exam avg 9
--   ដារា   8,8  exam avg 8
--   វិចិត្រ 6,6  exam avg 6
--   រតនា   none
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value) VALUES
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','kh_listen','semester','sem1-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','math_num','semester','sem1-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','kh_listen','semester','sem1-2025-2026',8),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','math_num','semester','sem1-2025-2026',8),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','kh_listen','semester','sem1-2025-2026',6),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','math_num','semester','sem1-2025-2026',6)
 ON CONFLICT DO NOTHING;

-- December monthly marks, so the coursework half exists for nov+dec.
--   សុខា   nov 9 -> dec 9  => monthly 9  => semester (9+9)/2 = 9
--   ដារា   nov 7 -> dec 5  => monthly 6  => semester (8+6)/2 = 7
--   វិចិត្រ nov 7 -> dec 9  => monthly 8  => semester (6+8)/2 = 7   <-- ties ដារា from different halves
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value) VALUES
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','kh_listen','monthly','dec-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','math_num','monthly','dec-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','kh_listen','monthly','dec-2025-2026',5),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','math_num','monthly','dec-2025-2026',5),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','kh_listen','monthly','dec-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','math_num','monthly','dec-2025-2026',9)
 ON CONFLICT DO NOTHING;
COMMIT;
SELECT score_type, score_period, count(*) FROM public.scores
 WHERE teacher_id='45ba9888-af55-4664-afb7-a5085c7b8ae7' GROUP BY 1,2 ORDER BY 1,2;
BEGIN;
-- A fifth pupil, to give the honour fixture a clean boundary case.
INSERT INTO public.students (id, teacher_id, student_id, grade, name_kh, gender, dob) VALUES
 ('b0000000-0000-0000-0000-000000000005','45ba9888-af55-4664-afb7-a5085c7b8ae7','S05','៤ក','ភក្តី','ស្រី','2015-05-01')
 ON CONFLICT DO NOTHING;
INSERT INTO public.student_enrollments (student_id, class_id, academic_year_id, status)
 VALUES ('b0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000002','active')
 ON CONFLICT DO NOTHING;

-- April marks (semester 2, so the semester-1 fixture above is unaffected),
-- chosen to exercise the honour criteria exactly:
--   សុខា   9,9   avg 9.0  -> ELIGIBLE (clears 8, nothing failing)
--   ដារា   8,8   avg 8.0  -> ELIGIBLE (exactly ON the boundary)
--   វិចិត្រ 8,7   avg 7.5  -> NOT eligible (below 8)
--   រតនា   10,4  avg 7.0  -> NOT eligible (failing subject AND below 8)
--   ភក្តី   10,4.5 avg 7.25 -> NOT eligible (a failing subject)
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value) VALUES
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','kh_listen','monthly','apr-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000001','math_num','monthly','apr-2025-2026',9),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','kh_listen','monthly','apr-2025-2026',8),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000002','math_num','monthly','apr-2025-2026',8),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','kh_listen','monthly','apr-2025-2026',8),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000003','math_num','monthly','apr-2025-2026',7),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000004','kh_listen','monthly','apr-2025-2026',10),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000004','math_num','monthly','apr-2025-2026',4),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000005','kh_listen','monthly','apr-2025-2026',10),
 ('45ba9888-af55-4664-afb7-a5085c7b8ae7','b0000000-0000-0000-0000-000000000005','math_num','monthly','apr-2025-2026',4.5)
 ON CONFLICT DO NOTHING;
COMMIT;
SELECT score_period, count(*) FROM public.scores
 WHERE teacher_id='45ba9888-af55-4664-afb7-a5085c7b8ae7' GROUP BY 1 ORDER BY 1;
