-- =============================================================================
-- 00032_homework_assignments_class_scope.sql
-- =============================================================================
-- Give a published homework assignment a class.
--
-- THE DEFECT
-- `homework_assignments` is the only feature table in the product with no class
-- dimension at all. `getAssignments()` reads `.eq('teacher_id', user.id)` and
-- nothing else, `/homework/send` appears in neither `CLASS_SCOPED_ROUTES` nor
-- any server scope resolution, and the parent-side policy from 00010 matches on
-- `is_teacher_of_my_child(teacher_id)`.
--
-- Two consequences, one on each side of the wire:
--
--   teacher   Holding ៥ក and ៦ក, they see ONE merged list of assignments with
--             no way to say which class an item belongs to and no way to filter.
--             Every other class-scoped screen in the app follows the active
--             class; this one silently does not.
--
--   parent    An assignment written for ៥ក is readable by every parent of every
--             pupil the teacher teaches — ៦ក's parents included. The reach is
--             "this teacher", because "this class" was not expressible.
--
-- Phase 0 recorded this as P0-2. See docs/phase0-ux-audit.md §3.
--
-- WHY A COLUMN AND NOT A JOIN
-- There is nothing to join through. An assignment has no per-child rows, no
-- recipients and no receipts — `HomeworkSendClient` is explicit that it never
-- claims otherwise — so the class cannot be derived from anything already
-- stored. The audit's rule was "no migrations for UX work"; this is not UX
-- work. It is the one place in Phase 1 where the existing data model provably
-- cannot answer the question, so the column is added rather than faked.
--
-- WHY NULLABLE, AND WHY NOTHING IS BACKFILLED
-- A NULL `class_id` means "written before assignments had a class", and it is
-- given EXACTLY the meaning it has today: readable by every parent of every
-- pupil the teacher teaches. There is no safe backfill — an existing row was
-- genuinely addressed to the teacher's whole audience, and stamping it with one
-- of their classes would retroactively withdraw it from the others' parents.
-- A pre-V2 teacher has no class to stamp at all, and must keep working.
--
-- So: every row that exists on the day this runs keeps its exact reach, and
-- only rows written afterwards are narrowed. That is what makes the SELECT
-- policy below a strict addition rather than a change.
--
-- THE DANGEROUS WRITE, AND WHAT MAKES IT SAFE
-- `class_id` is not an attribute of the row; it is an ADDRESS. A teacher who
-- could stamp any UUID could publish into a colleague's class and reach parents
-- they do not teach — a write that widens a read, which is the same shape as
-- the `teacher_assignments` hole 00031 was careful about. The INSERT and UPDATE
-- policies are therefore REPLACED, not supplemented: permissive policies are
-- ORed, so adding a stricter one beside `auth.uid() = teacher_id` would have
-- restricted nothing. The new checks say the caller must actually hold an
-- active assignment on the class they are stamping.
--
-- Written inline rather than as a SECURITY DEFINER helper, for the reason 00031
-- gives: a policy stays visible to `\d+`, to `pg_policies` and to
-- scripts/validate-rls.mjs. There is no recursion to avoid here — the predicate
-- reads `teacher_assignments`, whose own policies never read this table.
--
-- `is_class_of_my_child()` IS a definer function, matching `is_parent_of` and
-- `is_teacher_of_my_child` from 00010: it walks `parent_students` and
-- `student_enrollments` on behalf of a parent, which is exactly the read those
-- two already do under definer rights.
--
-- ROLLBACK
--   BEGIN;
--   DROP POLICY IF EXISTS "homework_assignments_select_own_or_parent" ON public.homework_assignments;
--   CREATE POLICY "homework_assignments_select_own_or_parent" ON public.homework_assignments
--       FOR SELECT USING (auth.uid() = teacher_id OR public.is_teacher_of_my_child(teacher_id));
--   DROP POLICY IF EXISTS "homework_assignments_insert_own_class" ON public.homework_assignments;
--   DROP POLICY IF EXISTS "homework_assignments_update_own_class" ON public.homework_assignments;
--   CREATE POLICY "Teachers can insert their own assignments" ON public.homework_assignments
--       FOR INSERT WITH CHECK (auth.uid() = teacher_id);
--   CREATE POLICY "Teachers can update their own assignments" ON public.homework_assignments
--       FOR UPDATE USING (auth.uid() = teacher_id);
--   DROP INDEX IF EXISTS public.idx_homework_assignments_teacher_class;
--   ALTER TABLE public.homework_assignments DROP COLUMN IF EXISTS class_id;
--   DROP FUNCTION IF EXISTS public.is_class_of_my_child(UUID);
--   COMMIT;
-- Dropping the column loses which class each new assignment was for; nothing
-- else in the product reads it, and every row stays readable.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The column
-- -----------------------------------------------------------------------------
-- ON DELETE SET NULL, never CASCADE: removing a class must not silently destroy
-- the homework history written for it. The row degrades to its pre-00032
-- meaning, which is a defined state rather than a dangling reference.
ALTER TABLE public.homework_assignments
    ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.homework_assignments.class_id IS
    'The class this assignment was published to. NULL means it predates 00032 '
    'and keeps its original reach: every parent of every pupil the teacher teaches.';

-- The teacher's own list is read `WHERE teacher_id = ? AND (class_id = ? OR
-- class_id IS NULL)`, ordered by `created_at`. 00001 already indexes
-- `teacher_id` alone; this is the composite that predicate actually wants.
CREATE INDEX IF NOT EXISTS idx_homework_assignments_teacher_class
    ON public.homework_assignments(teacher_id, class_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. The parent-side predicate
-- -----------------------------------------------------------------------------
-- True when one of the caller's children is enrolled in this class.
--
-- `status = 'active'` deliberately, NOT the `.neq('withdrawn')` rule the roster
-- reads use. Those answer "who was ever in this class", which a historical
-- report needs; this answers "who should be handed today's homework", and a
-- pupil promoted out of ៥ក last year must not keep receiving its assignments.
-- The same distinction `is_teacher_of_my_child` already draws.
CREATE OR REPLACE FUNCTION public.is_class_of_my_child(cls UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.parent_students ps
          JOIN public.student_enrollments se ON se.student_id = ps.student_id
         WHERE ps.parent_id = auth.uid()
           AND se.class_id = cls
           AND se.status = 'active'
    );
$$;

COMMENT ON FUNCTION public.is_class_of_my_child(UUID) IS
    'True when a child of the caller is actively enrolled in this class. Read-only.';

-- -----------------------------------------------------------------------------
-- 3. Reading: unchanged for every row that exists today
-- -----------------------------------------------------------------------------
-- The teacher branch is untouched. The parent branch splits in two, and the
-- NULL half is character-for-character the policy 00010 wrote — so on the day
-- this migration runs, when every row has a NULL `class_id`, the effective
-- permission set is identical.
DROP POLICY IF EXISTS "homework_assignments_select_own_or_parent" ON public.homework_assignments;
CREATE POLICY "homework_assignments_select_own_or_parent" ON public.homework_assignments
    FOR SELECT USING (
        auth.uid() = teacher_id
        OR (
            class_id IS NULL
            AND public.is_teacher_of_my_child(teacher_id)
        )
        OR (
            class_id IS NOT NULL
            AND public.is_class_of_my_child(class_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 4. Writing: a teacher may only address a class they actually teach
-- -----------------------------------------------------------------------------
-- 00001's INSERT and UPDATE policies are DROPPED, not joined. A permissive
-- policy is ORed with its siblings, so leaving `auth.uid() = teacher_id`
-- standing would have made everything below decorative.
--
-- `class_id IS NULL` stays permitted: a pre-V2 teacher has no assignment row to
-- match, and publishing without a class is still the legacy behaviour.
DROP POLICY IF EXISTS "Teachers can insert their own assignments" ON public.homework_assignments;
DROP POLICY IF EXISTS "homework_assignments_insert_own_class" ON public.homework_assignments;
CREATE POLICY "homework_assignments_insert_own_class" ON public.homework_assignments
    FOR INSERT WITH CHECK (
        auth.uid() = teacher_id
        AND (
            class_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = homework_assignments.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active'
            )
        )
    );

DROP POLICY IF EXISTS "Teachers can update their own assignments" ON public.homework_assignments;
DROP POLICY IF EXISTS "homework_assignments_update_own_class" ON public.homework_assignments;
CREATE POLICY "homework_assignments_update_own_class" ON public.homework_assignments
    FOR UPDATE
    USING (auth.uid() = teacher_id)
    WITH CHECK (
        auth.uid() = teacher_id
        AND (
            class_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.teacher_assignments ta
                 WHERE ta.class_id = homework_assignments.class_id
                   AND ta.teacher_id = auth.uid()
                   AND ta.status = 'active'
            )
        )
    );

-- DELETE is untouched: 00001's "Teachers can delete their own assignments"
-- already says the only thing that matters, and a class never gated it.

-- -----------------------------------------------------------------------------
-- 5. PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
