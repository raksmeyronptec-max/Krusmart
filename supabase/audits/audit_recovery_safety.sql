-- =============================================================================
-- audit_recovery_safety.sql — is the roster-recovery banner safe to press?
-- =============================================================================
-- READ-ONLY. Nothing in this file writes: no INSERT, UPDATE, DELETE, CREATE,
-- ALTER or DROP. Safe to paste into the live SQL editor at any time, including
-- during business hours. It is a question, not a change.
--
-- WHY THIS EXISTS
-- Commit 2686507 switched an account to v2 class scope without creating the
-- matching `student_enrollments` rows, so the roster read came back empty and
-- the teacher's pupils vanished from every screen. Some teachers responded the
-- only way the UI allowed: they re-typed their students. Those accounts now
-- hold TWO rows for one child — the original orphan (no enrolment) and the
-- retyped copy (enrolled) — and the marks may be split across both.
--
-- `/student-list` offers a recovery banner that calls
-- `backfill_teacher_enrolments()` (00018, redefined by 00019), which enrols
-- every never-enrolled student into the active homeroom class. For a teacher
-- who simply lost their roster that is exactly right. For a teacher who
-- re-typed, it enrols the orphans alongside the copies and the class ends up
-- with every child twice.
--
-- So this audit is the gate: run it BEFORE telling any teacher to press that
-- button, and read section 2 first.
--
-- HOW TO RUN
-- Supabase dashboard → SQL Editor → paste this whole file → Run. Five result
-- sets come back, in order. Read them together, not individually.
--
-- =============================================================================
-- WHAT EACH NUMBER MEANS, AND WHAT TO DO
-- =============================================================================
--
-- 0a. signal reliability
--     How usable the identity columns are for matching a duplicate pair.
--     `missing_student_code` high  → section 2's pairing is weaker than it
--     looks; treat its output as a hint and confirm each account by eye before
--     acting. All zeros → the pairing is trustworthy.
--
-- 1.  accounts at risk           ← the headline number
--     Teachers who have a homeroom assignment, at least one student with no
--     enrolment row anywhere, AND scores entered after that assignment. That
--     combination is the 2686507 fingerprint.
--     n = 0  → nobody was affected. Sections 2–4 will be empty. The banner is
--              safe wherever it appears; no further action.
--     n > 0  → keep the `teacher_ids` list. Every decision below is per
--              teacher, never global.
--
-- 2.  duplicate pairs            ← the dangerous case, read this before acting
--     Inside an at-risk account, an orphaned student and an enrolled student
--     that look like the same child (matched on student code, or on Khmer name
--     plus date of birth).
--     n = 0  → nobody re-typed. Recovery is a plain repair: the banner enrols
--              the orphans and the roster returns. Safe to tell those teachers
--              to press it.
--     n > 0  → DO NOT tell those teachers to press the banner. It would enrol
--              the orphan next to its copy and put every child in the class
--              twice. These accounts need merging first, which is a separate,
--              deliberate, write-carrying operation that does not exist yet —
--              it is not the banner and it is not this file.
--
-- 3.  split marks
--     For each pair, whether marks exist on BOTH sides, and how many.
--     both_sides = 0  → all marks sit on one row; a merge would only have to
--                       delete the empty twin.
--     both_sides > 0  → the child's record is genuinely split. A merge must
--                       move marks, and `scores_owner_period_uniq`
--                       (teacher_id, student_id, subject, score_type,
--                       score_period) means a naive move can collide. Whoever
--                       builds that merge must decide which side wins per
--                       collision. Do not improvise it in the SQL editor.
--
-- 4.  simple cases
--     At-risk accounts with orphans but no duplicate pairs — i.e. section 1
--     minus section 2. These are exactly the teachers for whom the banner is
--     both safe and the right fix. This is the list to act on.
--
-- =============================================================================
-- ONE-LINE SUMMARY OF THE DECISION
-- =============================================================================
--   section 1 = 0            → nothing happened; nothing to do.
--   section 4 accounts       → safe: tell these teachers to press the banner.
--   section 2 accounts       → unsafe: leave the banner alone, merge first.
--
-- Re-run this after any recovery activity: it is idempotent because it writes
-- nothing, and the numbers should shrink toward zero.
-- =============================================================================

-- 0a. Signal reliability: how trustworthy are the identity columns?
SELECT 'signal reliability' AS section,
       count(*)                                                        AS students_total,
       count(*) FILTER (WHERE student_id IS NULL OR btrim(student_id) = '') AS missing_student_code,
       count(*) FILTER (WHERE name_kh IS NULL OR btrim(name_kh) = '')       AS missing_name_kh,
       count(*) FILTER (WHERE dob IS NULL)                                  AS missing_dob
  FROM public.students;

-- ============================================================================
-- 1. Accounts at risk: active homeroom assignment (T = earliest such),
--    >=1 orphaned student (no enrolment row anywhere), and scores after T.
-- ============================================================================
WITH homeroom AS (
  SELECT teacher_id, min(created_at) AS t
    FROM public.teacher_assignments
   WHERE status = 'active' AND is_homeroom
   GROUP BY teacher_id
),
orphans AS (
  SELECT s.teacher_id, s.id, s.student_id AS code, s.name_kh, s.dob
    FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments se
                      WHERE se.student_id = s.id)
),
at_risk AS (
  SELECT h.teacher_id, h.t
    FROM homeroom h
   WHERE EXISTS (SELECT 1 FROM orphans o WHERE o.teacher_id = h.teacher_id)
     AND EXISTS (SELECT 1 FROM public.scores sc
                  WHERE sc.teacher_id = h.teacher_id AND sc.created_at > h.t)
)
SELECT '1. accounts at risk' AS section, count(*) AS n,
       array_agg(teacher_id) AS teacher_ids
  FROM at_risk;

-- ============================================================================
-- 2. Duplicate pairs inside at-risk accounts: one orphaned row + one enrolled
--    row that look like the same child. UNIQUE (teacher_id, student_id) makes
--    a same-code pair impossible within a teacher, so the strongest usable
--    signal is name_kh + dob (strict), with name-only as the weaker tier.
-- ============================================================================
WITH homeroom AS (
  SELECT teacher_id, min(created_at) AS t
    FROM public.teacher_assignments
   WHERE status = 'active' AND is_homeroom
   GROUP BY teacher_id
),
orphans AS (
  SELECT s.* FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments se
                      WHERE se.student_id = s.id)
),
at_risk AS (
  SELECT h.teacher_id FROM homeroom h
   WHERE EXISTS (SELECT 1 FROM orphans o WHERE o.teacher_id = h.teacher_id)
     AND EXISTS (SELECT 1 FROM public.scores sc
                  WHERE sc.teacher_id = h.teacher_id AND sc.created_at > h.t)
),
enrolled AS (
  SELECT s.* FROM public.students s
   WHERE EXISTS (SELECT 1 FROM public.student_enrollments se
                  WHERE se.student_id = s.id)
),
pairs AS (
  SELECT o.teacher_id,
         o.id  AS orphan_id,
         e.id  AS enrolled_id,
         CASE WHEN o.dob IS NOT NULL AND e.dob IS NOT NULL AND o.dob = e.dob
              THEN 'name_kh+dob' ELSE 'name_kh only' END AS signal
    FROM orphans o
    JOIN enrolled e
      ON e.teacher_id = o.teacher_id
     AND regexp_replace(coalesce(e.name_kh,''), '\s', '', 'g')
       = regexp_replace(coalesce(o.name_kh,''), '\s', '', 'g')
     AND btrim(coalesce(o.name_kh,'')) <> ''
     AND (o.dob IS NULL OR e.dob IS NULL OR o.dob = e.dob)
   WHERE o.teacher_id IN (SELECT teacher_id FROM at_risk)
)
SELECT '2. duplicate pairs' AS section, signal, count(*) AS pairs,
       count(DISTINCT teacher_id) AS teachers_affected
  FROM pairs GROUP BY signal
UNION ALL
SELECT '2. duplicate pairs', 'TOTAL', count(*), count(DISTINCT teacher_id)
  FROM pairs;

-- ============================================================================
-- 3. Split marks: for each pair, do both sides carry scores, and how many
--    (subject, score_type, score_period) keys collide — those are the rows a
--    re-point cannot keep both of, given scores_owner_period_uniq.
-- ============================================================================
WITH homeroom AS (
  SELECT teacher_id, min(created_at) AS t
    FROM public.teacher_assignments
   WHERE status = 'active' AND is_homeroom
   GROUP BY teacher_id
),
orphans AS (
  SELECT s.* FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments se
                      WHERE se.student_id = s.id)
),
at_risk AS (
  SELECT h.teacher_id FROM homeroom h
   WHERE EXISTS (SELECT 1 FROM orphans o WHERE o.teacher_id = h.teacher_id)
     AND EXISTS (SELECT 1 FROM public.scores sc
                  WHERE sc.teacher_id = h.teacher_id AND sc.created_at > h.t)
),
enrolled AS (
  SELECT s.* FROM public.students s
   WHERE EXISTS (SELECT 1 FROM public.student_enrollments se
                  WHERE se.student_id = s.id)
),
pairs AS (
  SELECT o.teacher_id, o.id AS orphan_id, e.id AS enrolled_id
    FROM orphans o
    JOIN enrolled e
      ON e.teacher_id = o.teacher_id
     AND regexp_replace(coalesce(e.name_kh,''), '\s', '', 'g')
       = regexp_replace(coalesce(o.name_kh,''), '\s', '', 'g')
     AND btrim(coalesce(o.name_kh,'')) <> ''
     AND (o.dob IS NULL OR e.dob IS NULL OR o.dob = e.dob)
   WHERE o.teacher_id IN (SELECT teacher_id FROM at_risk)
),
sides AS (
  SELECT p.*,
         (SELECT count(*) FROM public.scores sc WHERE sc.student_id = p.orphan_id)   AS orphan_scores,
         (SELECT count(*) FROM public.scores sc WHERE sc.student_id = p.enrolled_id) AS enrolled_scores
    FROM pairs p
),
collisions AS (
  SELECT p.orphan_id, p.enrolled_id, a.score_period, count(*) AS colliding_keys
    FROM pairs p
    JOIN public.scores a ON a.student_id = p.orphan_id
    JOIN public.scores b ON b.student_id = p.enrolled_id
                        AND b.teacher_id = a.teacher_id
                        AND b.subject = a.subject
                        AND coalesce(b.score_type,'') = coalesce(a.score_type,'')
                        AND b.score_period = a.score_period
   GROUP BY p.orphan_id, p.enrolled_id, a.score_period
)
SELECT '3a. pairs with scores on both sides' AS section,
       count(*) FILTER (WHERE orphan_scores > 0 AND enrolled_scores > 0) AS both_sides,
       count(*) FILTER (WHERE orphan_scores > 0 AND enrolled_scores = 0) AS orphan_only,
       count(*) FILTER (WHERE orphan_scores = 0 AND enrolled_scores > 0) AS enrolled_only,
       count(*) FILTER (WHERE orphan_scores = 0 AND enrolled_scores = 0) AS neither
  FROM sides;

WITH homeroom AS (
  SELECT teacher_id, min(created_at) AS t
    FROM public.teacher_assignments
   WHERE status = 'active' AND is_homeroom
   GROUP BY teacher_id
),
orphans AS (
  SELECT s.* FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments se
                      WHERE se.student_id = s.id)
),
at_risk AS (
  SELECT h.teacher_id FROM homeroom h
   WHERE EXISTS (SELECT 1 FROM orphans o WHERE o.teacher_id = h.teacher_id)
     AND EXISTS (SELECT 1 FROM public.scores sc
                  WHERE sc.teacher_id = h.teacher_id AND sc.created_at > h.t)
),
enrolled AS (
  SELECT s.* FROM public.students s
   WHERE EXISTS (SELECT 1 FROM public.student_enrollments se
                  WHERE se.student_id = s.id)
),
pairs AS (
  SELECT o.teacher_id, o.id AS orphan_id, e.id AS enrolled_id
    FROM orphans o
    JOIN enrolled e
      ON e.teacher_id = o.teacher_id
     AND regexp_replace(coalesce(e.name_kh,''), '\s', '', 'g')
       = regexp_replace(coalesce(o.name_kh,''), '\s', '', 'g')
     AND btrim(coalesce(o.name_kh,'')) <> ''
     AND (o.dob IS NULL OR e.dob IS NULL OR o.dob = e.dob)
   WHERE o.teacher_id IN (SELECT teacher_id FROM at_risk)
)
SELECT '3b. colliding score keys by period' AS section,
       a.score_period, count(*) AS colliding_keys
  FROM pairs p
  JOIN public.scores a ON a.student_id = p.orphan_id
  JOIN public.scores b ON b.student_id = p.enrolled_id
                      AND b.teacher_id = a.teacher_id
                      AND b.subject = a.subject
                      AND coalesce(b.score_type,'') = coalesce(a.score_type,'')
                      AND b.score_period = a.score_period
 GROUP BY a.score_period
 ORDER BY a.score_period;

-- ============================================================================
-- 4. The simple case: at-risk accounts with orphans but no duplicate pairs.
-- ============================================================================
WITH homeroom AS (
  SELECT teacher_id, min(created_at) AS t
    FROM public.teacher_assignments
   WHERE status = 'active' AND is_homeroom
   GROUP BY teacher_id
),
orphans AS (
  SELECT s.* FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.student_enrollments se
                      WHERE se.student_id = s.id)
),
at_risk AS (
  SELECT h.teacher_id FROM homeroom h
   WHERE EXISTS (SELECT 1 FROM orphans o WHERE o.teacher_id = h.teacher_id)
     AND EXISTS (SELECT 1 FROM public.scores sc
                  WHERE sc.teacher_id = h.teacher_id AND sc.created_at > h.t)
),
enrolled AS (
  SELECT s.* FROM public.students s
   WHERE EXISTS (SELECT 1 FROM public.student_enrollments se
                  WHERE se.student_id = s.id)
),
pair_teachers AS (
  SELECT DISTINCT o.teacher_id
    FROM orphans o
    JOIN enrolled e
      ON e.teacher_id = o.teacher_id
     AND regexp_replace(coalesce(e.name_kh,''), '\s', '', 'g')
       = regexp_replace(coalesce(o.name_kh,''), '\s', '', 'g')
     AND btrim(coalesce(o.name_kh,'')) <> ''
     AND (o.dob IS NULL OR e.dob IS NULL OR o.dob = e.dob)
)
SELECT '4. simple case' AS section,
       count(*) FILTER (WHERE ar.teacher_id NOT IN (SELECT teacher_id FROM pair_teachers)) AS safe_accounts,
       count(*) FILTER (WHERE ar.teacher_id IN (SELECT teacher_id FROM pair_teachers))     AS unsafe_accounts,
       array_agg(ar.teacher_id) FILTER (WHERE ar.teacher_id IN (SELECT teacher_id FROM pair_teachers)) AS unsafe_teacher_ids
  FROM at_risk ar;
