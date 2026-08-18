-- =============================================================================
-- 00017_teacher_owned_organisation.sql
-- =============================================================================
-- Let a teacher create their own organisation, so onboarding can exist at all.
--
-- WHY
-- 00002 said of `public.schools`: "No blanket write policy — school
-- administration arrives with the RBAC layer in 00003." 00003 then built
-- `is_school_admin()` and applied it to seven tables — `academic_years`,
-- `education_levels`, `grades`, `classes`, `subjects`, `teacher_assignments`,
-- `student_enrollments` — but never came back for `schools` itself. The result
-- is that `schools` is the only table in the hierarchy with a SELECT policy and
-- no write policy, so a school can only be created out of band in the SQL
-- editor. Verified against the live schema:
--
--     schools           schools_select_member            SELECT
--     academic_years    academic_years_admin_write       ALL      ← has one
--     education_levels  education_levels_admin_write     ALL      ← has one
--     grades            grades_admin_write               ALL      ← has one
--     classes           classes_admin_write              ALL      ← has one
--
-- That is a deadlock, not a gap. Both halves were reproduced as an
-- `authenticated` user before this migration was written:
--
--     INSERT INTO schools    → new row violates row-level security policy
--     INSERT INTO user_roles → new row violates row-level security policy
--     is_school_admin(…)     → false
--
-- A teacher cannot create a school, and cannot grant themselves the role that
-- would let them, because granting it requires already holding it. So every
-- account that signs up without an administrator provisioning it top-down falls
-- through to the legacy `teacher_id` scope in `lib/utils/queryFilter.ts` and
-- behaves as though the account *is* the class — the original pre-V2 model that
-- 00003 was written to replace.
--
-- WHAT THIS FIXES, AND HOW NARROWLY
-- Nothing about the authorisation model is wrong; only its entry point is
-- missing. `is_school_admin()` already accepts 'owner', and every hierarchy
-- write policy already routes through it. So a teacher holding 'owner' on a
-- school they created can already create that school's education levels,
-- grades, classes, their own assignment and their enrolments — with no policy
-- change whatsoever. This migration therefore adds exactly one thing: an
-- atomic, self-service way to reach that first 'owner' row.
--
-- SECURITY DEFINER is not a shortcut here, it is the only option: the app holds
-- no service-role key (see CLAUDE.md — every data path runs through RLS as the
-- logged-in user), so there is no elevated context anywhere else to do this in.
-- Because the function is the entire privilege-escalation surface of the
-- feature, it is kept deliberately small and defensive:
--
--   * `search_path` is pinned, so a caller cannot shadow `public`.
--   * EXECUTE is revoked from `public`/`anon`; only `authenticated` may call.
--   * Every row it writes is keyed on `auth.uid()`. It takes no identifiers
--     from the caller, only a name and two constrained enums, so there is no
--     path by which it can touch a school the caller does not own.
--   * It refuses to run twice. Without that, a client retrying a failed request
--     creates unbounded schools — the classic SECURITY DEFINER footgun.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   * It does not alter, drop or widen a single existing policy. In particular
--     `classes_admin_write` is untouched: teachers do not get a general right
--     to create classes, only the specific right that owning a school confers.
--   * It adds no table and no column. `schools.settings` (JSONB, added in
--     00002) already carries the organisation kind, so the three types the
--     product needs — សាលារៀន / មជ្ឈមណ្ឌលអប់រំ / គ្រូឯករាជ្យ — cost no DDL.
--   * It does not seed education levels or grades. Those are ordinary inserts
--     the owner can now make through PostgREST, and keeping the national
--     curriculum ladder in the app means changing it does not need a migration.
--   * It does not touch the legacy path. An account with no assignments keeps
--     resolving to legacy scope exactly as before, and is migrated only if the
--     teacher opts in.
--
-- ONE NON-OBVIOUS DEPENDENCY
-- `schools_select_member` reads `profiles.school_id` — *not*
-- `user_roles.school_id`, even though `current_school_ids()` reads both. So
-- granting the role alone produces a school the creator cannot read back.
-- The profile must be stamped too, and it must be an INSERT ... ON CONFLICT
-- rather than an UPDATE: there is no trigger on `auth.users` and no code path
-- in the app that ever writes `profiles` (six read sites, zero writes), so for
-- a self-service signup the row does not exist yet and an UPDATE would report
-- success while affecting nothing.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.create_teacher_organisation(
    p_school_name TEXT,
    p_kind        TEXT DEFAULT 'school',
    p_year_name   TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user   UUID := auth.uid();
    v_name   TEXT := btrim(COALESCE(p_school_name, ''));
    v_school UUID;
    v_owner  UUID;
    v_start  INT;
    v_year   TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'មិនទាន់មានការចូលគណនី'
            USING ERRCODE = '28000';
    END IF;

    IF v_name = '' THEN
        RAISE EXCEPTION 'សូមបញ្ចូលឈ្មោះស្ថាប័ន'
            USING ERRCODE = '22023';
    END IF;

    IF p_kind NOT IN ('school', 'center', 'independent') THEN
        RAISE EXCEPTION 'ប្រភេទស្ថាប័នមិនត្រឹមត្រូវ'
            USING ERRCODE = '22023';
    END IF;

    -- One self-service organisation per teacher. A teacher who genuinely needs
    -- a second one is past the point where self-service is the right tool, and
    -- an administrator can still create it for them.
    IF EXISTS (
        SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
         WHERE ur.user_id = v_user
           AND r.name = 'owner'
           AND ur.school_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'អ្នកមានស្ថាប័នរួចហើយ'
            USING ERRCODE = '23505';
    END IF;

    SELECT id INTO v_owner FROM public.roles WHERE name = 'owner';
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'រកមិនឃើញតួនាទីម្ចាស់ស្ថាប័ន'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.schools (name, settings)
    VALUES (
        v_name,
        jsonb_build_object('kind', p_kind, 'self_serve', true)
    )
    RETURNING id INTO v_school;

    INSERT INTO public.user_roles (user_id, role_id, school_id)
    VALUES (v_user, v_owner, v_school);

    -- Load-bearing, see header: schools_select_member reads profiles.school_id,
    -- and for a self-service signup that row does not exist yet.
    INSERT INTO public.profiles (id, school_id)
    VALUES (v_user, v_school)
    ON CONFLICT (id) DO UPDATE SET school_id = EXCLUDED.school_id;

    -- The Cambodian school year runs November → October, matching
    -- getCurrentAcademicYear() in lib/constants/academic.ts. Computed rather
    -- than defaulted to a literal so this cannot go stale the way
    -- FALLBACK_ACADEMIC_YEAR ('2023-2024') did.
    v_year := NULLIF(btrim(COALESCE(p_year_name, '')), '');
    IF v_year IS NULL THEN
        v_start := EXTRACT(YEAR FROM CURRENT_DATE)::INT
                 - CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 11 THEN 0 ELSE 1 END;
        v_year  := v_start::TEXT || '-' || (v_start + 1)::TEXT;
    END IF;

    INSERT INTO public.academic_years (school_id, name, is_active)
    VALUES (v_school, v_year, true);

    RETURN v_school;
END;
$$;

COMMENT ON FUNCTION public.create_teacher_organisation(TEXT, TEXT, TEXT) IS
    'Creates a school owned by the calling teacher and returns its id. The only
     way into the V2 hierarchy without an administrator: closes the bootstrap
     deadlock left by 00002/00003, where schools had no write policy and
     user_roles could only be written by someone who already held the role.
     Grants ''owner'' on the new school and stamps profiles.school_id, which
     schools_select_member requires. Refuses a second call per teacher.';

REVOKE ALL   ON FUNCTION public.create_teacher_organisation(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_teacher_organisation(TEXT, TEXT, TEXT) TO authenticated;
