-- =============================================================================
-- 00030_audit_logs_select_own.sql
-- =============================================================================
-- Let an actor read back the entries they themselves wrote.
--
-- WHY
-- `audit_logs` (00003) has exactly two policies: `audit_logs_insert_self`
-- (`actor_id = auth.uid()`) and `audit_logs_select_admin`
-- (`is_school_admin(school_id)`). So a teacher writes to the trail on every
-- save and can read none of it — including their own lines.
--
-- The dashboard's "សកម្មភាពថ្មីៗ" answers "what did I last do for this class",
-- which is the one question the four figures above it cannot: a teacher who
-- entered January's Khmer marks yesterday sees the same completion bar today
-- and has no way to tell whether they or a colleague moved it. Built on the
-- admin-only policy that section would render empty for every teacher, for
-- ever — a feature that only its author's account can see is not a feature.
--
-- WHAT THIS DOES AND DOES NOT WIDEN
-- Adds ONE policy: `actor_id = auth.uid()`. A user may read the rows they
-- wrote. It grants nothing about anyone else's actions, nothing school-wide,
-- and it does not touch the admin policy — `/admin/audit-logs` keeps reading
-- the whole school exactly as before. Postgres ORs multiple permissive SELECT
-- policies, so this is strictly additive.
--
-- The trail stays append-only: no UPDATE and no DELETE policy exists, and none
-- is added here, so a user can read their own history and still cannot rewrite
-- it. `actor_id` itself is not forgeable — the INSERT policy has always checked
-- it against `auth.uid()`.
--
-- NO INDEX IS ADDED. The feed reads newest-first filtered to one actor, and
-- 00003 already creates exactly that index — `idx_audit_logs_actor` on
-- (actor_id, created_at DESC). It was built for the admin console's per-actor
-- filter and serves this read unchanged. Adding a second one under the same
-- name would be a no-op; adding one under a different name would be a
-- duplicate the planner never picks.
--
-- IDEMPOTENT: DROP ... IF EXISTS before CREATE, matching every policy in 00003.
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS "audit_logs_select_own" ON public.audit_logs;
CREATE POLICY "audit_logs_select_own" ON public.audit_logs
    FOR SELECT USING (actor_id = auth.uid());

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- As a signed-in teacher who has saved a score:
--   SELECT count(*) FROM public.audit_logs;          -- > 0, was always 0
--   SELECT DISTINCT actor_id FROM public.audit_logs; -- exactly auth.uid()
-- As an administrator, /admin/audit-logs is unchanged: the admin policy still
-- returns the whole school, because permissive SELECT policies are ORed.
-- Neither role can write:
--   UPDATE public.audit_logs SET action = 'x';       -- 0 rows, no policy
--   DELETE FROM public.audit_logs;                   -- 0 rows, no policy
--
-- ROLLBACK (manual, if ever needed):
--   DROP POLICY IF EXISTS "audit_logs_select_own" ON public.audit_logs;
-- That is the whole of it: one policy in, one policy out. Do NOT also drop
-- `idx_audit_logs_actor` — it belongs to 00003, not to this migration.
-- Nothing else is touched: no column, no data, no other policy.
