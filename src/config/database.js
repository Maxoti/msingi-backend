const { Pool } = require('pg');

/**
 * Centralized PostgreSQL client
 * Automatically handles school RLS context
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Set timezone for all connections
pool.on('connect', (client) => {
  client.query(`SET timezone = 'Africa/Nairobi'`);
});

// ─── Internal helpers ────────────────────────────────────────────────

const _setSchoolContext = async (client, schoolId) => {
  if (!schoolId) throw new Error('schoolId is required to set RLS context');
  // true = transaction-local, safe for pooled connections
  await client.query(
    `SELECT set_config('app.current_school_id', $1, true)`,
    [String(schoolId)]
  );
};

// ─── Pool-level queries (no RLS) ──────────────────────────────────────

const query = async (text, params = []) => pool.query(text, params);
const queryOne = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
};
const queryAll = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rows;
};
const queryCount = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rowCount;
};

// ─── School-scoped queries ───────────────────────────────────────────

const withSchoolContext = async (schoolId, callback) => {
  const client = await pool.connect();
  try {
    await _setSchoolContext(client, schoolId);
    return await callback(client);
  } finally {
    client.release();
  }
};

const schoolQuery = async (schoolId, text, params = []) => 
  withSchoolContext(schoolId, client => client.query(text, params).then(r => r.rows));

const schoolQueryOne = async (schoolId, text, params = []) => 
  withSchoolContext(schoolId, client => client.query(text, params).then(r => r.rows[0] || null));

// ─── Transactions ────────────────────────────────────────────────────

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const schoolTransaction = async (schoolId, callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await _setSchoolContext(client, schoolId);  // RLS active
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ─── Lifecycle helpers ───────────────────────────────────────────────

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
  query,
  queryOne,
  queryAll,
  queryCount,
  withSchoolContext,
  schoolQuery,
  schoolQueryOne,
  transaction,
  schoolTransaction,
  healthCheck,
  close
};