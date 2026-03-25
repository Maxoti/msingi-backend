/**
 * Staff Service
 * Business logic for staff management
 * schoolId threaded through every operation for multi-tenancy
 */

const staffRepository = require('./staff.repository');
const bcrypt          = require('bcryptjs');
const db              = require('../../shared/database/client');
const { AppError }    = require('../../shared/middleware/errorHandler');
const cache           = require('../../shared/cache/cache.service');

class StaffService {

  async createStaff(staffData, schoolId, createdBy) {
    const {
      email, firstName, lastName, phone,
      employeeNumber, position, department, hireDate, role = 'TEACHER',
    } = staffData;

    const username = staffData.username ||
      `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, '');
    const password = staffData.password ||
      Math.random().toString(36).slice(-8) + 'A1';

    if (!email || !firstName || !lastName)
      throw new AppError('Missing required fields', 400);

    const validRoles   = ['ADMIN','TEACHER','ACCOUNTANT','PARENT'];
    const assignedRole = validRoles.includes(role) ? role : 'TEACHER';

    if (employeeNumber) {
      const exists = await staffRepository.employeeNumberExists(schoolId, employeeNumber);
      if (exists) throw new AppError('Employee number already exists', 409);
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_school_id', $1, true)`, [String(schoolId)]);

      const passwordHash = await bcrypt.hash(password, 8);
      const userResult   = await client.query(
        `INSERT INTO users (username, email, password_hash, role, is_active, school_id)
         VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id`,
        [username, email, passwordHash, assignedRole, schoolId]
      );
      const userId = userResult.rows[0].id;

      const staffResult = await client.query(
        `INSERT INTO staff (user_id, first_name, last_name, phone, email,
           employee_number, position, department, hire_date, is_active, school_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10) RETURNING *`,
        [userId, firstName, lastName, phone, email,
         employeeNumber, position, department, hireDate, schoolId]
      );

      await client.query('COMMIT');

      const staff = await staffRepository.findById(schoolId, staffResult.rows[0].id);

      // ✅ Invalidate cache
      await cache.delPattern(`staff:${schoolId}:*`);

      return { ...staff, password_hash: undefined, tempPassword: password };

    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        if (error.constraint?.includes('username')) throw new AppError('Username already exists', 409);
        if (error.constraint?.includes('email'))    throw new AppError('Email already exists', 409);
        if (error.constraint?.includes('employee')) throw new AppError('Employee number already exists', 409);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getStaffById(schoolId, id) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);
    return staff;
  }

  async getStaffByEmployeeNumber(schoolId, employeeNumber) {
    const staff = await staffRepository.findByEmployeeNumber(schoolId, employeeNumber);
    if (!staff) throw new AppError('Staff member not found', 404);
    return staff;
  }

  async getAllStaff(schoolId, filters) {
    const cacheKey = `staff:${schoolId}:${JSON.stringify(filters || {})}`;

    // ✅ Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const data = await staffRepository.findAll(schoolId, filters);

    // ✅ Store in cache
    await cache.set(cacheKey, data, cache.TTL.staff);

    return data;
  }

  async getStaffByDepartment(schoolId, department) {
    const cacheKey = `staff:${schoolId}:dept:${department}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const data = await staffRepository.findByDepartment(schoolId, department);
    await cache.set(cacheKey, data, cache.TTL.staff);
    return data;
  }

  async updateStaff(schoolId, id, updateData) {
    const existing = await staffRepository.findById(schoolId, id);
    if (!existing) throw new AppError('Staff member not found', 404);

    if (updateData.employeeNumber) {
      const exists = await staffRepository.employeeNumberExists(schoolId, updateData.employeeNumber, id);
      if (exists) throw new AppError('Employee number already exists', 409);
    }
    if (updateData.email) {
      const exists = await staffRepository.emailExists(schoolId, updateData.email, id);
      if (exists) throw new AppError('Email already exists', 409);
    }

    const result = await staffRepository.update(schoolId, id, updateData);

    // ✅ Invalidate cache
    await cache.delPattern(`staff:${schoolId}:*`);

    return result;
  }

  async deactivateStaff(schoolId, id) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET is_active = FALSE WHERE id = $1`, [staff.user_id]);
      const deactivated = await staffRepository.softDelete(schoolId, id);
      await client.query('COMMIT');

      //  Invalidate cache
      await cache.delPattern(`staff:${schoolId}:*`);

      return deactivated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async reactivateStaff(schoolId, id) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE users SET is_active = TRUE WHERE id = $1`, [staff.user_id]);
      const reactivated = await staffRepository.update(schoolId, id, { isActive: true });
      await client.query('COMMIT');

      //  Invalidate cache
      await cache.delPattern(`staff:${schoolId}:*`);

      return reactivated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteStaff(schoolId, id) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);

    const result = await staffRepository.delete(schoolId, id);

    // ✅ Invalidate cache
    await cache.delPattern(`staff:${schoolId}:*`);

    return result;
  }

  async getStaffStats(schoolId) {
    const cacheKey = `staff:${schoolId}:stats`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const stats               = await staffRepository.getStats(schoolId);
    const departmentBreakdown = await staffRepository.getDepartmentBreakdown(schoolId);
    const data = { ...stats, departments: departmentBreakdown };

    await cache.set(cacheKey, data, cache.TTL.dashboard);
    return data;
  }

  async updatePassword(schoolId, id, currentPassword, newPassword) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);

    const userResult = await db.queryOne(
      `SELECT password_hash FROM users WHERE id = $1`, [staff.user_id]
    );
    const isValid = await bcrypt.compare(currentPassword, userResult.password_hash);
    if (!isValid) throw new AppError('Current password is incorrect', 401);

    const newPasswordHash = await bcrypt.hash(newPassword, 8);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newPasswordHash, staff.user_id]);
    return { message: 'Password updated successfully' };
  }

  async resetPassword(schoolId, id, newPassword) {
    const staff = await staffRepository.findById(schoolId, id);
    if (!staff) throw new AppError('Staff member not found', 404);

    const newPasswordHash = await bcrypt.hash(newPassword, 8);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newPasswordHash, staff.user_id]);
    return { message: 'Password reset successfully' };
  }

  async getMyProfile(schoolId, userId) {
    const staff = await staffRepository.findByUserId(schoolId, userId);
    if (!staff) throw new AppError('Staff profile not found', 404);
    return staff;
  }

  async updateMyProfile(schoolId, userId, updateData) {
    const staff = await staffRepository.findByUserId(schoolId, userId);
    if (!staff) throw new AppError('Staff profile not found', 404);

    const allowedFields = { phone: updateData.phone, email: updateData.email };
    if (allowedFields.email) {
      const exists = await staffRepository.emailExists(schoolId, allowedFields.email, staff.id);
      if (exists) throw new AppError('Email already exists', 409);
    }

    const result = await staffRepository.update(schoolId, staff.id, allowedFields);

    //  Invalidate cache
    await cache.delPattern(`staff:${schoolId}:*`);

    return result;
  }
}

module.exports = new StaffService();