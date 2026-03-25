--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql;


--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA graphql_public;


--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgbouncer;


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA vault;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'dynamic',
    'manual'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: wal_column; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_column AS (
	name text,
	type_name text,
	type_oid oid,
	value jsonb,
	is_pkey boolean,
	is_selectable boolean
);


--
-- Name: wal_rls; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.wal_rls AS (
	wal jsonb,
	is_rls_enabled boolean,
	subscription_ids uuid[],
	errors text[]
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;


--
-- Name: FUNCTION email(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.email() IS 'Deprecated. Use auth.jwt() -> ''email'' instead.';


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;


--
-- Name: FUNCTION role(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;


--
-- Name: FUNCTION uid(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: -
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $_$;


--
-- Name: current_school_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_school_id() RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
    -- Option A: school_id embedded in Supabase JWT custom claims
    -- Requires you to set this in your auth hook / JWT template
    RETURN NULLIF(current_setting('request.jwt.claims', TRUE)::jsonb ->> 'school_id', '')::INTEGER;
EXCEPTION
    WHEN OTHERS THEN
        -- Option B: fall back to session variable set by your API layer
        RETURN NULLIF(current_setting('app.current_school_id', TRUE), '')::INTEGER;
END;
$$;


--
-- Name: FUNCTION current_school_id(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.current_school_id() IS 'Returns the school_id of the currently authenticated user from JWT claims. Embed school_id in Supabase JWT custom claims for best performance.';


--
-- Name: log_event(character varying, character varying, integer, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_event(p_event_type character varying, p_entity_type character varying, p_entity_id integer, p_data jsonb, p_triggered_by integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_event_id INTEGER;
BEGIN
    INSERT INTO event_logs (event_type, entity_type, entity_id, data, triggered_by)
    VALUES (p_event_type, p_entity_type, p_entity_id, p_data, p_triggered_by)
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$;


--
-- Name: stamp_school_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_school_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_school_id INTEGER;
BEGIN
    v_school_id := current_school_id();
    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'school_id could not be determined from session context';
    END IF;
    NEW.school_id := v_school_id;
    RETURN NEW;
END;
$$;


--
-- Name: update_invoice_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE invoices
    SET 
        status = CASE 
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id) >= total_amount 
            THEN 'PAID'
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id) > 0 
            THEN 'PARTIAL'
            ELSE 'UNPAID'
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_notification_queue_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_queue_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: apply_rls(jsonb, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024)) RETURNS SETOF realtime.wal_rls
    LANGUAGE plpgsql
    AS $$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$$;


--
-- Name: broadcast_changes(text, text, text, text, text, record, record, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$$;


--
-- Name: build_prepared_statement_sql(text, regclass, realtime.wal_column[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) RETURNS text
    LANGUAGE sql
    AS $$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $$;


--
-- Name: cast(text, regtype); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime."cast"(val text, type_ regtype) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    declare
      res jsonb;
    begin
      execute format('select to_jsonb(%L::'|| type_::text || ')', val)  into res;
      return res;
    end
    $$;


--
-- Name: check_equality_op(realtime.equality_op, regtype, text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $$;


--
-- Name: is_visible_through_filters(realtime.wal_column[], realtime.user_defined_filter[]); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $_$;


--
-- Name: list_changes(name, name, integer, integer); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) RETURNS SETOF realtime.wal_rls
    LANGUAGE sql
    SET log_min_messages TO 'fatal'
    AS $$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $$;


--
-- Name: quote_wal2json(regclass); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.quote_wal2json(entity regclass) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $$;


--
-- Name: send(jsonb, text, text, boolean); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$$;


--
-- Name: subscription_check_filters(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.subscription_check_filters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE sql IMMUTABLE
    AS $$ select role_name::regrole $$;


--
-- Name: topic(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.topic() RETURNS text
    LANGUAGE sql STABLE
    AS $$
select nullif(current_setting('realtime.topic', true), '')::text;
$$;


--
-- Name: can_insert_object(text, text, uuid, jsonb); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


--
-- Name: delete_leaf_prefixes(text[], text[]); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$$;


--
-- Name: enforce_bucket_name_length(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.enforce_bucket_name_length() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


--
-- Name: get_level(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_level(name text) RETURNS integer
    LANGUAGE sql IMMUTABLE STRICT
    AS $$
SELECT array_length(string_to_array("name", '/'), 1);
$$;


--
-- Name: get_prefix(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefix(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$_$;


--
-- Name: get_prefixes(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_prefixes(name text) RETURNS text[]
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


--
-- Name: list_multipart_uploads_with_delimiter(text, text, text, integer, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text) RETURNS TABLE(key text, id text, created_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: operation(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.operation() RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


--
-- Name: protect_delete(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.protect_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: search(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_legacy_v1(text, text, integer, integer, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: academic_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_terms (
    id integer NOT NULL,
    year integer NOT NULL,
    term integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT academic_terms_term_check CHECK ((term = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: academic_terms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.academic_terms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: academic_terms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.academic_terms_id_seq OWNED BY public.academic_terms.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    student_id integer NOT NULL,
    class_id integer NOT NULL,
    date date NOT NULL,
    status character varying(20) NOT NULL,
    remarks text,
    marked_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT attendance_status_check CHECK (((status)::text = ANY ((ARRAY['PRESENT'::character varying, 'ABSENT'::character varying, 'LATE'::character varying, 'EXCUSED'::character varying])::text[])))
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    action character varying(100) NOT NULL,
    entity character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    grade_level integer,
    class_teacher_id integer,
    capacity integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.classes_id_seq OWNED BY public.classes.id;


--
-- Name: event_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_logs (
    id integer NOT NULL,
    event_type character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id integer,
    data jsonb,
    triggered_by integer,
    ip_address character varying(45),
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: event_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_logs_id_seq OWNED BY public.event_logs.id;


--
-- Name: exam_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_enrollments (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    student_id integer NOT NULL,
    enrollment_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_present boolean,
    status character varying(20) DEFAULT 'ENROLLED'::character varying,
    remarks text,
    enrolled_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT exam_enrollments_status_check CHECK (((status)::text = ANY ((ARRAY['ENROLLED'::character varying, 'COMPLETED'::character varying, 'WITHDRAWN'::character varying, 'ABSENT'::character varying])::text[])))
);


--
-- Name: TABLE exam_enrollments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exam_enrollments IS 'Tracks student enrollment in exams - allows selective enrollment';


--
-- Name: COLUMN exam_enrollments.is_present; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exam_enrollments.is_present IS 'NULL = not taken yet, TRUE = attended, FALSE = absent';


--
-- Name: COLUMN exam_enrollments.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exam_enrollments.status IS 'ENROLLED = registered, COMPLETED = took exam, WITHDRAWN = pulled out, ABSENT = no-show';


--
-- Name: exam_enrollments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_enrollments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_enrollments_id_seq OWNED BY public.exam_enrollments.id;


--
-- Name: exam_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_results (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    student_id integer NOT NULL,
    subject_id integer NOT NULL,
    marks numeric(5,2) NOT NULL,
    grade character varying(5),
    remarks text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: exam_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_results_id_seq OWNED BY public.exam_results.id;


--
-- Name: exam_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_subjects (
    id integer NOT NULL,
    exam_id integer NOT NULL,
    subject_name character varying(100) NOT NULL,
    max_marks integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exam_subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exam_subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exam_subjects_id_seq OWNED BY public.exam_subjects.id;


--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    term_id integer NOT NULL,
    exam_type character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    published_at timestamp without time zone,
    published_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT exams_exam_type_check CHECK (((exam_type)::text = ANY ((ARRAY['CAT'::character varying, 'MIDTERM'::character varying, 'ENDTERM'::character varying])::text[]))),
    CONSTRAINT exams_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'ARCHIVED'::character varying])::text[])))
);


--
-- Name: exams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exams_id_seq OWNED BY public.exams.id;


--
-- Name: fee_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fee_balances AS
SELECT
    NULL::integer AS invoice_id,
    NULL::integer AS school_id,
    NULL::integer AS student_id,
    NULL::character varying(50) AS admission_no,
    NULL::text AS student_name,
    NULL::character varying(100) AS class_name,
    NULL::integer AS year,
    NULL::integer AS term,
    NULL::numeric(10,2) AS total_amount,
    NULL::numeric AS paid_amount,
    NULL::numeric AS balance,
    NULL::character varying(20) AS status,
    NULL::character varying(20) AS parent_phone,
    NULL::character varying(200) AS parent_name;


--
-- Name: fee_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: fee_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_categories_id_seq OWNED BY public.fee_categories.id;


--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fee_structures (
    id integer NOT NULL,
    class_id integer NOT NULL,
    term_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fee_type character varying(50) DEFAULT 'TUITION'::character varying NOT NULL,
    description text,
    is_mandatory boolean DEFAULT true,
    school_id integer,
    CONSTRAINT fee_structures_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: fee_structures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fee_structures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fee_structures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fee_structures_id_seq OWNED BY public.fee_structures.id;


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    description character varying(200) NOT NULL,
    amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: invoice_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    student_id integer NOT NULL,
    term_id integer NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status character varying(20) DEFAULT 'UNPAID'::character varying,
    due_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT invoices_status_check CHECK (((status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: mpesa_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mpesa_transactions (
    id integer NOT NULL,
    transaction_id character varying(50) NOT NULL,
    phone_number character varying(20) NOT NULL,
    amount numeric(10,2) NOT NULL,
    account_reference character varying(50),
    transaction_date timestamp without time zone NOT NULL,
    mpesa_receipt_number character varying(50),
    first_name character varying(100),
    middle_name character varying(100),
    last_name character varying(100),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    reconciled_at timestamp without time zone,
    reconciled_by integer,
    payment_id integer,
    callback_data jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT mpesa_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'RECONCILED'::character varying])::text[])))
);


--
-- Name: mpesa_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.mpesa_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mpesa_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mpesa_transactions_id_seq OWNED BY public.mpesa_transactions.id;


--
-- Name: notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_queue (
    id integer NOT NULL,
    type character varying(20) NOT NULL,
    recipient character varying(100) NOT NULL,
    subject character varying(200),
    message text NOT NULL,
    priority integer DEFAULT 5,
    scheduled_for timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    student_id integer,
    related_entity_type character varying(50),
    related_entity_id integer,
    processed_at timestamp without time zone,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message_type character varying(50),
    school_id integer,
    CONSTRAINT notification_queue_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'SENT'::character varying, 'FAILED'::character varying])::text[]))),
    CONSTRAINT notification_queue_type_check CHECK (((type)::text = ANY ((ARRAY['SMS'::character varying, 'EMAIL'::character varying])::text[])))
);


--
-- Name: COLUMN notification_queue.message_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_queue.message_type IS 'Type of message: FEE_REMINDER, EXAM_RESULT, ATTENDANCE_ALERT, PAYMENT_CONFIRMATION, GENERAL, etc.';


--
-- Name: notification_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_queue_id_seq OWNED BY public.notification_queue.id;


--
-- Name: parent_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_contacts (
    id integer NOT NULL,
    student_id integer NOT NULL,
    relationship character varying(20) NOT NULL,
    name character varying(200) NOT NULL,
    phone character varying(20) NOT NULL,
    email character varying(100),
    id_number character varying(20),
    occupation character varying(100),
    is_primary boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT parent_contacts_relationship_check CHECK (((relationship)::text = ANY ((ARRAY['FATHER'::character varying, 'MOTHER'::character varying, 'GUARDIAN'::character varying])::text[])))
);


--
-- Name: parent_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.parent_contacts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parent_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.parent_contacts_id_seq OWNED BY public.parent_contacts.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(512) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_method character varying(20) NOT NULL,
    reference_number character varying(100),
    payment_date date NOT NULL,
    received_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'MPESA'::character varying, 'BANK'::character varying, 'CHEQUE'::character varying])::text[])))
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.students (
    id integer NOT NULL,
    admission_no character varying(50) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    middle_name character varying(100),
    date_of_birth date NOT NULL,
    gender character varying(10) NOT NULL,
    upi_number character varying(12),
    birth_certificate_number character varying(50),
    county character varying(50),
    sub_county character varying(50),
    special_needs boolean DEFAULT false,
    special_needs_category character varying(50),
    class_id integer NOT NULL,
    admission_date date NOT NULL,
    residence_type character varying(20),
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT students_gender_check CHECK (((gender)::text = ANY ((ARRAY['MALE'::character varying, 'FEMALE'::character varying])::text[]))),
    CONSTRAINT students_residence_type_check CHECK (((residence_type)::text = ANY ((ARRAY['BOARDING'::character varying, 'DAY'::character varying])::text[]))),
    CONSTRAINT students_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'TRANSFERRED'::character varying, 'COMPLETED'::character varying, 'DROPPED'::character varying])::text[])))
);


--
-- Name: pending_mpesa_transactions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.pending_mpesa_transactions AS
 SELECT mt.id,
    mt.school_id,
    mt.transaction_id,
    mt.mpesa_receipt_number,
    mt.phone_number,
    mt.amount,
    mt.account_reference,
    mt.transaction_date,
    mt.status,
    s.id AS student_id,
    s.admission_no,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS student_name
   FROM (public.mpesa_transactions mt
     LEFT JOIN public.students s ON ((((mt.account_reference)::text = (s.admission_no)::text) AND (s.school_id = mt.school_id))))
  WHERE (((mt.status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying])::text[])) AND (mt.reconciled_at IS NULL))
  ORDER BY mt.transaction_date DESC;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id integer NOT NULL,
    user_id integer NOT NULL,
    token character varying(512) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_revoked boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: school_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_config (
    id integer NOT NULL,
    config_key character varying(100) NOT NULL,
    config_value text,
    is_encrypted boolean DEFAULT false,
    description text,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_by integer
);


--
-- Name: school_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.school_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: school_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.school_config_id_seq OWNED BY public.school_config.id;


--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    short_name character varying(50),
    slug character varying(100) NOT NULL,
    email character varying(100),
    phone character varying(20),
    address text,
    county character varying(50),
    sub_county character varying(50),
    nemis_code character varying(50),
    registration_number character varying(50),
    plan character varying(20) DEFAULT 'FREE'::character varying NOT NULL,
    plan_expires_at timestamp without time zone,
    max_students integer DEFAULT 500,
    max_users integer DEFAULT 10,
    mpesa_enabled boolean DEFAULT false,
    mpesa_shortcode character varying(20),
    mpesa_consumer_key character varying(255),
    mpesa_consumer_secret character varying(255),
    mpesa_passkey character varying(255),
    mpesa_environment character varying(10) DEFAULT 'sandbox'::character varying,
    sms_enabled boolean DEFAULT false,
    sms_provider character varying(50) DEFAULT 'africas_talking'::character varying,
    sms_api_key character varying(255),
    sms_username character varying(100),
    sms_sender_id character varying(20) DEFAULT 'SCHOOL'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT schools_mpesa_environment_check CHECK (((mpesa_environment)::text = ANY ((ARRAY['sandbox'::character varying, 'production'::character varying])::text[]))),
    CONSTRAINT schools_plan_check CHECK (((plan)::text = ANY ((ARRAY['FREE'::character varying, 'BASIC'::character varying, 'PRO'::character varying, 'ENTERPRISE'::character varying])::text[])))
);


--
-- Name: TABLE schools; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schools IS 'Root tenant table — one row per school';


--
-- Name: COLUMN schools.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schools.slug IS 'Unique URL-safe identifier used in subdomains / API paths';


--
-- Name: COLUMN schools.plan; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schools.plan IS 'Subscription tier controlling feature access and limits';


--
-- Name: COLUMN schools.mpesa_consumer_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schools.mpesa_consumer_key IS 'Encrypt at the application layer before storing';


--
-- Name: schools_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schools_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schools_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schools_id_seq OWNED BY public.schools.id;


--
-- Name: sms_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_logs (
    id integer NOT NULL,
    recipient_phone character varying(20) NOT NULL,
    message text NOT NULL,
    message_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    provider_message_id character varying(100),
    cost numeric(5,2),
    student_id integer,
    invoice_id integer,
    payment_id integer,
    mpesa_transaction_id integer,
    sent_at timestamp without time zone,
    delivered_at timestamp without time zone,
    failed_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer,
    CONSTRAINT sms_logs_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENT'::character varying, 'DELIVERED'::character varying, 'FAILED'::character varying])::text[])))
);


--
-- Name: sms_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sms_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sms_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sms_logs_id_seq OWNED BY public.sms_logs.id;


--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    id integer NOT NULL,
    user_id integer NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(20),
    email character varying(100),
    employee_number character varying(50),
    "position" character varying(100),
    department character varying(100),
    hire_date date,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    school_id integer
);


--
-- Name: staff_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_attendance (
    id integer NOT NULL,
    staff_id integer NOT NULL,
    date date NOT NULL,
    status character varying(10) NOT NULL,
    marked_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT staff_attendance_status_check CHECK (((status)::text = ANY ((ARRAY['PRESENT'::character varying, 'ABSENT'::character varying])::text[])))
);


--
-- Name: staff_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_attendance_id_seq OWNED BY public.staff_attendance.id;


--
-- Name: staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.staff_id_seq OWNED BY public.staff.id;


--
-- Name: student_attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_attendance (
    id integer NOT NULL,
    student_id integer NOT NULL,
    class_id integer NOT NULL,
    date date NOT NULL,
    status character varying(10) NOT NULL,
    marked_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT student_attendance_status_check CHECK (((status)::text = ANY ((ARRAY['PRESENT'::character varying, 'ABSENT'::character varying])::text[])))
);


--
-- Name: student_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.student_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: student_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.student_attendance_id_seq OWNED BY public.student_attendance.id;


--
-- Name: student_parent_contacts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.student_parent_contacts AS
 SELECT s.id AS student_id,
    s.school_id,
    s.admission_no,
    s.first_name,
    s.last_name,
    s.class_id,
    c.name AS class_name,
    pc.id AS parent_id,
    pc.name AS parent_name,
    pc.phone AS parent_phone,
    pc.relationship,
    pc.is_primary
   FROM ((public.students s
     JOIN public.classes c ON ((s.class_id = c.id)))
     LEFT JOIN public.parent_contacts pc ON ((s.id = pc.student_id)))
  WHERE (s.is_active = true);


--
-- Name: students_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.students_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: students_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.students_id_seq OWNED BY public.students.id;


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(20) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    grade_levels character varying(20)[] DEFAULT ARRAY[]::character varying[],
    lessons_per_week integer,
    category character varying(50),
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    school_id integer
);


--
-- Name: subjects_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subjects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subjects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subjects_id_seq OWNED BY public.subjects.id;


--
-- Name: user_school_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_school_memberships (
    id integer NOT NULL,
    auth_uid uuid NOT NULL,
    user_id integer NOT NULL,
    school_id integer NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_school_memberships_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'TEACHER'::character varying, 'ACCOUNTANT'::character varying, 'OWNER'::character varying])::text[])))
);


--
-- Name: TABLE user_school_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_school_memberships IS 'Maps Supabase auth users to internal users and their school. A user can belong to multiple schools (e.g. a consultant or owner of a chain).';


--
-- Name: user_school_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_school_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_school_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_school_memberships_id_seq OWNED BY public.user_school_memberships.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username character varying(100) NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    last_login timestamp without time zone,
    school_id integer,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'TEACHER'::character varying, 'ACCOUNTANT'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: academic_terms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_terms ALTER COLUMN id SET DEFAULT nextval('public.academic_terms_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: classes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes ALTER COLUMN id SET DEFAULT nextval('public.classes_id_seq'::regclass);


--
-- Name: event_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs ALTER COLUMN id SET DEFAULT nextval('public.event_logs_id_seq'::regclass);


--
-- Name: exam_enrollments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments ALTER COLUMN id SET DEFAULT nextval('public.exam_enrollments_id_seq'::regclass);


--
-- Name: exam_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results ALTER COLUMN id SET DEFAULT nextval('public.exam_results_id_seq'::regclass);


--
-- Name: exam_subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects ALTER COLUMN id SET DEFAULT nextval('public.exam_subjects_id_seq'::regclass);


--
-- Name: exams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams ALTER COLUMN id SET DEFAULT nextval('public.exams_id_seq'::regclass);


--
-- Name: fee_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories ALTER COLUMN id SET DEFAULT nextval('public.fee_categories_id_seq'::regclass);


--
-- Name: fee_structures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures ALTER COLUMN id SET DEFAULT nextval('public.fee_structures_id_seq'::regclass);


--
-- Name: invoice_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: mpesa_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions ALTER COLUMN id SET DEFAULT nextval('public.mpesa_transactions_id_seq'::regclass);


--
-- Name: notification_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue ALTER COLUMN id SET DEFAULT nextval('public.notification_queue_id_seq'::regclass);


--
-- Name: parent_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_contacts ALTER COLUMN id SET DEFAULT nextval('public.parent_contacts_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: school_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_config ALTER COLUMN id SET DEFAULT nextval('public.school_config_id_seq'::regclass);


--
-- Name: schools id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools ALTER COLUMN id SET DEFAULT nextval('public.schools_id_seq'::regclass);


--
-- Name: sms_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs ALTER COLUMN id SET DEFAULT nextval('public.sms_logs_id_seq'::regclass);


--
-- Name: staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff ALTER COLUMN id SET DEFAULT nextval('public.staff_id_seq'::regclass);


--
-- Name: staff_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance ALTER COLUMN id SET DEFAULT nextval('public.staff_attendance_id_seq'::regclass);


--
-- Name: student_attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance ALTER COLUMN id SET DEFAULT nextval('public.student_attendance_id_seq'::regclass);


--
-- Name: students id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students ALTER COLUMN id SET DEFAULT nextval('public.students_id_seq'::regclass);


--
-- Name: subjects id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects ALTER COLUMN id SET DEFAULT nextval('public.subjects_id_seq'::regclass);


--
-- Name: user_school_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_school_memberships ALTER COLUMN id SET DEFAULT nextval('public.user_school_memberships_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: academic_terms academic_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_terms
    ADD CONSTRAINT academic_terms_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_student_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_date_key UNIQUE (student_id, date);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: event_logs event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_pkey PRIMARY KEY (id);


--
-- Name: exam_enrollments exam_enrollments_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_exam_id_student_id_key UNIQUE (exam_id, student_id);


--
-- Name: exam_enrollments exam_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_pkey PRIMARY KEY (id);


--
-- Name: exam_results exam_results_exam_id_student_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_exam_id_student_id_subject_id_key UNIQUE (exam_id, student_id, subject_id);


--
-- Name: exam_results exam_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_pkey PRIMARY KEY (id);


--
-- Name: exam_subjects exam_subjects_exam_id_subject_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_id_subject_name_key UNIQUE (exam_id, subject_name);


--
-- Name: exam_subjects exam_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_pkey PRIMARY KEY (id);


--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--
-- Name: fee_categories fee_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_pkey PRIMARY KEY (id);


--
-- Name: fee_structures fee_structures_class_id_term_id_fee_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_class_id_term_id_fee_type_key UNIQUE (class_id, term_id, fee_type);


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: mpesa_transactions mpesa_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT mpesa_transactions_pkey PRIMARY KEY (id);


--
-- Name: mpesa_transactions mpesa_transactions_transaction_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT mpesa_transactions_transaction_id_key UNIQUE (transaction_id);


--
-- Name: notification_queue notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);


--
-- Name: parent_contacts parent_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_contacts
    ADD CONSTRAINT parent_contacts_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- Name: school_config school_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_config
    ADD CONSTRAINT school_config_config_key_key UNIQUE (config_key);


--
-- Name: school_config school_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_config
    ADD CONSTRAINT school_config_pkey PRIMARY KEY (id);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: schools schools_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_slug_key UNIQUE (slug);


--
-- Name: sms_logs sms_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_pkey PRIMARY KEY (id);


--
-- Name: staff_attendance staff_attendance_staff_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_attendance
    ADD CONSTRAINT staff_attendance_staff_id_date_key UNIQUE (staff_id, date);


--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (id);


--
-- Name: student_attendance student_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_pkey PRIMARY KEY (id);


--
-- Name: student_attendance student_attendance_student_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_attendance
    ADD CONSTRAINT student_attendance_student_id_date_key UNIQUE (student_id, date);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_upi_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_upi_number_key UNIQUE (upi_number);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: mpesa_transactions uq_mpesa_receipt_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT uq_mpesa_receipt_number UNIQUE (mpesa_receipt_number);


--
-- Name: user_school_memberships user_school_memberships_auth_uid_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_school_memberships
    ADD CONSTRAINT user_school_memberships_auth_uid_school_id_key UNIQUE (auth_uid, school_id);


--
-- Name: user_school_memberships user_school_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_school_memberships
    ADD CONSTRAINT user_school_memberships_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: idx_academic_terms_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_academic_terms_active ON public.academic_terms USING btree (is_active);


--
-- Name: idx_academic_terms_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_academic_terms_school ON public.academic_terms USING btree (school_id);


--
-- Name: idx_academic_terms_school_year_term; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_academic_terms_school_year_term ON public.academic_terms USING btree (school_id, year, term);


--
-- Name: idx_academic_terms_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_academic_terms_year ON public.academic_terms USING btree (year);


--
-- Name: idx_attendance_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_class ON public.attendance USING btree (class_id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);


--
-- Name: idx_attendance_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_school_date ON public.attendance USING btree (school_id, date);


--
-- Name: idx_attendance_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_status ON public.attendance USING btree (status);


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity, entity_id);


--
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp");


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_classes_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_school ON public.classes USING btree (school_id);


--
-- Name: idx_classes_school_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_classes_school_name ON public.classes USING btree (school_id, name);


--
-- Name: idx_classes_teacher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_classes_teacher ON public.classes USING btree (class_teacher_id);


--
-- Name: idx_event_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_date ON public.event_logs USING btree (created_at);


--
-- Name: idx_event_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_entity ON public.event_logs USING btree (entity_type, entity_id);


--
-- Name: idx_event_logs_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_school ON public.event_logs USING btree (school_id);


--
-- Name: idx_event_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_type ON public.event_logs USING btree (event_type);


--
-- Name: idx_event_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_logs_user ON public.event_logs USING btree (triggered_by);


--
-- Name: idx_exam_enrollments_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_enrollments_exam ON public.exam_enrollments USING btree (exam_id);


--
-- Name: idx_exam_enrollments_exam_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_enrollments_exam_student ON public.exam_enrollments USING btree (exam_id, student_id);


--
-- Name: idx_exam_enrollments_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_enrollments_school ON public.exam_enrollments USING btree (school_id);


--
-- Name: idx_exam_enrollments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_enrollments_status ON public.exam_enrollments USING btree (status);


--
-- Name: idx_exam_enrollments_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_enrollments_student ON public.exam_enrollments USING btree (student_id);


--
-- Name: idx_exam_results_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_results_exam ON public.exam_results USING btree (exam_id);


--
-- Name: idx_exam_results_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_results_school ON public.exam_results USING btree (school_id);


--
-- Name: idx_exam_results_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_results_student ON public.exam_results USING btree (student_id);


--
-- Name: idx_exam_results_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_results_subject ON public.exam_results USING btree (subject_id);


--
-- Name: idx_exam_subjects_exam; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exam_subjects_exam ON public.exam_subjects USING btree (exam_id);


--
-- Name: idx_exams_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_school ON public.exams USING btree (school_id);


--
-- Name: idx_exams_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_status ON public.exams USING btree (status);


--
-- Name: idx_exams_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_term ON public.exams USING btree (term_id);


--
-- Name: idx_exams_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exams_type ON public.exams USING btree (exam_type);


--
-- Name: idx_fee_categories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_categories_active ON public.fee_categories USING btree (is_active);


--
-- Name: idx_fee_categories_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_categories_name ON public.fee_categories USING btree (name);


--
-- Name: idx_fee_categories_school_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_fee_categories_school_name ON public.fee_categories USING btree (school_id, name);


--
-- Name: idx_fee_structures_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_structures_class ON public.fee_structures USING btree (class_id);


--
-- Name: idx_fee_structures_class_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_structures_class_term ON public.fee_structures USING btree (class_id, term_id);


--
-- Name: idx_fee_structures_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_structures_school ON public.fee_structures USING btree (school_id);


--
-- Name: idx_fee_structures_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fee_structures_term ON public.fee_structures USING btree (term_id);


--
-- Name: idx_invoice_items_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items USING btree (invoice_id);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_school ON public.invoices USING btree (school_id);


--
-- Name: idx_invoices_school_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_school_status ON public.invoices USING btree (school_id, status);


--
-- Name: idx_invoices_school_student_term; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoices_school_student_term ON public.invoices USING btree (school_id, student_id, term_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_student ON public.invoices USING btree (student_id);


--
-- Name: idx_invoices_term; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_term ON public.invoices USING btree (term_id);


--
-- Name: idx_mpesa_account_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_account_ref ON public.mpesa_transactions USING btree (account_reference);


--
-- Name: idx_mpesa_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_date ON public.mpesa_transactions USING btree (transaction_date);


--
-- Name: idx_mpesa_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_phone ON public.mpesa_transactions USING btree (phone_number);


--
-- Name: idx_mpesa_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_receipt ON public.mpesa_transactions USING btree (mpesa_receipt_number);


--
-- Name: idx_mpesa_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_school ON public.mpesa_transactions USING btree (school_id);


--
-- Name: idx_mpesa_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_status ON public.mpesa_transactions USING btree (status);


--
-- Name: idx_mpesa_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mpesa_transaction_id ON public.mpesa_transactions USING btree (transaction_id);


--
-- Name: idx_notification_queue_message_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_message_type ON public.notification_queue USING btree (message_type);


--
-- Name: idx_notification_queue_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_priority ON public.notification_queue USING btree (priority);


--
-- Name: idx_notification_queue_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_scheduled ON public.notification_queue USING btree (scheduled_for);


--
-- Name: idx_notification_queue_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_school ON public.notification_queue USING btree (school_id);


--
-- Name: idx_notification_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_queue_status ON public.notification_queue USING btree (status);


--
-- Name: idx_parent_contacts_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_contacts_phone ON public.parent_contacts USING btree (phone);


--
-- Name: idx_parent_contacts_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_contacts_primary ON public.parent_contacts USING btree (is_primary);


--
-- Name: idx_parent_contacts_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_contacts_school ON public.parent_contacts USING btree (school_id);


--
-- Name: idx_parent_contacts_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_contacts_student ON public.parent_contacts USING btree (student_id);


--
-- Name: idx_password_reset_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_token ON public.password_reset_tokens USING btree (token);


--
-- Name: idx_password_reset_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);


--
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice ON public.payments USING btree (invoice_id);


--
-- Name: idx_payments_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_method ON public.payments USING btree (payment_method);


--
-- Name: idx_payments_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_reference ON public.payments USING btree (reference_number);


--
-- Name: idx_payments_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_school ON public.payments USING btree (school_id);


--
-- Name: idx_refresh_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens USING btree (token);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_school_config_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_school_config_key ON public.school_config USING btree (config_key);


--
-- Name: idx_schools_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_active ON public.schools USING btree (is_active);


--
-- Name: idx_schools_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_plan ON public.schools USING btree (plan);


--
-- Name: idx_schools_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schools_slug ON public.schools USING btree (slug);


--
-- Name: idx_sms_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_date ON public.sms_logs USING btree (created_at);


--
-- Name: idx_sms_logs_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_phone ON public.sms_logs USING btree (recipient_phone);


--
-- Name: idx_sms_logs_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_school ON public.sms_logs USING btree (school_id);


--
-- Name: idx_sms_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_status ON public.sms_logs USING btree (status);


--
-- Name: idx_sms_logs_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_student ON public.sms_logs USING btree (student_id);


--
-- Name: idx_sms_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_logs_type ON public.sms_logs USING btree (message_type);


--
-- Name: idx_staff_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_attendance_date ON public.staff_attendance USING btree (date);


--
-- Name: idx_staff_attendance_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_attendance_staff ON public.staff_attendance USING btree (staff_id);


--
-- Name: idx_staff_employee_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_employee_number ON public.staff USING btree (employee_number);


--
-- Name: idx_staff_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_school ON public.staff USING btree (school_id);


--
-- Name: idx_staff_school_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_school_employee ON public.staff USING btree (school_id, employee_number);


--
-- Name: idx_staff_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_user ON public.staff USING btree (user_id);


--
-- Name: idx_student_attendance_class_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_attendance_class_date ON public.student_attendance USING btree (class_id, date);


--
-- Name: idx_student_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_attendance_date ON public.student_attendance USING btree (date);


--
-- Name: idx_student_attendance_student; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_attendance_student ON public.student_attendance USING btree (student_id);


--
-- Name: idx_students_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_active ON public.students USING btree (is_active);


--
-- Name: idx_students_admission_no; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_admission_no ON public.students USING btree (admission_no);


--
-- Name: idx_students_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_class ON public.students USING btree (class_id);


--
-- Name: idx_students_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school ON public.students USING btree (school_id);


--
-- Name: idx_students_school_admission; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_students_school_admission ON public.students USING btree (school_id, admission_no);


--
-- Name: idx_students_school_class; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school_class ON public.students USING btree (school_id, class_id);


--
-- Name: idx_students_school_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_school_status ON public.students USING btree (school_id, status);


--
-- Name: idx_students_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_status ON public.students USING btree (status);


--
-- Name: idx_students_upi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_students_upi ON public.students USING btree (upi_number);


--
-- Name: idx_subjects_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_active ON public.subjects USING btree (is_active);


--
-- Name: idx_subjects_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_category ON public.subjects USING btree (category);


--
-- Name: idx_subjects_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_code ON public.subjects USING btree (code);


--
-- Name: idx_subjects_grade_levels; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_grade_levels ON public.subjects USING gin (grade_levels);


--
-- Name: idx_subjects_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subjects_school ON public.subjects USING btree (school_id);


--
-- Name: idx_subjects_school_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_subjects_school_code ON public.subjects USING btree (school_id, code);


--
-- Name: idx_subjects_school_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_subjects_school_name ON public.subjects USING btree (school_id, name);


--
-- Name: idx_user_memberships_auth; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_memberships_auth ON public.user_school_memberships USING btree (auth_uid);


--
-- Name: idx_user_memberships_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_memberships_school ON public.user_school_memberships USING btree (school_id);


--
-- Name: idx_user_memberships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_memberships_user ON public.user_school_memberships USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_school ON public.users USING btree (school_id);


--
-- Name: idx_users_school_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_school_email ON public.users USING btree (school_id, email);


--
-- Name: idx_users_school_username; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_users_school_username ON public.users USING btree (school_id, username);


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: fee_balances _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.fee_balances AS
 SELECT i.id AS invoice_id,
    i.school_id,
    i.student_id,
    s.admission_no,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS student_name,
    c.name AS class_name,
    t.year,
    t.term,
    i.total_amount,
    COALESCE(sum(p.amount), (0)::numeric) AS paid_amount,
    (i.total_amount - COALESCE(sum(p.amount), (0)::numeric)) AS balance,
    i.status,
    pc.phone AS parent_phone,
    pc.name AS parent_name
   FROM (((((public.invoices i
     JOIN public.students s ON ((i.student_id = s.id)))
     JOIN public.classes c ON ((s.class_id = c.id)))
     JOIN public.academic_terms t ON ((i.term_id = t.id)))
     LEFT JOIN public.payments p ON ((i.id = p.invoice_id)))
     LEFT JOIN public.parent_contacts pc ON (((s.id = pc.student_id) AND (pc.is_primary = true))))
  GROUP BY i.id, i.school_id, s.id, s.admission_no, s.first_name, s.last_name, c.name, t.year, t.term, i.status, pc.phone, pc.name;


--
-- Name: notification_queue notification_queue_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notification_queue_updated_at_trigger BEFORE UPDATE ON public.notification_queue FOR EACH ROW EXECUTE FUNCTION public.update_notification_queue_updated_at();


--
-- Name: academic_terms trg_academic_terms_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_academic_terms_stamp_school BEFORE INSERT ON public.academic_terms FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: attendance trg_attendance_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_stamp_school BEFORE INSERT ON public.attendance FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: classes trg_classes_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_classes_stamp_school BEFORE INSERT ON public.classes FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: event_logs trg_event_logs_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_logs_stamp_school BEFORE INSERT ON public.event_logs FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: exam_enrollments trg_exam_enrollments_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exam_enrollments_stamp_school BEFORE INSERT ON public.exam_enrollments FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: exam_enrollments trg_exam_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exam_enrollments_updated_at BEFORE UPDATE ON public.exam_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: exam_results trg_exam_results_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exam_results_stamp_school BEFORE INSERT ON public.exam_results FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: exam_subjects trg_exam_subjects_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exam_subjects_stamp_school BEFORE INSERT ON public.exam_subjects FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: exams trg_exams_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exams_stamp_school BEFORE INSERT ON public.exams FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: fee_categories trg_fee_categories_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fee_categories_stamp_school BEFORE INSERT ON public.fee_categories FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: fee_structures trg_fee_structures_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fee_structures_stamp_school BEFORE INSERT ON public.fee_structures FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: invoice_items trg_invoice_items_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_items_stamp_school BEFORE INSERT ON public.invoice_items FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: invoices trg_invoices_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_stamp_school BEFORE INSERT ON public.invoices FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: invoices trg_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mpesa_transactions trg_mpesa_transactions_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mpesa_transactions_stamp_school BEFORE INSERT ON public.mpesa_transactions FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: notification_queue trg_notification_queue_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_queue_stamp_school BEFORE INSERT ON public.notification_queue FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: parent_contacts trg_parent_contacts_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_parent_contacts_stamp_school BEFORE INSERT ON public.parent_contacts FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: payments trg_payments_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_stamp_school BEFORE INSERT ON public.payments FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: sms_logs trg_sms_logs_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sms_logs_stamp_school BEFORE INSERT ON public.sms_logs FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: staff trg_staff_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_staff_stamp_school BEFORE INSERT ON public.staff FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: students trg_students_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_stamp_school BEFORE INSERT ON public.students FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: students trg_students_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subjects trg_subjects_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subjects_stamp_school BEFORE INSERT ON public.subjects FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: payments trg_update_invoice_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_invoice_status AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_status();


--
-- Name: users trg_users_stamp_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_stamp_school BEFORE INSERT ON public.users FOR EACH ROW WHEN ((new.school_id IS NULL)) EXECUTE FUNCTION public.stamp_school_id();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: academic_terms academic_terms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_terms
    ADD CONSTRAINT academic_terms_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: attendance attendance_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: classes classes_class_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES public.staff(id) ON DELETE SET NULL;


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: event_logs event_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: event_logs event_logs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_logs
    ADD CONSTRAINT event_logs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: exam_enrollments exam_enrollments_enrolled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_enrolled_by_fkey FOREIGN KEY (enrolled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: exam_enrollments exam_enrollments_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_enrollments exam_enrollments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: exam_enrollments exam_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_enrollments
    ADD CONSTRAINT exam_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: exam_results exam_results_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_results exam_results_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: exam_results exam_results_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: exam_results exam_results_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_results
    ADD CONSTRAINT exam_results_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.exam_subjects(id) ON DELETE CASCADE;


--
-- Name: exam_subjects exam_subjects_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--
-- Name: exam_subjects exam_subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_subjects
    ADD CONSTRAINT exam_subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: exams exams_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: exams exams_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: exams exams_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT;


--
-- Name: fee_categories fee_categories_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: fee_structures fee_structures_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.academic_terms(id) ON DELETE RESTRICT;


--
-- Name: mpesa_transactions mpesa_transactions_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT mpesa_transactions_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: mpesa_transactions mpesa_transactions_reconciled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT mpesa_transactions_reconciled_by_fkey FOREIGN KEY (reconciled_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: mpesa_transactions mpesa_transactions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mpesa_transactions
    ADD CONSTRAINT mpesa_transactions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: notification_queue notification_queue_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: notification_queue notification_queue_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: parent_contacts parent_contacts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_contacts
    ADD CONSTRAINT parent_contacts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: parent_contacts parent_contacts_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_contacts
    ADD CONSTRAINT parent_contacts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: payments payments_received_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: school_config school_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_config
    ADD CONSTRAINT school_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sms_logs sms_logs_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: sms_logs sms_logs_mpesa_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_mpesa_transaction_id_fkey FOREIGN KEY (mpesa_transaction_id) REFERENCES public.mpesa_transactions(id) ON DELETE SET NULL;


--
-- Name: sms_logs sms_logs_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL;


--
-- Name: sms_logs sms_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: sms_logs sms_logs_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_logs
    ADD CONSTRAINT sms_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;


--
-- Name: staff staff_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: staff staff_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: students students_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT;


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: subjects subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: user_school_memberships user_school_memberships_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_school_memberships
    ADD CONSTRAINT user_school_memberships_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: user_school_memberships user_school_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_school_memberships
    ADD CONSTRAINT user_school_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;

--
-- Name: academic_terms academic_terms_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_terms_insert ON public.academic_terms FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: academic_terms academic_terms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_terms_select ON public.academic_terms FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: academic_terms academic_terms_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY academic_terms_update ON public.academic_terms FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance attendance_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_insert ON public.attendance FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: attendance attendance_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_select ON public.attendance FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: attendance attendance_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY attendance_update ON public.attendance FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_delete ON public.classes FOR DELETE USING ((school_id = public.current_school_id()));


--
-- Name: classes classes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_insert ON public.classes FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: classes classes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_select ON public.classes FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: classes classes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY classes_update ON public.classes FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: event_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: event_logs event_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_logs_insert ON public.event_logs FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: event_logs event_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_logs_select ON public.event_logs FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: exam_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_enrollments exam_enrollments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_enrollments_insert ON public.exam_enrollments FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: exam_enrollments exam_enrollments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_enrollments_select ON public.exam_enrollments FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: exam_enrollments exam_enrollments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_enrollments_update ON public.exam_enrollments FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: exam_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_results exam_results_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_results_insert ON public.exam_results FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: exam_results exam_results_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_results_select ON public.exam_results FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: exam_results exam_results_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_results_update ON public.exam_results FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: exam_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: exam_subjects exam_subjects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_subjects_insert ON public.exam_subjects FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: exam_subjects exam_subjects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exam_subjects_select ON public.exam_subjects FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--
-- Name: exams exams_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_insert ON public.exams FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: exams exams_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_select ON public.exams FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: exams exams_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exams_update ON public.exams FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: fee_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_categories fee_categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_categories_insert ON public.fee_categories FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: fee_categories fee_categories_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_categories_select ON public.fee_categories FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: fee_structures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_structures fee_structures_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_structures_insert ON public.fee_structures FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: fee_structures fee_structures_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_structures_select ON public.fee_structures FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: fee_structures fee_structures_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fee_structures_update ON public.fee_structures FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items invoice_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_insert ON public.invoice_items FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: invoice_items invoice_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_items_select ON public.invoice_items FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_insert ON public.invoices FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: invoices invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_select ON public.invoices FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: invoices invoices_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_update ON public.invoices FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: user_school_memberships memberships_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_insert ON public.user_school_memberships FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: user_school_memberships memberships_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_select ON public.user_school_memberships FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: mpesa_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: mpesa_transactions mpesa_transactions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mpesa_transactions_insert ON public.mpesa_transactions FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: mpesa_transactions mpesa_transactions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mpesa_transactions_select ON public.mpesa_transactions FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: mpesa_transactions mpesa_transactions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mpesa_transactions_update ON public.mpesa_transactions FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: notification_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_queue notification_queue_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_queue_insert ON public.notification_queue FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: notification_queue notification_queue_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_queue_select ON public.notification_queue FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: notification_queue notification_queue_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_queue_update ON public.notification_queue FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: parent_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_contacts parent_contacts_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parent_contacts_delete ON public.parent_contacts FOR DELETE USING ((school_id = public.current_school_id()));


--
-- Name: parent_contacts parent_contacts_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parent_contacts_insert ON public.parent_contacts FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: parent_contacts parent_contacts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parent_contacts_select ON public.parent_contacts FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: parent_contacts parent_contacts_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parent_contacts_update ON public.parent_contacts FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_insert ON public.payments FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: payments payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_select ON public.payments FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: payments payments_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_update ON public.payments FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schools_select ON public.schools FOR SELECT USING ((id = public.current_school_id()));


--
-- Name: sms_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_logs sms_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_logs_insert ON public.sms_logs FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: sms_logs sms_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sms_logs_select ON public.sms_logs FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: staff; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

--
-- Name: staff staff_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_delete ON public.staff FOR DELETE USING ((school_id = public.current_school_id()));


--
-- Name: staff staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_insert ON public.staff FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: staff staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_select ON public.staff FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: staff staff_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_update ON public.staff FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_delete ON public.students FOR DELETE USING ((school_id = public.current_school_id()));


--
-- Name: students students_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_insert ON public.students FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: students students_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_select ON public.students FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: students students_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY students_update ON public.students FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects subjects_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subjects_insert ON public.subjects FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: subjects subjects_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subjects_select ON public.subjects FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: subjects subjects_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subjects_update ON public.subjects FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: user_school_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_school_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_delete ON public.users FOR DELETE USING ((school_id = public.current_school_id()));


--
-- Name: users users_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert ON public.users FOR INSERT WITH CHECK ((school_id = public.current_school_id()));


--
-- Name: users users_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select ON public.users FOR SELECT USING ((school_id = public.current_school_id()));


--
-- Name: users users_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update ON public.users FOR UPDATE USING ((school_id = public.current_school_id()));


--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

\unrestrict UK928fRSRzzgfoTaCam0fkL0kEuk8trdV04oYZMWiQCc1LH7ApY7HLqt42Q1g3F

