/**
 * Terms Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
const db = require('../../shared/database/client');

const findAll = async (schoolId, filters = {}) => {
  const { year, is_active, page = 1, limit = 50 } = filters;
  let query = 'SELECT * FROM academic_terms WHERE school_id = $1';
  let countQ = 'SELECT COUNT(*) FROM academic_terms WHERE school_id = $1';
  const params = [schoolId], cParams = [schoolId];
  let p = 1;

  if (year !== undefined)      { query += ` AND year = $${++p}`;      countQ += ` AND year = $${p}`;      params.push(year);      cParams.push(year); }
  if (is_active !== undefined) { query += ` AND is_active = $${++p}`; countQ += ` AND is_active = $${p}`; params.push(is_active); cParams.push(is_active); }

  query += ' ORDER BY year DESC, term DESC';
  const offset = (page - 1) * limit;
  query += ` LIMIT $${++p} OFFSET $${++p}`;
  params.push(limit, offset);

  const [rows, cr] = await Promise.all([db.queryAll(query, params), db.queryOne(countQ, cParams)]);
  const total = parseInt(cr.count);
  return { terms: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } };
};

const findById = (schoolId, id) => db.queryOne('SELECT * FROM academic_terms WHERE id = $1 AND school_id = $2', [id, schoolId]);
const findByYearAndTerm = (schoolId, year, term) => db.queryOne('SELECT * FROM academic_terms WHERE year = $1 AND term = $2 AND school_id = $3', [year, term, schoolId]);
const findActive = (schoolId) => db.queryOne('SELECT * FROM academic_terms WHERE is_active = TRUE AND school_id = $1', [schoolId]);
const findByYear = (schoolId, year) => db.queryAll('SELECT * FROM academic_terms WHERE year = $1 AND school_id = $2 ORDER BY term', [year, schoolId]);

const findAllYears = async (schoolId) => {
  const rows = await db.queryAll('SELECT DISTINCT year FROM academic_terms WHERE school_id = $1 ORDER BY year DESC', [schoolId]);
  return rows.map(r => r.year);
};

const create = (termData, schoolId) => {
  const { year, term, start_date, end_date, is_active } = termData;
  return db.queryOne(
    `INSERT INTO academic_terms (year,term,start_date,end_date,is_active,school_id)
     VALUES ($1,$2,$3::date,$4::date,$5,$6) RETURNING *`,
    [year, term, start_date, end_date, is_active||false, schoolId]
  );
};

const update = async (schoolId, id, updates) => {
  const { start_date, end_date, is_active } = updates;
  const fields = []; const values = []; let p = 0;
  if (start_date !== undefined) { fields.push(`start_date = $${++p}::date`); values.push(start_date); }
  if (end_date   !== undefined) { fields.push(`end_date = $${++p}::date`);   values.push(end_date); }
  if (is_active  !== undefined) { fields.push(`is_active = $${++p}`);        values.push(is_active); }
  if (!fields.length) throw new Error('No fields to update');
  values.push(id, schoolId);
  return db.queryOne(`UPDATE academic_terms SET ${fields.join(', ')} WHERE id = $${p+1} AND school_id = $${p+2} RETURNING *`, values);
};

const deactivateAll = (schoolId) => db.query('UPDATE academic_terms SET is_active = FALSE WHERE school_id = $1', [schoolId]);

const setActive = async (schoolId, id) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE academic_terms SET is_active = FALSE WHERE school_id = $1', [schoolId]);
    const r = await client.query('UPDATE academic_terms SET is_active = TRUE WHERE id = $1 AND school_id = $2 RETURNING *', [id, schoolId]);
    await client.query('COMMIT');
    return r.rows[0];
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

const deleteTerm = (schoolId, id) => db.queryOne('DELETE FROM academic_terms WHERE id = $1 AND school_id = $2 RETURNING *', [id, schoolId]);

const exists = async (schoolId, year, term) => {
  const r = await db.queryOne('SELECT EXISTS(SELECT 1 FROM academic_terms WHERE year=$1 AND term=$2 AND school_id=$3) AS exists', [year, term, schoolId]);
  return r.exists;
};

module.exports = { findAll, findById, findByYearAndTerm, findActive, findByYear, findAllYears, create, update, deactivateAll, setActive, deleteTerm, exists };