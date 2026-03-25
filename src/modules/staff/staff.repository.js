/**
 * Staff Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
const db = require('../../shared/database/client');

class StaffRepository {

  async create(staffData, schoolId) {
    const { userId, firstName, lastName, phone, email, employeeNumber, position, department, hireDate, isActive = true } = staffData;
    return db.queryOne(
      `INSERT INTO staff (user_id,first_name,last_name,phone,email,employee_number,position,department,hire_date,is_active,school_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [userId, firstName, lastName, phone, email, employeeNumber, position, department, hireDate, isActive, schoolId]
    );
  }

  async findById(schoolId, id) {
    return db.queryOne(
      `SELECT s.*, u.username, u.role, u.is_active AS user_is_active
       FROM staff s JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 AND s.school_id = $2`,
      [id, schoolId]
    );
  }

  async findByEmployeeNumber(schoolId, employeeNumber) {
    return db.queryOne(
      `SELECT s.*, u.username, u.role FROM staff s JOIN users u ON s.user_id = u.id
       WHERE s.employee_number = $1 AND s.school_id = $2`,
      [employeeNumber, schoolId]
    );
  }

  async findByUserId(schoolId, userId) {
    return db.queryOne(`SELECT * FROM staff WHERE user_id = $1 AND school_id = $2`, [userId, schoolId]);
  }

  async findByEmail(schoolId, email) {
    return db.queryOne(`SELECT * FROM staff WHERE email = $1 AND school_id = $2`, [email, schoolId]);
  }

  async findAll(schoolId, filters = {}) {
    const { page = 1, limit = 20, department, position, isActive, search } = filters;
    const offset = (page - 1) * limit;
    const conditions = ['s.school_id = $1'];
    const params = [schoolId];
    let p = 1;

    if (department) { conditions.push(`s.department = $${++p}`); params.push(department); }
    if (position)   { conditions.push(`s.position = $${++p}`);   params.push(position); }
    if (isActive !== undefined) { conditions.push(`s.is_active = $${++p}`); params.push(isActive); }
    if (search) {
      conditions.push(`(s.first_name ILIKE $${++p} OR s.last_name ILIKE $${p} OR s.employee_number ILIKE $${p} OR s.email ILIKE $${p})`);
      params.push(`%${search}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await db.queryOne(`SELECT COUNT(*) AS total FROM staff s ${where}`, params);

    params.push(limit, offset);
    const staff = await db.queryAll(
      `SELECT s.*, u.username, u.role, u.is_active AS user_is_active
       FROM staff s JOIN users u ON s.user_id = u.id
       ${where} ORDER BY s.employee_number ASC
       LIMIT $${p+1} OFFSET $${p+2}`,
      params
    );

    return {
      data: staff,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.total), totalPages: Math.ceil(countResult.total / limit) }
    };
  }

  async findByDepartment(schoolId, department) {
    return db.queryAll(
      `SELECT s.*, u.username, u.role FROM staff s JOIN users u ON s.user_id = u.id
       WHERE s.department = $1 AND s.school_id = $2 AND s.is_active = TRUE
       ORDER BY s.last_name, s.first_name`,
      [department, schoolId]
    );
  }

  async update(schoolId, id, updateData) {
    const fields = [], params = [];
    let p = 0;
    const allowed = ['first_name','last_name','phone','email','employee_number','position','department','hire_date','is_active'];
    allowed.forEach(field => {
      const camel = field.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      if (updateData[camel] !== undefined) { fields.push(`${field} = $${++p}`); params.push(updateData[camel]); }
    });
    if (!fields.length) throw new Error('No valid fields to update');
    params.push(id, schoolId);
    return db.queryOne(
      `UPDATE staff SET ${fields.join(', ')} WHERE id = $${p+1} AND school_id = $${p+2} RETURNING *`,
      params
    );
  }

  async softDelete(schoolId, id) {
    return db.queryOne(`UPDATE staff SET is_active = FALSE WHERE id = $1 AND school_id = $2 RETURNING *`, [id, schoolId]);
  }

  async delete(schoolId, id) {
    return db.queryOne(`DELETE FROM staff WHERE id = $1 AND school_id = $2 RETURNING *`, [id, schoolId]);
  }

  async getStats(schoolId) {
    return db.queryOne(
      `SELECT COUNT(*) AS total_staff, COUNT(*) FILTER (WHERE is_active=TRUE) AS active_staff,
       COUNT(*) FILTER (WHERE is_active=FALSE) AS inactive_staff,
       COUNT(DISTINCT department) AS total_departments, COUNT(DISTINCT position) AS total_positions
       FROM staff WHERE school_id = $1`,
      [schoolId]
    );
  }

  async getDepartmentBreakdown(schoolId) {
    return db.queryAll(
      `SELECT department, COUNT(*) AS staff_count, COUNT(*) FILTER (WHERE is_active=TRUE) AS active_count
       FROM staff WHERE department IS NOT NULL AND school_id = $1
       GROUP BY department ORDER BY staff_count DESC`,
      [schoolId]
    );
  }

  async employeeNumberExists(schoolId, employeeNumber, excludeId = null) {
    let q = `SELECT EXISTS(SELECT 1 FROM staff WHERE employee_number = $1 AND school_id = $2`;
    const p = [employeeNumber, schoolId];
    if (excludeId) { q += ` AND id != $3`; p.push(excludeId); }
    const r = await db.queryOne(q + `) AS exists`, p);
    return r.exists;
  }

  async emailExists(schoolId, email, excludeId = null) {
    let q = `SELECT EXISTS(SELECT 1 FROM staff WHERE email = $1 AND school_id = $2`;
    const p = [email, schoolId];
    if (excludeId) { q += ` AND id != $3`; p.push(excludeId); }
    const r = await db.queryOne(q + `) AS exists`, p);
    return r.exists;
  }
}

module.exports = new StaffRepository();