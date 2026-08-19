-- =============================================================================
-- 00022_organisation_join_requests.sql
-- =============================================================================
-- Let a teacher find an existing school and ask to join it, and let that
-- school's administrators decide.
--
-- WHY AN RPC FOR SEARCH
-- `schools_select_member` (00002/00017) is deliberately membership-scoped: a
-- teacher can read only the school on their own profile. Correct — and it
-- makes discovery impossible: the one school a joiner needs to see is exactly
-- the one they do not belong to yet. Widening the SELECT policy would expose
-- every column (`settings`, `location`, contact details) to every account, so
-- discovery goes through `search_organisations()` instead — SECURITY DEFINER,
-- returning only the safe public fields (id, name, address, kind, levels).
-- No student data, no teacher lists, no counts.
--
-- WHY REQUESTS, NOT SELF-SERVICE MEMBERSHIP
-- Membership is `user_roles`, whose write policy is admin-only (00003) — and
-- must stay so: an account that can grant itself a role in any school can read
-- its roster. Clicking "join" therefore creates a `join_requests` row, which
-- carries no access at all; the school's admin approves or rejects it. The
-- decision RPCs are SECURITY DEFINER because approval writes `user_roles`,
-- and they re-check `is_school_admin()` themselves — the caller's claim is
-- never trusted.
--
-- The requester learns only their request's status. A rejection reveals
-- nothing about the school; an approval grants exactly the `teacher` role.
-- Class access still arrives the way it always has — an admin assignment in
-- `teacher_assignments` — so an approved joiner sees no student data until a
-- class is actually assigned to them.
--
-- REQUIRES: 00003 (user_roles, roles, is_school_admin), 00005 (grants),
--           00017 (schools.settings->>'self_serve', profiles.school_id use).
-- SAFETY: additive. No policy on any existing table is changed. Idempotent.
-- ROLLBACK: see foot.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.join_requests (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
    -- Optional note from the teacher ("ខ្ញុំបង្រៀនថ្នាក់ទី៥ក"). Free text the
    -- admin reads; never rendered as anything but text.
    message    TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ
);

-- One open request per teacher per school. Decided requests stay as history,
-- so the uniqueness is partial — a rejected teacher may ask again.
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_pending_uniq
    ON public.join_requests (school_id, user_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_join_requests_school ON public.join_requests(school_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user   ON public.join_requests(user_id);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Requester: create own pending request, watch it, withdraw it while pending.
DROP POLICY IF EXISTS "join_requests_insert_own" ON public.join_requests;
CREATE POLICY "join_requests_insert_own" ON public.join_requests
    FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "join_requests_select_own_or_admin" ON public.join_requests;
CREATE POLICY "join_requests_select_own_or_admin" ON public.join_requests
    FOR SELECT USING (user_id = auth.uid() OR public.is_school_admin(school_id));

DROP POLICY IF EXISTS "join_requests_delete_own_pending" ON public.join_requests;
CREATE POLICY "join_requests_delete_own_pending" ON public.join_requests
    FOR DELETE USING (user_id = auth.uid() AND status = 'pending');

-- No UPDATE policy at all, on purpose: state changes only through the two
-- SECURITY DEFINER functions below, so a decision can never be forged, undone,
-- or made without its side effects.

GRANT SELECT, INSERT, DELETE ON public.join_requests TO authenticated;
GRANT ALL ON public.join_requests TO service_role;

-- =============================================================================
-- Discovery
-- =============================================================================
-- Safe public projection only. `kind` is what onboarding stamps into settings;
-- `levels` are the education-level names, so search results can say what the
-- school teaches. Name match is case-insensitive substring — small data, and a
-- teacher types the school's real name, not keywords.
CREATE OR REPLACE FUNCTION public.search_organisations(p_query TEXT)
RETURNS TABLE (id UUID, name TEXT, address TEXT, kind TEXT, levels TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT s.id,
           s.name,
           s.address,
           s.settings->>'kind' AS kind,
           COALESCE(
               (SELECT array_agg(el.name ORDER BY el.sort_order)
                  FROM public.education_levels el WHERE el.school_id = s.id),
               '{}'::TEXT[]
           ) AS levels
      FROM public.schools s
     WHERE auth.uid() IS NOT NULL
       AND length(trim(p_query)) >= 2
       AND s.name ILIKE '%' || trim(p_query) || '%'
     ORDER BY s.name
     LIMIT 20;
$$;

COMMENT ON FUNCTION public.search_organisations(TEXT) IS
    'Level-aware school discovery for the join flow. SECURITY DEFINER because
     schools_select_member hides exactly the school a joiner needs to find;
     returns only safe public fields, never contacts, settings or counts.';

GRANT EXECUTE ON FUNCTION public.search_organisations(TEXT) TO authenticated;

-- =============================================================================
-- Decisions
-- =============================================================================
CREATE OR REPLACE FUNCTION public.approve_join_request(p_request UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    req  public.join_requests%ROWTYPE;
    v_teacher_role UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'មិនទាន់មានការចូលគណនី' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO req FROM public.join_requests WHERE id = p_request FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'រកមិនឃើញសំណើនេះទេ' USING ERRCODE = 'P0002';
    END IF;

    -- The caller must administer the school the request targets. Checked here,
    -- inside the definer, because nothing about the caller is trusted.
    IF NOT public.is_school_admin(req.school_id) THEN
        RAISE EXCEPTION 'អ្នកមិនមានសិទ្ធិសម្រេចលើសំណើនេះទេ' USING ERRCODE = '28000';
    END IF;

    -- Nobody approves their own request, admin or not — the reviewer must be a
    -- second person.
    IF req.user_id = auth.uid() THEN
        RAISE EXCEPTION 'មិនអាចអនុម័តសំណើរបស់ខ្លួនឯងបានទេ' USING ERRCODE = '28000';
    END IF;

    IF req.status <> 'pending' THEN
        RAISE EXCEPTION 'សំណើនេះត្រូវបានសម្រេចរួចហើយ' USING ERRCODE = '22023';
    END IF;

    SELECT r.id INTO v_teacher_role FROM public.roles r WHERE r.name = 'teacher';
    IF v_teacher_role IS NULL THEN
        RAISE EXCEPTION 'រកមិនឃើញតួនាទីគ្រូបង្រៀន' USING ERRCODE = 'P0002';
    END IF;

    -- Membership. Exactly the `teacher` role — approval never grants admin.
    INSERT INTO public.user_roles (user_id, role_id, school_id)
    VALUES (req.user_id, v_teacher_role, req.school_id)
    ON CONFLICT (user_id, role_id, school_id) DO NOTHING;

    -- Home school, only if they have none — joining must not silently move a
    -- teacher who already belongs somewhere.
    UPDATE public.profiles
       SET school_id = req.school_id
     WHERE id = req.user_id AND school_id IS NULL;

    UPDATE public.join_requests
       SET status = 'approved', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_join_request(p_request UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
    req public.join_requests%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'មិនទាន់មានការចូលគណនី' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO req FROM public.join_requests WHERE id = p_request FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'រកមិនឃើញសំណើនេះទេ' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_school_admin(req.school_id) THEN
        RAISE EXCEPTION 'អ្នកមិនមានសិទ្ធិសម្រេចលើសំណើនេះទេ' USING ERRCODE = '28000';
    END IF;

    IF req.status <> 'pending' THEN
        RAISE EXCEPTION 'សំណើនេះត្រូវបានសម្រេចរួចហើយ' USING ERRCODE = '22023';
    END IF;

    UPDATE public.join_requests
       SET status = 'rejected', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_join_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_join_request(UUID)  TO authenticated;

-- The requester's own requests, carrying the school's *name*. A definer for
-- the same reason as search: `schools_select_member` hides the row from a
-- non-member, so an embedded join would render their pending school nameless.
-- Strictly self-scoped — the WHERE is the security here.
CREATE OR REPLACE FUNCTION public.my_join_requests()
RETURNS TABLE (id UUID, school_id UUID, school_name TEXT, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
    SELECT jr.id, jr.school_id, s.name, jr.status, jr.created_at
      FROM public.join_requests jr
      JOIN public.schools s ON s.id = jr.school_id
     WHERE jr.user_id = auth.uid()
     ORDER BY jr.created_at DESC
     LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.my_join_requests() TO authenticated;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- Policies (expect 3: delete_own_pending, insert_own, select_own_or_admin):
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'join_requests' ORDER BY 1;
--
-- -- A teacher cannot write membership directly (RLS on user_roles unchanged):
-- --   INSERT INTO user_roles ...  as a plain teacher → 0 rows / 42501.
--
-- -- A second pending request for the same school must fail:
-- --   ERROR: duplicate key value violates "join_requests_pending_uniq"
--
-- -- search_organisations('ភ្នំពេញ') returns id/name/address/kind/levels only.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- All four functions, then the table. `my_join_requests()` is easy to miss —
-- it is the only one that takes no argument and the only one not called from
-- an admin screen — but it is SECURITY DEFINER like the rest, so leaving it
-- behind leaves a privileged function reading a table that no longer exists.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.approve_join_request(UUID);
-- DROP FUNCTION IF EXISTS public.reject_join_request(UUID);
-- DROP FUNCTION IF EXISTS public.search_organisations(TEXT);
-- DROP FUNCTION IF EXISTS public.my_join_requests();
-- DROP TABLE IF EXISTS public.join_requests CASCADE;
-- COMMIT;
-- =============================================================================
