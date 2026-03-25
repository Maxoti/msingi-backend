/**
 * Subjects API Integration Tests
 * Comprehensive tests for subjects management endpoints with CBC support
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

const SCHOOL_SLUG = 'subjects-test-school';

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let adminToken;
let teacherToken;
let testSubject1;
let testSubject2;
let testSubject3;

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  school = await createTestSchool(SCHOOL_SLUG, { name: 'Subjects Test School' });

  await createTestUser(
    school.id,
    'subjectsadmin',
    'subjectsadmin@test.com',
    'admin123',
    'ADMIN'
  );
  await createTestUser(
    school.id,
    'subjectsteacher',
    'subjectsteacher@test.com',
    'teacher123',
    'TEACHER'
  );

  adminToken   = await getAuthToken(app, 'subjectsadmin',   'admin123');
  teacherToken = await getAuthToken(app, 'subjectsteacher', 'teacher123');
});

/* -------------------------------------------------------------------------- */
/*                        CREATE SUBJECT TESTS                                */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/subjects', () => {
  test('should create a new subject with admin token', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Test Mathematics',
        code:             'TEST_MATH',
        description:      'Mathematics for testing',
        grade_levels:     ['GRADE_4', 'GRADE_5', 'GRADE_6'],
        lessons_per_week: 5,
        category:         'MATHEMATICS',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.name).toBe('Test Mathematics');
    expect(response.body.data.code).toBe('TEST_MATH');
    expect(response.body.data.grade_levels).toEqual(['GRADE_4', 'GRADE_5', 'GRADE_6']);
    expect(response.body.data.lessons_per_week).toBe(5);
    expect(response.body.data.category).toBe('MATHEMATICS');
    expect(response.body.data.is_active).toBe(true);

    testSubject1 = response.body.data;
  });

  test('should create subject without grade levels', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Test Creative Arts',
        code:             'TEST_CREATIVE',
        description:      'Creative arts for testing',
        lessons_per_week: 6,
        category:         'CREATIVE_ARTS',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grade_levels).toEqual([]);

    testSubject2 = response.body.data;
  });

  test('should create subject for junior school', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Test Integrated Science',
        code:             'TEST_SCIE',
        description:      'Science for junior school',
        grade_levels:     ['GRADE_7', 'GRADE_8', 'GRADE_9'],
        lessons_per_week: 5,
        category:         'SCIENCES',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grade_levels).toEqual(['GRADE_7', 'GRADE_8', 'GRADE_9']);

    testSubject3 = response.body.data;
  });

  test('should fail to create subject without required fields', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Missing name and code' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('required');
  });

  test('should fail to create subject with invalid grade level', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Test Invalid Grade',
        code:             'TEST_INVALID_GRADE',
        grade_levels:     ['GRADE_10', 'INVALID_LEVEL'],
        lessons_per_week: 5,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Invalid grade levels');
  });

  test('should fail to create subject with invalid lessons per week', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Test Invalid Lessons',
        code:             'TEST_INVALID_LPW',
        lessons_per_week: 15, // exceeds max of 10
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('between 1 and 10');
  });

  test('should fail to create duplicate subject code', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:             'Duplicate Math',
        code:             'TEST_MATH', // already exists
        lessons_per_week: 5,
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('already exists');
  });

  test('should fail to create subject with invalid category', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name:     'Test Invalid Category',
        code:     'TEST_INVALID_CAT',
        category: 'INVALID_CATEGORY',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Invalid category');
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Test Unauthorized', code: 'TEST_UNAUTH', lessons_per_week: 5 });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/subjects')
      .send({ name: 'Test No Auth', code: 'TEST_NO_AUTH' });

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                          GET SUBJECTS TESTS                                */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects', () => {
  test('should get all subjects with admin token', async () => {
    const response = await request(app)
      .get('/api/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination).toBeDefined();
  });

  test('should get all subjects with teacher token', async () => {
    const response = await request(app)
      .get('/api/v1/subjects')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should filter subjects by category', async () => {
    const response = await request(app)
      .get('/api/v1/subjects?category=MATHEMATICS')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.every(s => s.category === 'MATHEMATICS')).toBe(true);
  });

  test('should filter subjects by active status', async () => {
    const response = await request(app)
      .get('/api/v1/subjects?is_active=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.every(s => s.is_active === true)).toBe(true);
  });

  test('should support pagination', async () => {
    const response = await request(app)
      .get('/api/v1/subjects?page=1&limit=2')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(2);
  });

  test('should fail without authentication', async () => {
    const response = await request(app).get('/api/v1/subjects');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                      GET SUBJECT BY ID TESTS                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects/:id', () => {
  test('should get subject by ID', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(testSubject1.id);
    expect(response.body.data.name).toBe('Test Mathematics');
  });

  test('should allow teacher to view subject', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail with non-existent ID', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                    GET SUBJECT BY CODE TESTS                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects/code/:code', () => {
  test('should get subject by code', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/code/TEST_MATH')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.code).toBe('TEST_MATH');
  });

  test('should fail with non-existent code', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/code/NONEXISTENT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                  GET SUBJECTS BY GRADE LEVEL TESTS                         */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects/grade/:gradeLevel', () => {
  test('should get subjects for upper primary', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/grade/GRADE_4')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);

    const found = response.body.data.find(s => s.code === 'TEST_MATH');
    expect(found).toBeDefined();
  });

  test('should get subjects for junior school', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/grade/GRADE_7')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const found = response.body.data.find(s => s.code === 'TEST_SCIE');
    expect(found).toBeDefined();
  });

  test('should fail with invalid grade level', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/grade/INVALID_GRADE')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                    GET SUBJECTS BY CATEGORY TESTS                          */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects/category/:category', () => {
  test('should get subjects by category', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/category/MATHEMATICS')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.every(s => s.category === 'MATHEMATICS')).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                        GET METADATA TESTS                                  */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/subjects/grade-levels', () => {
  test('should get valid grade levels', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/grade-levels')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toContain('GRADE_1');
    expect(response.body.data).toContain('GRADE_9');
  });
});

describe('GET /api/v1/subjects/valid-categories', () => {
  test('should get valid categories', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/valid-categories')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data).toContain('MATHEMATICS');
    expect(response.body.data).toContain('SCIENCES');
  });
});

describe('GET /api/v1/subjects/statistics', () => {
  test('should get subjects statistics', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/statistics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('total_subjects');
    expect(response.body.data).toHaveProperty('active_subjects');
    expect(response.body.data).toHaveProperty('inactive_subjects');
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .get('/api/v1/subjects/statistics')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                         UPDATE SUBJECT TESTS                               */
/* -------------------------------------------------------------------------- */

describe('PUT /api/v1/subjects/:id', () => {
  test('should update subject name and description', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Mathematics Updated', description: 'Updated description' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe('Test Mathematics Updated');
    expect(response.body.data.description).toBe('Updated description');
  });

  test('should update grade levels', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grade_levels: ['GRADE_4', 'GRADE_5'] });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.grade_levels).toEqual(['GRADE_4', 'GRADE_5']);
  });

  test('should update lessons per week', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ lessons_per_week: 4 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.lessons_per_week).toBe(4);
  });

  test('should fail without admin authorization', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Unauthorized Update' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail with non-existent subject', async () => {
    const response = await request(app)
      .put('/api/v1/subjects/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Update Non-existent' });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('should fail with invalid grade levels', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grade_levels: ['INVALID_GRADE'] });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                    DEACTIVATE / ACTIVATE TESTS                             */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/subjects/:id/deactivate', () => {
  test('should deactivate a subject', async () => {
    expect(testSubject2).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/subjects/${testSubject2.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.is_active).toBe(false);
  });

  test('should fail to deactivate already deactivated subject', async () => {
    expect(testSubject2).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/subjects/${testSubject2.id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail without admin authorization', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/subjects/${testSubject1.id}/deactivate`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

describe('POST /api/v1/subjects/:id/activate', () => {
  test('should activate a subject', async () => {
    expect(testSubject2).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/subjects/${testSubject2.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.is_active).toBe(true);
  });

  test('should fail to activate already active subject', async () => {
    expect(testSubject2).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/subjects/${testSubject2.id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                         DELETE SUBJECT TESTS                               */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/v1/subjects/:id', () => {
  test('should delete a subject', async () => {
    expect(testSubject3).toBeDefined();

    const response = await request(app)
      .delete(`/api/v1/subjects/${testSubject3.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify hard deletion
    const deleted = await db.queryOne(
      'SELECT id FROM subjects WHERE id = $1',
      [testSubject3.id]
    );
    expect(deleted).toBeNull();
  });

  test('should fail without admin authorization', async () => {
    expect(testSubject1).toBeDefined();

    const response = await request(app)
      .delete(`/api/v1/subjects/${testSubject1.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail with non-existent subject', async () => {
    const response = await request(app)
      .delete('/api/v1/subjects/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 CLEANUP                                    */
/* -------------------------------------------------------------------------- */

afterAll(async () => {
  // Deleting the school cascades to all child records automatically.
  // Any subjects rows that are school-scoped will be removed.
  // Any remaining TEST_ subjects (if subjects are global) are removed below.
  await db.query(`DELETE FROM subjects WHERE code LIKE 'TEST_%'`);
  await destroyTestSchool(SCHOOL_SLUG);
});