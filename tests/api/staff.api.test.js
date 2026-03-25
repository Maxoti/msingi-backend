/**
 * Staff API Integration Tests
 * Comprehensive tests for staff management endpoints
 */

const request = require('supertest');

const app = require('../../src/app');
const db  = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'staff-test-school';

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let adminToken;
let testStaff; // populated via the API in beforeAll

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  school = await createTestSchool(SCHOOL_SLUG, { name: 'Staff Test School' });

  await createTestUser(
    school.id,
    'staffadmin',
    'staffadmin@test.com',
    'admin123',
    'ADMIN'
  );

  adminToken = await getAuthToken(app, 'staffadmin', 'admin123');

  // Create the shared test staff member via the API so the full
  // user + staff creation path is exercised once up front.
  const timestamp = Date.now();
  const staffRes = await request(app)
    .post('/api/v1/staff')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      username:       `teststaff_main_${timestamp}`,
      email:          `teststaff_main_${timestamp}@test.com`,
      password:       'password123',
      role:           'TEACHER',
      firstName:      'John',
      lastName:       'Doe',
      phone:          '1234567890',
      employeeNumber: `TEST_EMP_MAIN_${timestamp}`,
      position:       'Teacher',
      department:     'Mathematics',
      hireDate:       '2024-01-01',
    });

  if (staffRes.status !== 201) {
    throw new Error(`Failed to create test staff: ${JSON.stringify(staffRes.body)}`);
  }

  testStaff = staffRes.body.data;
});

/* -------------------------------------------------------------------------- */
/*                            CREATE STAFF TESTS                              */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/staff', () => {
  test('should create a new staff member', async () => {
    const timestamp = Date.now();
    const staffData = {
      username:       `teststaff_${timestamp}`,
      email:          `teststaff_${timestamp}@test.com`,
      password:       'password123',
      role:           'TEACHER',
      firstName:      'Jane',
      lastName:       'Smith',
      phone:          '1234567891',
      employeeNumber: `TEST_EMP_${timestamp}`,
      position:       'Teacher',
      department:     'Science',
      hireDate:       '2024-01-01',
    };

    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(staffData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.first_name).toBe('Jane');

    // Clean up — staff row first (FK), then user
    await db.query('DELETE FROM staff WHERE id = $1', [res.body.data.id]);
    await db.query('DELETE FROM users WHERE id = $1', [res.body.data.user_id]);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/staff')
      .send({
        username:  'teststaff_unauth',
        email:     'teststaff_unauth@test.com',
        password:  'password123',
        firstName: 'Jane',
        lastName:  'Doe',
      });

    expect(res.status).toBe(401);
  });

  test('should fail with duplicate employee number', async () => {
    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username:       `teststaff_dup_${Date.now()}`,
        email:          `teststaff_dup_${Date.now()}@test.com`,
        password:       'password123',
        firstName:      'Jane',
        lastName:       'Smith',
        employeeNumber: testStaff.employee_number, // deliberately duplicate
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/employee number already exists/i);
  });

  test('should fail with missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'teststaff_incomplete' });

    expect(res.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/*                              GET STAFF TESTS                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/staff', () => {
  test('should get all staff members with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('should filter staff by department', async () => {
    const res = await request(app)
      .get('/api/v1/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ department: 'Mathematics' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should fail without authentication', async () => {
    const res = await request(app).get('/api/v1/staff');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/staff/:id', () => {
  test('should get staff by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/staff/${testStaff.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(testStaff.id);
  });

  test('should return 404 for non-existent staff', async () => {
    const res = await request(app)
      .get('/api/v1/staff/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*                            UPDATE STAFF TESTS                              */
/* -------------------------------------------------------------------------- */

describe('PUT /api/v1/staff/:id', () => {
  test('should update staff information', async () => {
    const res = await request(app)
      .put(`/api/v1/staff/${testStaff.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ position: 'Senior Teacher', phone: '9876543210' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.position).toBe('Senior Teacher');
  });

  test('should fail with non-existent staff', async () => {
    const res = await request(app)
      .put('/api/v1/staff/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ position: 'Senior Teacher' });

    expect(res.status).toBe(404);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .put(`/api/v1/staff/${testStaff.id}`)
      .send({ position: 'Senior Teacher' });

    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                       DEACTIVATE / REACTIVATE TESTS                        */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/staff/:id/deactivate', () => {
  test('should deactivate a staff member', async () => {
    const res = await request(app)
      .post(`/api/v1/staff/${testStaff.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_active).toBe(false);
  });

  test('should fail with non-existent staff', async () => {
    const res = await request(app)
      .post('/api/v1/staff/999999/deactivate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/staff/:id/reactivate', () => {
  test('should reactivate a staff member', async () => {
    const res = await request(app)
      .post(`/api/v1/staff/${testStaff.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.is_active).toBe(true);
  });

  test('should fail with non-existent staff', async () => {
    const res = await request(app)
      .post('/api/v1/staff/999999/reactivate')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*                             PASSWORD TESTS                                 */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/staff/:id/reset-password', () => {
  test('should reset staff password as admin', async () => {
    const res = await request(app)
      .post(`/api/v1/staff/${testStaff.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should fail with non-existent staff', async () => {
    const res = await request(app)
      .post('/api/v1/staff/999999/reset-password')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'newpassword123' });

    expect(res.status).toBe(404);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/staff/${testStaff.id}/reset-password`)
      .send({ newPassword: 'newpassword123' });

    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 CLEANUP                                    */
/* -------------------------------------------------------------------------- */

afterAll(async () => {
  // Deleting the school cascades to all child records automatically
  await destroyTestSchool(SCHOOL_SLUG);
});