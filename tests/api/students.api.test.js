/**
 * Students API Integration Tests
 * Tests all HTTP endpoints for the students module
 */

const request = require('supertest');

const app = require('../../src/app');
const db  = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  createTestClass,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'students-test-school';

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let authToken;
let testClass;
let testStudent; // populated after first successful POST

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  school = await createTestSchool(SCHOOL_SLUG, { name: 'Students Test School' });

  await createTestUser(
    school.id,
    'testadmin',
    'testadmin@test.com',
    'testpass123',
    'ADMIN'
  );

  authToken = await getAuthToken(app, 'testadmin', 'testpass123');

  testClass = await createTestClass(school.id, 'API Test Class', 6);
});

/* -------------------------------------------------------------------------- */
/*                        POST /api/v1/students – Create                      */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/students - Create Student', () => {
  test('should create student with valid data', async () => {
    const studentData = {
      admission_no:   `API_TEST_${Date.now()}`,
      first_name:     'John',
      last_name:      'Doe',
      gender:         'MALE',
      date_of_birth:  '2010-01-15',
      class_id:       testClass.id,
      admission_date: '2024-01-15',
    };

    const response = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send(studentData);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.firstName).toBe('John');
    expect(response.body.data.lastName).toBe('Doe');

    testStudent = response.body.data; // store for subsequent tests
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/students')
      .send({
        admission_no:  'TEST_UNAUTH',
        first_name:    'Jane',
        last_name:     'Doe',
        gender:        'FEMALE',
        date_of_birth: '2010-02-20',
        class_id:      testClass.id,
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('should fail with invalid gender', async () => {
    const response = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        admission_no:   `API_TEST_GENDER_${Date.now()}`,
        first_name:     'Invalid',
        last_name:      'Gender',
        gender:         'INVALID',
        date_of_birth:  '2010-03-25',
        class_id:       testClass.id,
        admission_date: '2024-01-15',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail with duplicate admission number', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        admission_no:   testStudent.admissionNo, // camelCase from API response
        first_name:     'Duplicate',
        last_name:      'Student',
        gender:         'MALE',
        date_of_birth:  '2010-04-30',
        class_id:       testClass.id,
        admission_date: '2024-01-15',
      });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/already exists/i);
  });

  test('should fail with missing required fields', async () => {
    const response = await request(app)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        admission_no: `API_TEST_MISSING_${Date.now()}`,
        first_name:   'Missing',
        // missing: last_name, gender, date_of_birth, class_id, admission_date
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        GET /api/v1/students – List                         */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/students - List Students', () => {
  test('should get all students with pagination', async () => {
    const response = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ page: 1, limit: 20 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(20);
  });

  test('should search students by name', async () => {
    const response = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ search: 'John' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });

  test('should filter students by class', async () => {
    const response = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ class_id: testClass.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });

  test('should filter students by gender', async () => {
    const response = await request(app)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ gender: 'MALE' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail without authentication', async () => {
    const response = await request(app).get('/api/v1/students');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                   GET /api/v1/students/:id – Single Student                */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/students/:id - Get Single Student', () => {
  test('should get student by id', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/students/${testStudent.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(testStudent.id);
    expect(response.body.data.firstName).toBe('John');
  });

  test('should return 404 for non-existent student', async () => {
    const response = await request(app)
      .get('/api/v1/students/999999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('should fail without authentication', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/students/${testStudent.id}`);

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                   PUT /api/v1/students/:id – Update Student                */
/* -------------------------------------------------------------------------- */

describe('PUT /api/v1/students/:id - Update Student', () => {
  test('should update student with valid data', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/students/${testStudent.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ first_name: 'John Updated', last_name: 'Doe Updated' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.firstName).toBe('John Updated');
    expect(response.body.data.lastName).toBe('Doe Updated');
  });

  test('should return 404 for non-existent student', async () => {
    const response = await request(app)
      .put('/api/v1/students/999999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ first_name: 'Non Existent' });

    expect(response.status).toBe(404);
  });

  test('should fail without authentication', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/students/${testStudent.id}`)
      .send({ first_name: 'Unauthorized' });

    expect(response.status).toBe(401);
  });

  test('should validate gender on update', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/students/${testStudent.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ gender: 'INVALID' });

    expect(response.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/*                  DELETE /api/v1/students/:id – Delete Student              */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/v1/students/:id - Delete Student', () => {
  test('should soft-delete student', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .delete(`/api/v1/students/${testStudent.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify the row is marked inactive (DB columns remain snake_case)
    const row = await db.queryOne(
      'SELECT is_active FROM students WHERE id = $1',
      [testStudent.id]
    );
    expect(row.is_active).toBe(false);
  });

  test('should return 404 for non-existent student', async () => {
    const response = await request(app)
      .delete('/api/v1/students/999999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(404);
  });

  test('should fail without authentication', async () => {
    expect(testStudent).toBeDefined();

    const response = await request(app)
      .delete(`/api/v1/students/${testStudent.id}`);

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*          GET /api/v1/students/class/:classId – Students by Class           */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/students/class/:classId - Get Students by Class', () => {
  test('should get all students in a class', async () => {
    const response = await request(app)
      .get(`/api/v1/students/class/${testClass.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });

  test('should return empty array for class with no active students', async () => {
    // Use the helper so school_id is included
    const { createTestClass: makeClass } = require('../helpers/test-helpers');
    const emptyClass = await makeClass(school.id, `Empty Class ${Date.now()}`, 4);

    const response = await request(app)
      .get(`/api/v1/students/class/${emptyClass.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(0);

    await db.query('DELETE FROM classes WHERE id = $1', [emptyClass.id]);
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .get(`/api/v1/students/class/${testClass.id}`);

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*           GET /api/v1/students/statistics – Statistics                     */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/students/statistics - Get Statistics', () => {
  test('should get student statistics', async () => {
    const response = await request(app)
      .get('/api/v1/students/statistics')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // Statistics come directly from a DB query (snake_case, not mapped)
    expect(response.body.data).toHaveProperty('total_students');
    expect(response.body.data).toHaveProperty('male_students');
    expect(response.body.data).toHaveProperty('female_students');
    expect(response.body.data).toHaveProperty('active_students');
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .get('/api/v1/students/statistics');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 CLEANUP                                    */
/* -------------------------------------------------------------------------- */

afterAll(async () => {
  // Deleting the school cascades to all child records automatically
  await destroyTestSchool(SCHOOL_SLUG);
});