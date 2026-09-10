-- =============================================================================
-- 00031_teacher_class_creation.sql
-- =============================================================================
-- Let a teacher who belongs to a school create a class in it, and be its
-- teacher — without an administrator, and without becoming one.
--
-- THE DEFECT
-- "បង្កើតថ្នាក់ថ្មី" on /classroom fails for a plain `teacher` account with
-- "មិនអាចបង្កើតកម្រិតថ្នាក់នេះបានទេ". Reproduced as an `authenticated` user
-- holding only the `teacher` role in a school that someone else owns:
--
--     INSERT INTO grades              → 0 rows  (grades_admin_write)
--     INSERT INTO classes             → 0 rows  (classes_admin_write)
--     INSERT INTO teacher_assignments → 0 rows  (teacher_assignments_admin_write)
--
-- All three write policies from 00003 gate on `is_school_admin()`. That was
-- right when classes arrived top-down from a principal, and 00017 kept it true
-- for the self-serve path by a side effect rather than by design: a teacher who
-- creates their own organisation is granted `owner`, so `is_school_admin()`
-- passes for them and nobody noticed the hole. The teachers it does NOT pass
-- for are exactly the ones the join flow (00022) creates — `approve_join_request`
-- grants "exactly the `teacher` role — approval never grants admin" — plus any
-- teacher an administrator provisioned. For them /classroom offers a dialog
-- that cannot succeed.
--
-- WHY A POLICY AND NOT A THIRD SECURITY DEFINER FUNCTION
-- 00017 needed one because it was a genuine deadlock: `schools` had no write
-- policy at all, and granting yourself a role requires already holding one, so
-- there was no expressible policy for "may create the first school". This is
-- not that. "A teacher of this school may create a class in it" is a plain
-- sentence about the caller and the row, which is precisely what a policy is
-- for — and a policy stays visible to `\d+`, to `pg_policies` and to
-- scripts/validate-rls.mjs, where a definer function's body does not.
--
-- So this migration ADDS policies and alters none. Every existing policy keeps
-- its exact meaning; permissive policies are ORed, so administrators are
-- unaffected and nothing that was refused before is refused less narrowly than
-- what is written below.
--
-- THE ONE DANGEROUS WRITE, AND WHAT MAKES IT SAFE
-- Of the three inserts, only `teacher_assignments` grants access to anything:
-- `classes_select_assigned_or_admin`, 00006 (students) and 00007 (scores) all
-- pivot on "is there an assignment row for this caller on this class". A naive
-- `teacher_id = auth.uid()` insert policy would therefore let any teacher
-- attach themselves to any class in their school and read a colleague's pupils
-- and marks. Adding "the class has no assignments yet" is not enough either —
-- an administrator's freshly created, not-yet-staffed class satisfies it.
--
-- The honest predicate is "a class I created", and the schema could not say
-- that: `classes` records who a class is for and never who made it. So this
-- adds `classes.created_by`, defaulted to `auth.uid()`, and the self-assignment
-- policy is keyed on it. A teacher may hand themselves exactly one thing: an
-- assignment to a class that did not exist before they made it.
--
-- `created_by` is provenance, not authorisation: it confers no read of pupils,
-- marks or enrolments — those still require the assignment — and it is never
-- read by application code. It buys back two things a teacher-created class
-- needs and an administrator-created one already had:
--
--   * SELECT, so `INSERT ... RETURNING id` can see its own row. Without it the
--     class insert raises rather than returning: at that instant there is no
--     assignment, so no existing SELECT policy matches.
--   * DELETE while the class is still empty, which is what makes
--     `rollbackClass` in app/onboarding/actions.ts actually take. Its failure
--     mode is quiet and nasty — a class row whose name the teacher can then
--     never reuse, and an assignment that has flipped their whole account to v2
--     scope with no roster behind it.
--
-- Both are bounded by the row being the caller's own creation, and the delete
-- additionally by the class holding no enrolment and no other teacher — an
-- undo, never a way to destroy a class that has become real. There is still no
-- teacher UPDATE on `classes`: renaming stays administrator-only, exactly as
-- `renameClass` tells teachers it does.
--
-- WHO COUNTS AS A TEACHER OF A SCHOOL
-- `is_school_teacher()` admits two things, and BOTH are written by somebody
-- other than the caller:
--
--   1. a staff grant in that school — owner / principal / school_admin /
--      teacher. `user_roles` is administrator-write (00003); the only two
--      writers are 00017's RPC (which grants you `owner` on a school you just
--      created) and 00022's approval (which a second person must perform);
--   2. an active `teacher_assignments` row in that school — the
--      administrator-provisioned teacher, who may hold no role row at all
--      (`assignTeacher` in app/admin/actions.ts writes the assignment and
--      nothing else).
--
-- ★ `profiles.school_id` IS DELIBERATELY NOT ONE OF THEM, and that was the
-- first version of this function. `profiles_insert_own` / `profiles_update_own`
-- (00002) let any signed-in user set their OWN `school_id` to any school id
-- they can name — the column is a home-school hint, not a membership record.
-- Trusting it here would have let a stranger self-declare into a school and
-- then create grades and classes in it. (The pre-existing consequence, that
-- `current_school_ids()` reads the same column and so exposes a school's
-- reference data to a self-declared member, is untouched by this migration and
-- is a separate matter; what must not happen is a self-declared WRITE.)
-- lib/rbac's "a signed-in user with no user_roles row resolves to ['teacher']"
-- is about which UI a lone account sees, and is not a claim about which school
-- it belongs to — it names no school at all.
--
-- Branch 2 cannot bootstrap itself: the only self-insert this migration adds to
-- `teacher_assignments` requires a class whose `created_by` is the caller, and
-- creating that class already required this function to return true.
--
-- A parent is excluded by construction: nothing writes a staff grant or an
-- assignment for them. This function is only ever a gate on creating structure;
-- it widens no read.
--
-- IDEMPOTENT: guarded ADD COLUMN / CREATE INDEX, and DROP POLICY IF EXISTS
-- before each CREATE POLICY, matching 00003.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Provenance: who made this class
-- -----------------------------------------------------------------------------
-- Existing rows keep NULL. That is correct rather than lazy: nothing can say
-- who created a class made before this column, and a wrong guess (say, the
-- oldest homeroom assignment) would hand a teacher the delete right on a class
-- an administrator built. NULL simply never equals auth.uid(), so an old class
-- behaves exactly as it did — assignment-scoped read, administrator-only write.
ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- The default is what lets the application stay silent about the column: the
-- insert in `createClassAndAssign` sends grade, year, name and track, and the
-- browser never sends an identity. An administrator's insert is stamped too,
-- which is only ever useful.
ALTER TABLE public.classes
    ALTER COLUMN created_by SET DEFAULT auth.uid();

COMMENT ON COLUMN public.classes.created_by IS
    'Who created this class (auth.uid() at insert). Provenance, and the key the
     teacher self-assignment policy in 00031 is written on. NULL for classes
     created before 00031. Confers no access to pupils, marks or enrolments.';

-- The policies below look this column up per row; without the index every
-- teacher-side class insert seq-scans `classes`.
CREATE INDEX IF NOT EXISTS idx_classes_created_by ON public.classes(created_by);

-- -----------------------------------------------------------------------------
-- 2. Who is a teacher of a school
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason as every helper in 00003: a policy that
-- reads `user_roles` and `profiles` inline re-enters their own RLS. search_path
-- is pinned so the definer's rights cannot be redirected.
CREATE OR REPLACE FUNCTION public.is_school_teacher(target_school UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT target_school IS NOT NULL AND (
        -- 1. an explicit staff-side grant in this school. Written only by
        --    create_teacher_organisation (00017) and approve_join_request
        --    (00022); user_roles itself is administrator-write.
        public.has_school_role(target_school,
                               ARRAY['owner','principal','school_admin','teacher'])
        -- 2. already teaching here, role row or not — an administrator gave
        --    them a class through teacher_assignments_admin_write and nothing
        --    else. This cannot bootstrap itself: the only self-insert on that
        --    table (below) needs a class this function already had to permit.
        OR EXISTS (
            SELECT 1 FROM public.teacher_assignments ta
              JOIN public.academic_years ay ON ay.id = ta.academic_year_id
             WHERE ta.teacher_id = auth.uid()
               AND ta.status = 'active'
               AND ay.school_id = target_school
        )
    );
$$;

COMMENT ON FUNCTION public.is_school_teacher(UUID) IS
    'True when the caller teaches at target_school: a staff role grant there, or
     an active teacher_assignment in it. Deliberately does NOT read
     profiles.school_id, which any user may write for themselves (00002).
     Strictly weaker than is_school_admin(), and used only to gate creating
     structure — it widens no read. Excludes parents, who hold neither.';

GRANT EXECUTE ON FUNCTION public.is_school_teacher(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2b. Two lookups that MUST be SECURITY DEFINER, not inline
-- -----------------------------------------------------------------------------
-- ★ THE POLICIES BELOW CROSS BETWEEN `classes` AND `teacher_assignments` IN
-- BOTH DIRECTIONS, AND 00003 ALREADY CROSSES ONE OF THEM. Written inline,
-- "an assignment onto a class I created" makes Postgres evaluate the `classes`
-- SELECT policy, which (`classes_select_assigned_or_admin`) reads
-- `teacher_assignments` — the relation whose policy it is already evaluating.
-- The result is not a slow query, it is a hard failure on every assignment
-- write in the product, including the administrator ones that worked before:
--
--     ERROR: 42P17 infinite recursion detected in policy for relation
--            "teacher_assignments"
--
-- caught by scripts/validate-rls.mjs against a real database. Both lookups
-- therefore live in definers, which run as the owner and so do not re-enter
-- RLS — the same device, and the same reason, as `current_school_ids()` and
-- `is_school_admin()` in 00003.
CREATE OR REPLACE FUNCTION public.is_own_created_class(
    target_class UUID,
    target_year  UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.classes c
         WHERE c.id = target_class
           AND c.created_by IS NOT NULL
           AND c.created_by = auth.uid()
           AND (target_year IS NULL OR c.academic_year_id = target_year)
    );
$$;

COMMENT ON FUNCTION public.is_own_created_class(UUID, UUID) IS
    'True when the caller created this class — and, when target_year is given,
     when the class sits in that year. Reads classes as the owner so a policy on
     teacher_assignments can consult it without recursing (00031).';

-- "Nothing has happened here yet": no pupil enrolled, and no teacher on it but
-- the caller. This is what separates undoing a half-created class from deleting
-- a real one, and it is checked at DELETE time rather than trusted from when
-- the row was made.
CREATE OR REPLACE FUNCTION public.class_is_unused(target_class UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM public.student_enrollments se WHERE se.class_id = target_class
    ) AND NOT EXISTS (
        SELECT 1 FROM public.teacher_assignments ta
         WHERE ta.class_id = target_class AND ta.teacher_id <> auth.uid()
    );
$$;

COMMENT ON FUNCTION public.class_is_unused(UUID) IS
    'True when a class holds no enrolment and no assignment belonging to anyone
     but the caller. Bounds the creator DELETE policies in 00031 to an undo.';

GRANT EXECUTE ON FUNCTION public.is_own_created_class(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_is_unused(UUID)            TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. grades: a teacher may add a grade to their own school's level
-- -----------------------------------------------------------------------------
-- INSERT only. `grades_admin_write` keeps UPDATE and DELETE to administrators,
-- so a teacher can add ថ្នាក់ទី៣ to a level that lacks it and still cannot
-- rename or remove one — renaming is the dangerous half, because `grades.name`
-- is what `classes.name` is generated from.
--
-- A grade row grants no access to anything: `grades_select_member` already
-- shows every member all of them. The bound on `sort_order` is the curriculum
-- ladder's own 1–12, so a stray write cannot invent ថ្នាក់ទី៩៩.
DROP POLICY IF EXISTS "grades_teacher_insert" ON public.grades;
CREATE POLICY "grades_teacher_insert" ON public.grades
    FOR INSERT TO authenticated
    WITH CHECK (
        btrim(COALESCE(name, '')) <> ''
        AND sort_order BETWEEN 1 AND 12
        AND EXISTS (SELECT 1 FROM public.education_levels el
                     WHERE el.id = grades.education_level_id
                       AND public.is_school_teacher(el.school_id))
    );

-- -----------------------------------------------------------------------------
-- 4. classes: a teacher may create one in their own school
-- -----------------------------------------------------------------------------
-- Three conditions, and the third is the cross-school guard: `classes` points
-- at a grade and at an academic year independently, so without it a teacher
-- could file their school's year under another school's grade and hang a class
-- off a hierarchy that is not theirs.
DROP POLICY IF EXISTS "classes_teacher_insert" ON public.classes;
CREATE POLICY "classes_teacher_insert" ON public.classes
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (SELECT 1 FROM public.academic_years ay
                     WHERE ay.id = classes.academic_year_id
                       AND public.is_school_teacher(ay.school_id))
        AND EXISTS (SELECT 1 FROM public.grades g
                      JOIN public.education_levels el ON el.id = g.education_level_id
                      JOIN public.academic_years ay2 ON ay2.id = classes.academic_year_id
                     WHERE g.id = classes.grade_id
                       AND el.school_id = ay2.school_id)
    );

-- Read back your own creation. Needed at the instant of `INSERT ... RETURNING`,
-- when no assignment exists yet; harmless afterwards, when the assignment
-- policy already grants the same row. Permissive SELECT policies are ORed, so
-- `classes_select_assigned_or_admin` is untouched.
DROP POLICY IF EXISTS "classes_select_creator" ON public.classes;
CREATE POLICY "classes_select_creator" ON public.classes
    FOR SELECT USING (created_by = auth.uid());

-- The undo, and nothing more. A class stops being deletable the moment it holds
-- a pupil or a second teacher — from then on it is archived (assignment status),
-- never deleted, because every score, register and enrolment behind it is
-- ON DELETE CASCADE.
DROP POLICY IF EXISTS "classes_creator_delete_unused" ON public.classes;
CREATE POLICY "classes_creator_delete_unused" ON public.classes
    FOR DELETE USING (
        created_by = auth.uid()
        AND public.class_is_unused(classes.id)
    );

-- -----------------------------------------------------------------------------
-- 5. teacher_assignments: yourself, on a class you just created
-- -----------------------------------------------------------------------------
-- ★ THE ESCALATION SURFACE OF THIS MIGRATION. Both halves are load-bearing:
--   * `teacher_id = auth.uid()` — you may staff nobody but yourself.
--   * `c.created_by = auth.uid()` — onto no class but one you made. Without it
--     this policy would read a colleague's gradebook through 00006/00007.
-- The year must be the class's own, so an assignment cannot name a year from a
-- different school than the class it points at.
DROP POLICY IF EXISTS "teacher_assignments_creator_self_insert" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_creator_self_insert" ON public.teacher_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        teacher_id = auth.uid()
        AND public.is_own_created_class(teacher_assignments.class_id,
                                        teacher_assignments.academic_year_id)
    );

-- The matching undo. Deliberately not "a teacher may leave a class": archiving
-- is how a teacher steps away (it preserves the marks and the history), and
-- this is bounded to a class the caller created that still has no pupil in it.
DROP POLICY IF EXISTS "teacher_assignments_creator_self_delete" ON public.teacher_assignments;
CREATE POLICY "teacher_assignments_creator_self_delete" ON public.teacher_assignments
    FOR DELETE USING (
        teacher_id = auth.uid()
        AND public.is_own_created_class(teacher_assignments.class_id)
        AND public.class_is_unused(teacher_assignments.class_id)
    );

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- scripts/validate-rls.mjs §"teacher-created classes (00031)" proves the whole
-- of this against a real Postgres with real JWTs, including the denials. By
-- hand, as a plain `teacher` in a school someone else owns:
--
--   INSERT INTO grades (education_level_id, name, sort_order)
--        VALUES ('<own school level>', 'ថ្នាក់ទី៣', 3) RETURNING id;   -- 1 row
--   INSERT INTO classes (grade_id, academic_year_id, name)
--        VALUES (…, …, '៣ក') RETURNING id, created_by;                -- 1 row,
--                                                                     -- created_by = auth.uid()
--   INSERT INTO teacher_assignments (teacher_id, class_id, academic_year_id, is_homeroom)
--        VALUES (auth.uid(), '<that class>', …, true) RETURNING id;    -- 1 row
--
-- and the four denials that keep it narrow:
--
--   INSERT INTO teacher_assignments … class_id = '<a colleague''s class>'
--        -- new row violates row-level security policy   (not "my" class)
--   INSERT INTO teacher_assignments … teacher_id = '<somebody else>'
--        -- new row violates row-level security policy   (not myself)
--   INSERT INTO classes … academic_year_id = '<another school''s year>'
--        -- new row violates row-level security policy   (not my school)
--   UPDATE classes SET name = 'x' WHERE id = '<my own class>'
--        -- 0 rows: teachers still cannot rename, exactly as before
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Drop the policies first, then the function they call, then the column the
-- policies are written on — in that order, or the DROP FUNCTION fails on the
-- policies still depending on it. Dropping `created_by` loses provenance for
-- classes created while this was live; nothing in the application reads it, and
-- no access is lost, because an assignment (not the column) is what grants one.
--
-- BEGIN;
-- DROP POLICY IF EXISTS "teacher_assignments_creator_self_delete" ON public.teacher_assignments;
-- DROP POLICY IF EXISTS "teacher_assignments_creator_self_insert" ON public.teacher_assignments;
-- DROP POLICY IF EXISTS "classes_creator_delete_unused" ON public.classes;
-- DROP POLICY IF EXISTS "classes_select_creator"        ON public.classes;
-- DROP POLICY IF EXISTS "classes_teacher_insert"        ON public.classes;
-- DROP POLICY IF EXISTS "grades_teacher_insert"         ON public.grades;
-- DROP FUNCTION IF EXISTS public.is_own_created_class(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.class_is_unused(UUID);
-- DROP FUNCTION IF EXISTS public.is_school_teacher(UUID);
-- DROP INDEX  IF EXISTS public.idx_classes_created_by;
-- ALTER TABLE public.classes ALTER COLUMN created_by DROP DEFAULT;
-- ALTER TABLE public.classes DROP COLUMN IF EXISTS created_by;
-- COMMIT;
--
-- After a rollback, a plain `teacher` account is blocked from "បង្កើតថ្នាក់ថ្មី"
-- again and only an owner/principal/school_admin can create a class.
-- =============================================================================
