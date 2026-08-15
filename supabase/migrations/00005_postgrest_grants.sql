-- =============================================================================
-- 00005_postgrest_grants.sql
-- =============================================================================
-- Grant the PostgREST roles the table privileges they need.
--
-- WHY THIS EXISTS
-- Row Level Security filters *rows*; it does not grant *table* access. Postgres
-- checks the GRANT first, so a table with perfect RLS and no GRANT returns
--     42501  permission denied for table <t>
-- to every request — which is exactly what the whole schema did before this
-- migration.
--
-- Tables created by 00001-00003 run as the `postgres` role, whose default ACL
-- in this project hands anon/authenticated only Dxtm (TRUNCATE, REFERENCES,
-- TRIGGER, MAINTAIN). SELECT/INSERT/UPDATE/DELETE were never included, so the
-- application could not read a single row.
--
-- PRIVILEGE MODEL
--   authenticated → SELECT, INSERT, UPDATE, DELETE on every public table.
--                   RLS then narrows those rows to the caller's own data.
--   anon          → deliberately NO table privileges. The only public routes
--                   are '/' and '/login', and neither touches a table; sign-in
--                   goes through GoTrue's /auth endpoints, not PostgREST.
--   service_role  → full access (bypasses RLS by design; used by tooling only).
--
-- Idempotent and non-destructive.
-- =============================================================================

BEGIN;

-- Schema visibility. Without USAGE the role cannot even name an object.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- --- table privileges --------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Sequences, for any future identity/serial column.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL    ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- --- functions ---------------------------------------------------------------
-- The RLS policies in 00003 call these helpers as the *calling* role, so
-- `authenticated` needs EXECUTE or every policy evaluation fails.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- --- future objects ----------------------------------------------------------
-- Later migrations also run as `postgres`; without this they would reintroduce
-- the same breakage. Setting the default explicitly makes new tables usable
-- without anyone having to remember this file.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- --- anon: revoke anything inherited ----------------------------------------
-- Nothing in this application is public data. Revoking is cheap insurance
-- against a future default privilege quietly opening the schema up.
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- -- authenticated must hold SELECT on every table (expect 0 rows returned):
-- SELECT c.relname
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'r'
--    AND NOT has_table_privilege('authenticated', c.oid, 'SELECT');
--
-- -- anon must hold none (expect 0 rows returned):
-- SELECT c.relname
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'r'
--    AND has_table_privilege('anon', c.oid, 'SELECT');
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM authenticated;
-- =============================================================================
