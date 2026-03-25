/**
 * Subjects Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
const db = require('../../shared/database/client');

const findAll = async (schoolId, filters = {}) => {
  const { grade_level, category, is_active, page = 1, limit = 50 } = filters;
  let query = 'SELECT * FROM subjects WHERE school_id = $1';
  let countQ = 'SELECT COUNT(*) FROM subjects WHERE school_id = $1';
  const params = [schoolId], cParams = [schoolId];
  let p = 1;

  if (grade_level) { query += ` AND $${++p} = ANY(grade_levels)`; countQ += ` AND $${p} = ANY(grade_levels)`; params.push(grade_level); cParams.push(grade_level); }
  if (category)    { query += ` AND category = $${++p}`;          countQ += ` AND category = $${p}`;          params.push(category);    cParams.push(category); }
  if (is_active !== undefined) { query += ` AND is_active = $${++p}`; countQ += ` AND is_active = $${p}`; params.push(is_active); cParams.push(is_active); }

  query += ' ORDER BY name ASC';
  const offset = (page - 1) * limit;
  query += ` LIMIT $${++p} OFFSET $${++p}`;
  params.push(limit, offset);

  const [rows, cr] = await Promise.all([db.queryAll(query, params), db.queryOne(countQ, cParams)]);
  const total = parseInt(cr.count);
  return { subjects: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } };
};

const findById = (schoolId, id) => db.queryOne('SELECT * FROM subjects WHERE id = $1 AND school_id = $2', [id, schoolId]);
const findByCode = (schoolId, code) => db.queryOne('SELECT * FROM subjects WHERE code = $1 AND school_id = $2', [code, schoolId]);
const findByGradeLevel = (schoolId, gl) => db.queryAll('SELECT * FROM subjects WHERE $1 = ANY(grade_levels) AND is_active = TRUE AND school_id = $2 ORDER BY name', [gl, schoolId]);
const findByCategory = (schoolId, cat) => db.queryAll('SELECT * FROM subjects WHERE category = $1 AND is_active = TRUE AND school_id = $2 ORDER BY name', [cat, schoolId]);

const getAllCategories = async (schoolId) => {
  const rows = await db.queryAll('SELECT DISTINCT category FROM subjects WHERE category IS NOT NULL AND school_id = $1 ORDER BY category', [schoolId]);
  return rows.map(r => r.category);
};

const create = (subjectData, schoolId) => {
  const { name, code, description, grade_levels, lessons_per_week, category, is_active } = subjectData;
  return db.queryOne(
    `INSERT INTO subjects (name,code,description,grade_levels,lessons_per_week,category,is_active,school_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name, code, description, grade_levels||[], lessons_per_week, category, is_active!==undefined?is_active:true, schoolId]
  );
};

const update = async (schoolId, id, updates) => {
  const fields = []; const values = []; let p = 0;
  const map = { name:'name', code:'code', description:'description', grade_levels:'grade_levels', lessons_per_week:'lessons_per_week', category:'category', is_active:'is_active' };
  for (const [k,col] of Object.entries(map)) { if (updates[k] !== undefined) { fields.push(`${col} = $${++p}`); values.push(updates[k]); } }
  if (!fields.length) throw new Error('No fields to update');
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, schoolId);
  return db.queryOne(`UPDATE subjects SET ${fields.join(', ')} WHERE id = $${p+1} AND school_id = $${p+2} RETURNING *`, values);
};

const deleteSubject = (schoolId, id) => db.queryOne('DELETE FROM subjects WHERE id = $1 AND school_id = $2 RETURNING *', [id, schoolId]);
const deactivate = (schoolId, id) => db.queryOne('UPDATE subjects SET is_active = FALSE WHERE id = $1 AND school_id = $2 RETURNING *', [id, schoolId]);
const activate = (schoolId, id) => db.queryOne('UPDATE subjects SET is_active = TRUE WHERE id = $1 AND school_id = $2 RETURNING *', [id, schoolId]);

const codeExists = async (schoolId, code, excludeId=null) => {
  let q = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE code = $1 AND school_id = $2';
  const p = [code, schoolId];
  if (excludeId) { q += ' AND id != $3'; p.push(excludeId); }
  const r = await db.queryOne(q + ') AS exists', p);
  return r.exists;
};

const nameExists = async (schoolId, name, excludeId=null) => {
  let q = 'SELECT EXISTS(SELECT 1 FROM subjects WHERE name = $1 AND school_id = $2';
  const p = [name, schoolId];
  if (excludeId) { q += ' AND id != $3'; p.push(excludeId); }
  const r = await db.queryOne(q + ') AS exists', p);
  return r.exists;
};

const getStatistics = async (schoolId) => {
  const r = await db.queryOne(
    `SELECT COUNT(*) AS total_subjects, COUNT(*) FILTER (WHERE is_active=TRUE) AS active_subjects,
     COUNT(*) FILTER (WHERE is_active=FALSE) AS inactive_subjects,
     COUNT(DISTINCT category) AS total_categories, ROUND(AVG(lessons_per_week),2) AS avg_lessons_per_week
     FROM subjects WHERE school_id = $1`, [schoolId]
  );
  return { total_subjects: parseInt(r.total_subjects)||0, active_subjects: parseInt(r.active_subjects)||0, inactive_subjects: parseInt(r.inactive_subjects)||0, total_categories: parseInt(r.total_categories)||0, avg_lessons_per_week: parseFloat(r.avg_lessons_per_week)||0 };
};

const findByClassId = (schoolId, classId) => db.queryAll(
  `SELECT s.* FROM subjects s JOIN classes c ON (s.grade_levels @> ARRAY[c.grade_level]::varchar[])
   WHERE c.id = $1 AND s.is_active = TRUE AND s.school_id = $2 ORDER BY s.name`,
  [classId, schoolId]
);

module.exports = { findAll, findById, findByCode, findByGradeLevel, findByCategory, findByClassId, getAllCategories, create, update, deleteSubject, deactivate, activate, codeExists, nameExists, getStatistics };