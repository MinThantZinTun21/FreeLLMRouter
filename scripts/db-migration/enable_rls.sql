-- RLS setup (run manually as neondb_owner). Replace <secure> first.
SET client_min_messages = WARNING;

\echo ''
\echo '== Roles & grants =='
\echo ''

\echo 'Create role: fma_app'
\echo ''
DO $$ BEGIN
  CREATE ROLE fma_app LOGIN PASSWORD '<app_password>' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE fma_app PASSWORD '<app_password>';

\echo 'Create role: fma_admin'
\echo ''
DO $$ BEGIN
  CREATE ROLE fma_admin LOGIN PASSWORD '<admin_password>' NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE fma_admin PASSWORD '<admin_password>';

\echo 'Create role: fma_stats'
\echo ''
DO $$ BEGIN
  CREATE ROLE fma_stats LOGIN PASSWORD '<stats_password>' NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER ROLE fma_stats PASSWORD '<stats_password>';

\echo 'Grant role membership: fma_admin -> neondb_owner'
\echo ''
GRANT fma_admin TO neondb_owner;

\echo 'Grant schema usage'
\echo ''
GRANT USAGE ON SCHEMA public TO fma_app;
GRANT USAGE ON SCHEMA public TO fma_admin;
GRANT USAGE ON SCHEMA public TO fma_stats;

\echo 'Grant schema create to fma_admin'
\echo ''
GRANT CREATE ON SCHEMA public TO fma_admin;

\echo 'Grant table privileges to fma_app'
\echo ''
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, api_keys, api_request_logs, model_feedback TO fma_app;
GRANT SELECT, INSERT, UPDATE ON free_models, sync_meta TO fma_app;
GRANT SELECT, INSERT, UPDATE ON model_availability_snapshots TO fma_app;
GRANT SELECT, INSERT ON site_feedback TO fma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON verifications TO fma_app;

\echo 'Grant table and sequence privileges to fma_admin'
\echo ''
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fma_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fma_admin;

\echo 'Grant sequence usage to fma_app'
\echo ''
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fma_app;

\echo 'Set default privileges for future tables'
\echo ''
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fma_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO fma_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fma_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO fma_admin;

\echo ''
\echo '== Enable RLS =='
\echo ''

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE model_feedback FORCE ROW LEVEL SECURITY;

\echo ''
\echo '== RLS policies =='
\echo ''

\echo 'Policies: users'
\echo ''
DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_select ON users FOR SELECT
  USING (id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY users_update ON users FOR UPDATE
  USING (id = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (id = NULLIF(current_setting('app.user_id', true), ''));

\echo 'Policies: sessions'
\echo ''
DROP POLICY IF EXISTS sessions_select ON sessions;
DROP POLICY IF EXISTS sessions_insert ON sessions;
DROP POLICY IF EXISTS sessions_update ON sessions;
DROP POLICY IF EXISTS sessions_delete ON sessions;
CREATE POLICY sessions_select ON sessions FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY sessions_insert ON sessions FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY sessions_update ON sessions FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY sessions_delete ON sessions FOR DELETE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));

\echo 'Policies: accounts'
\echo ''
DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_delete ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY accounts_insert ON accounts FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY accounts_delete ON accounts FOR DELETE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));

\echo 'Policies: api_keys'
\echo ''
DROP POLICY IF EXISTS api_keys_select ON api_keys;
DROP POLICY IF EXISTS api_keys_insert ON api_keys;
DROP POLICY IF EXISTS api_keys_update ON api_keys;
DROP POLICY IF EXISTS api_keys_delete ON api_keys;
CREATE POLICY api_keys_select ON api_keys FOR SELECT
  USING (
    (key = NULLIF(current_setting('app.api_key_hash', true), '') AND enabled = true)
    OR user_id = NULLIF(current_setting('app.user_id', true), '')
  );
CREATE POLICY api_keys_insert ON api_keys FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY api_keys_update ON api_keys FOR UPDATE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''))
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY api_keys_delete ON api_keys FOR DELETE
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));

\echo 'Policies: api_request_logs'
\echo ''
DROP POLICY IF EXISTS logs_select ON api_request_logs;
DROP POLICY IF EXISTS logs_insert ON api_request_logs;
CREATE POLICY logs_select ON api_request_logs FOR SELECT
  USING (user_id = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY logs_insert ON api_request_logs FOR INSERT
  WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), ''));

\echo 'Policies: model_feedback'
\echo ''
DROP POLICY IF EXISTS feedback_select ON model_feedback;
DROP POLICY IF EXISTS feedback_insert ON model_feedback;
CREATE POLICY feedback_select ON model_feedback FOR SELECT
  USING (source = NULLIF(current_setting('app.user_id', true), ''));
CREATE POLICY feedback_insert ON model_feedback FOR INSERT
  WITH CHECK (source = NULLIF(current_setting('app.user_id', true), ''));

\echo ''
\echo '== Stats functions =='
\echo ''


CREATE OR REPLACE FUNCTION public.get_feedback_counts(
  start_ts timestamptz,
  end_ts timestamptz
)
RETURNS TABLE(model_id text, issue text, is_success boolean, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT model_id, issue, is_success, COUNT(*)
  FROM model_feedback
  WHERE created_at >= start_ts AND created_at < end_ts
  GROUP BY model_id, issue, is_success;
$$;

CREATE OR REPLACE FUNCTION public.get_error_timeline(
  start_ts timestamptz,
  end_ts timestamptz,
  bucket_interval interval DEFAULT '1 hour'
)
RETURNS TABLE(bucket timestamptz, model_id text, error_count bigint, total_count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_bin(bucket_interval, created_at, start_ts) AS bucket,
    model_id,
    COUNT(*) FILTER (WHERE is_success = false) AS error_count,
    COUNT(*) AS total_count
  FROM model_feedback
  WHERE created_at >= start_ts AND created_at < end_ts
  GROUP BY bucket, model_id
  ORDER BY bucket;
$$;

\echo 'Grant execute to fma_stats'
\echo ''
GRANT EXECUTE ON FUNCTION public.get_feedback_counts(timestamptz, timestamptz) TO fma_stats;
GRANT EXECUTE ON FUNCTION public.get_error_timeline(timestamptz, timestamptz, interval) TO fma_stats;

\echo 'Set function owner to fma_admin'
\echo ''
ALTER FUNCTION public.get_feedback_counts(timestamptz, timestamptz) OWNER TO fma_admin;
ALTER FUNCTION public.get_error_timeline(timestamptz, timestamptz, interval) OWNER TO fma_admin;

\echo 'Grant free_models select to fma_stats'
\echo ''
GRANT SELECT ON free_models TO fma_stats;
