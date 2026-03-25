/**
 * Auth Repository
 * Database operations for user authentication
 */

'use strict';

const db = require('../../shared/database/client');

/**
 * Create new user.
 * school_id MUST be supplied by the caller — never rely on the trigger.
 */
const create = async (userData) => {
  const { school_id, username, email, password_hash, role, is_active = true } = userData;

  return await db.queryOne(
    `INSERT INTO users (school_id, username, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, school_id, username, email, role, is_active, created_at`,
    [school_id, username, email, password_hash, role, is_active]
  );
};

/**
 * Find user by ID (scoped to school when school_id is provided).
 */
const findById = async (userId, schoolId = null) => {
  if (schoolId) {
    return await db.queryOne(
      `SELECT id, school_id, username, email, password_hash, role, is_active,
              last_login, created_at, updated_at
       FROM users
       WHERE id = $1 AND school_id = $2`,
      [userId, schoolId]
    );
  }

  return await db.queryOne(
    `SELECT id, school_id, username, email, password_hash, role, is_active,
            last_login, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
};

/**
 * Find user by username.
 * For login: pass schoolId to scope the lookup to the correct tenant.
 * For token verification (userId-only context): omit schoolId.
 */
const findByUsername = async (username, schoolId = null) => {
  if (schoolId) {
    return await db.queryOne(
      `SELECT id, school_id, username, email, password_hash, role, is_active,
              last_login, created_at, updated_at
       FROM users
       WHERE username = $1 AND school_id = $2`,
      [username, schoolId]
    );
  }

  // Fallback: unscoped lookup (used by JWT middleware where only username is known)
  return await db.queryOne(
    `SELECT id, school_id, username, email, password_hash, role, is_active,
            last_login, created_at, updated_at
     FROM users
     WHERE username = $1`,
    [username]
  );
};

/**
 * Find user by email (scoped to school).
 * Always scope by school_id — email uniqueness is per-school.
 */
const findByEmail = async (email, schoolId = null) => {
  if (schoolId) {
    return await db.queryOne(
      `SELECT id, school_id, username, email, password_hash, role, is_active,
              last_login, created_at, updated_at
       FROM users
       WHERE email = $1 AND school_id = $2`,
      [email, schoolId]
    );
  }

  return await db.queryOne(
    `SELECT id, school_id, username, email, password_hash, role, is_active,
            last_login, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );
};

/**
 * Update user fields.
 */
const update = async (userId, updates) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(updates.email);
  }
  if (updates.password_hash !== undefined) {
    fields.push(`password_hash = $${paramCount++}`);
    values.push(updates.password_hash);
  }
  if (updates.is_active !== undefined) {
    fields.push(`is_active = $${paramCount++}`);
    values.push(updates.is_active);
  }
  if (updates.last_login !== undefined) {
    fields.push(`last_login = $${paramCount++}`);
    values.push(updates.last_login);
  }

  if (fields.length === 0) throw new Error('No fields to update');

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(userId);

  return await db.queryOne(
    `UPDATE users
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING id, school_id, username, email, role, is_active, last_login, updated_at`,
    values
  );
};

/**
 * Soft-delete a user (sets is_active = FALSE).
 */
const softDelete = async (userId) => {
  return await db.queryOne(
    `UPDATE users
     SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id`,
    [userId]
  );
};

/**
 * List users — ALWAYS scoped to a school.
 */
const findAll = async (schoolId, filters = {}) => {
  const { role, is_active, limit = 50, offset = 0 } = filters;

  let query = `
    SELECT id, school_id, username, email, role, is_active, last_login, created_at
    FROM users
    WHERE school_id = $1
  `;
  const values = [schoolId];
  let paramCount = 2;

  if (role) {
    query += ` AND role = $${paramCount++}`;
    values.push(role);
  }
  if (is_active !== undefined) {
    query += ` AND is_active = $${paramCount++}`;
    values.push(is_active);
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
  values.push(limit, offset);

  return await db.queryAll(query, values);
};

/**
 * Count users — ALWAYS scoped to a school.
 */
const count = async (schoolId, filters = {}) => {
  const { role, is_active } = filters;

  let query = `SELECT COUNT(*) AS count FROM users WHERE school_id = $1`;
  const values = [schoolId];
  let paramCount = 2;

  if (role) {
    query += ` AND role = $${paramCount++}`;
    values.push(role);
  }
  if (is_active !== undefined) {
    query += ` AND is_active = $${paramCount++}`;
    values.push(is_active);
  }

  const result = await db.queryOne(query, values);
  return parseInt(result.count, 10);
}
const findSchoolBySlug = async (slug) => {
  return db.queryOne(
    `SELECT id FROM schools 
     WHERE (LOWER(slug) = LOWER($1) OR LOWER(name) = LOWER($1)) 
     AND is_active = true`,
    [slug]
  );
};

module.exports = {
  create,
  findById,
  findByUsername,
  findByEmail,
  update,
  softDelete,
  findAll,
  count,
  findSchoolBySlug,
};