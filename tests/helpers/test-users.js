/**
 * Test Users Helper
 * Provides helper functions for authentication and test user management
 */

const request = require('supertest');
const app = require('../../src/app');
const bcrypt = require('bcrypt');
const db = require('../../src/shared/database/client');

// Cache test users but NOT tokens (tokens can expire)
let cachedTestUsers = null;

// Cached test school id
let testSchoolId = null;

/**
 * Get or create the single test school used across all tests.
 * All test users, staff, students etc. belong to this school.
 */
async function getTestSchoolId() {
  if (testSchoolId) return testSchoolId;

  const result = await db.query(
    `INSERT INTO schools (name, short_name, slug, email, plan)
     VALUES ('Test School', 'TS', 'test-school', 'test@school.com', 'PRO')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );

  testSchoolId = result.rows[0].id;
  return testSchoolId;
}

/**
 * Create a test user with all required fields.
 * Matches the users table schema: username, email, password_hash, role, school_id
 *
 * @param {string} username - Unique username (unique per school)
 * @param {string} password - Plain text password (will be hashed)
 * @param {string} role     - One of: 'ADMIN', 'TEACHER', 'ACCOUNTANT'
 * @returns {Promise<Object>} Created user object
 */
async function createTestUser(username, password, role = 'ADMIN') {
  const schoolId = await getTestSchoolId();
  const hashedPassword = await bcrypt.hash(password, 10);
  const email = `${username}@test.com`;

  const result = await db.query(
    `INSERT INTO users (username, email, password_hash, role, school_id, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (school_id, username) DO UPDATE
     SET password_hash = $3, email = $2, role = $4
     RETURNING *`,
    [username, email, hashedPassword, role, schoolId]
  );

  return result.rows[0];
}

/**
 * Delete a test user by username (scoped to test school)
 * @param {string} username - Username to delete
 */
async function deleteTestUser(username) {
  const schoolId = await getTestSchoolId();
  await db.query(
    'DELETE FROM users WHERE username = $1 AND school_id = $2',
    [username, schoolId]
  );
}

/**
 * Get admin authentication token.
 * Always generates a fresh token (no caching).
 */
async function getAdminToken() {
  await createTestUser('admin', 'Admin123!', 'ADMIN');

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'Admin123!' });

  if (response.status === 200 && response.body.data?.token) {
    return response.body.data.token;
  }

  throw new Error('Failed to get admin token. Response: ' + JSON.stringify(response.body));
}

/**
 * Get teacher authentication token.
 * Always generates a fresh token (no caching).
 */
async function getTeacherToken() {
  await createTestUser('teacher', 'Teacher123!', 'TEACHER');

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'teacher', password: 'Teacher123!' });

  if (response.status === 200 && response.body.data?.token) {
    return response.body.data.token;
  }

  throw new Error('Failed to get teacher token. Response: ' + JSON.stringify(response.body));
}

/**
 * Get accountant authentication token.
 * Always generates a fresh token (no caching).
 */
async function getAccountantToken() {
  await createTestUser('accountant', 'Accountant123!', 'ACCOUNTANT');

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'accountant', password: 'Accountant123!' });

  if (response.status === 200 && response.body.data?.token) {
    return response.body.data.token;
  }

  throw new Error('Failed to get accountant token. Response: ' + JSON.stringify(response.body));
}

/**
 * Get test users from database (scoped to test school)
 */
async function getTestUsers() {
  if (cachedTestUsers) return cachedTestUsers;

  const schoolId = await getTestSchoolId();

  const adminUser   = await createTestUser('admin',   'Admin123!',   'ADMIN');
  const teacherUser = await createTestUser('teacher', 'Teacher123!', 'TEACHER');

  const staffQuery = await db.query(
    `SELECT s.id, s.first_name, s.last_name, s.employee_number, s.position, s.department,
            u.id AS user_id, u.username, u.email, u.role
     FROM users u
     LEFT JOIN staff s ON s.user_id = u.id AND s.school_id = $1
     WHERE u.username IN ('admin', 'teacher')
       AND u.school_id = $1
     ORDER BY u.role DESC`,
    [schoolId]
  );

  const adminStaffRecord   = staffQuery.rows.find(s => s.username === 'admin');
  const teacherStaffRecord = staffQuery.rows.find(s => s.username === 'teacher');

  cachedTestUsers = {
    admin:        adminUser,
    teacher:      teacherUser,
    adminStaff:   adminStaffRecord  || adminUser,
    teacherStaff: teacherStaffRecord || teacherUser
  };

  return cachedTestUsers;
}

/**
 * Create a test staff member (scoped to test school)
 * @param {Object} staffData - Staff member data
 */
async function createTestStaff(staffData) {
  const schoolId = await getTestSchoolId();

  const result = await db.query(
    `INSERT INTO staff (
       user_id, first_name, last_name, employee_number,
       position, department, school_id, hire_date, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, TRUE)
     ON CONFLICT (school_id, employee_number) DO UPDATE
     SET first_name = $2, last_name = $3, position = $5, department = $6
     RETURNING *`,
    [
      staffData.user_id,
      staffData.first_name    || 'Test',
      staffData.last_name     || 'Staff',
      staffData.employee_number || `TEST${Date.now()}`,
      staffData.position      || 'Teacher',
      staffData.department    || 'General',
      schoolId
    ]
  );

  return result.rows[0];
}

/**
 * Delete test staff member
 * @param {number} staffId - Staff ID to delete
 */
async function deleteTestStaff(staffId) {
  await db.query('DELETE FROM staff WHERE id = $1', [staffId]);
}

/**
 * Clear user and school cache (useful for testing logout scenarios)
 */
function clearTokenCache() {
  cachedTestUsers = null;
  testSchoolId    = null;
}

/**
 * Setup test data — creates the test school, users, and staff records
 */
async function setupTestData() {
  const adminUser   = await createTestUser('admin',   'Admin123!',   'ADMIN');
  const teacherUser = await createTestUser('teacher', 'Teacher123!', 'TEACHER');

  const adminStaff = await createTestStaff({
    user_id:         adminUser.id,
    first_name:      'Admin',
    last_name:       'User',
    employee_number: 'ADMIN001',
    position:        'Administrator',
    department:      'Administration'
  });

  const teacherStaff = await createTestStaff({
    user_id:         teacherUser.id,
    first_name:      'Teacher',
    last_name:       'User',
    employee_number: 'TEACH001',
    position:        'Teacher',
    department:      'Teaching'
  });

  return {
    schoolId: await getTestSchoolId(),
    users:  { admin: adminUser,  teacher: teacherUser  },
    staff:  { admin: adminStaff, teacher: teacherStaff }
  };
}

/**
 * Cleanup test data — removes test users, staff, and the test school
 */
async function cleanupTestData() {
  const schoolId = await getTestSchoolId();

  // Delete staff first (foreign key dependency)
  await db.query(
    `DELETE FROM staff
     WHERE school_id = $1
       AND user_id IN (
         SELECT id FROM users
         WHERE username IN ('admin', 'teacher', 'accountant')
           AND school_id = $1
       )`,
    [schoolId]
  );

  // Delete users
  await db.query(
    `DELETE FROM users
     WHERE username IN ('admin', 'teacher', 'accountant')
       AND school_id = $1`,
    [schoolId]
  );

  clearTokenCache();
}

module.exports = {
  getTestSchoolId,       // ← new export — use this in other test helpers
  createTestUser,
  deleteTestUser,
  getAdminToken,
  getTeacherToken,
  getAccountantToken,
  getTestUsers,
  createTestStaff,
  deleteTestStaff,
  clearTokenCache,
  setupTestData,
  cleanupTestData
};