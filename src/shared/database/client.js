const { Pool } = require('pg');

/**
 * Centralized PostgreSQL client
 * Single source of truth for DB access
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Render / production requires SSL
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Set timezone for all connections to Africa/Nairobi
pool.on('connect', (client) => {
  client.query('SET timezone = "Africa/Nairobi"');
});

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Set RLS school context on a dedicated client.
 * Uses set_config so it is always parameterized (no SQL injection risk).
 * The third argument (true) scopes the setting to the current transaction;
 * outside a transaction it persists for the connection lifetime, but since
 * we always release the client immediately after use that is safe.
 */
const _setSchoolContext = async (client, schoolId) => {
  if (!schoolId) {
    throw new Error('schoolId is required to set RLS context');
  }
  await client.query(
    `SELECT set_config('app.current_school_id', $1, true)`,
    [String(schoolId)]
  );
};

// ─── Pool-level helpers (no RLS context — use for public/non-tenant queries) ──

/**
 * Raw query — returns full pg Result object.
 * Only use this when you genuinely need rowCount, fields, etc.
 */
const query = async (text, params = []) => {
  return pool.query(text, params);
};

/**
 * Query and return single row
 */
const queryOne = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
};

/**
 * Query and return all rows
 */
const queryAll = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rows;
};

/**
 * Query and return row count
 */
const queryCount = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rowCount;
};

// ─── School-scoped helpers (set RLS context before every query) ───────────────

/**
 * Check out a dedicated connection, set the school RLS context,
 * then run an arbitrary async callback(client).
 *
 * Use this for single queries or multiple queries that must share
 * the same connection but don't need a full transaction.
 *
 * @example
 * const rows = await withSchoolContext(req.schoolId, (client) =>
 *   client.query('SELECT * FROM students').then(r => r.rows)
 * );
 */
const withSchoolContext = async (schoolId, callback) => {
  const client = await pool.connect();
  try {
    await _setSchoolContext(client, schoolId);
    return await callback(client);
  } finally {
    client.release();
  }
};

/**
 * Convenience: school-scoped query returning all rows.
 *
 * @example
 * const students = await schoolQuery(req.schoolId,
 *   'SELECT * FROM students WHERE class_id = $1', [classId]);
 */
const schoolQuery = async (schoolId, text, params = []) => {
  return withSchoolContext(schoolId, async (client) => {
    const res = await client.query(text, params);
    return res.rows;
  });
};

/**
 * Convenience: school-scoped query returning a single row.
 */
const schoolQueryOne = async (schoolId, text, params = []) => {
  return withSchoolContext(schoolId, async (client) => {
    const res = await client.query(text, params);
    return res.rows[0] || null;
  });
};

// ─── Transaction helpers ──────────────────────────────────────────────────────

/**
 * Execute a transaction WITHOUT school context.
 * Use for system-level operations (migrations, auth, cross-tenant admin).
 *
 * @example
 * const result = await transaction(async (client) => {
 *   await client.query('INSERT INTO audit_log ...');
 * });
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute a transaction WITH school RLS context.
 * Use for all tenant-scoped write operations.
 *
 * The school context is set after BEGIN so it is transaction-local,
 * meaning it is automatically cleared on COMMIT or ROLLBACK — no
 * risk of leaking to the next borrower of this connection.
 *
 * @example
 * const payment = await schoolTransaction(req.schoolId, async (client) => {
 *   const inv = await client.query('UPDATE invoices ...', [...]);
 *   const pay = await client.query('INSERT INTO payments ...', [...]);
 *   return pay.rows[0];
 * });
 */
const schoolTransaction = async (schoolId, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await _setSchoolContext(client, schoolId);  // scoped to this transaction
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Health check (useful for tests & monitoring)
 */
const healthCheck = async () => {
  const res = await query('SELECT 1');
  return res.rowCount === 1;
};

const close = async () => {
  await pool.end();
  console.log('Database connection pool closed');
};

module.exports = {
  pool,
  // Pool-level (no RLS)
  query,
  queryOne,
  queryAll,
  queryCount,
  // School-scoped (sets RLS before querying)
  withSchoolContext,
  schoolQuery,
  schoolQueryOne,
  // Transactions
  transaction,
  schoolTransaction,
  // Lifecycle
  healthCheck,
  close
};