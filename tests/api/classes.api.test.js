/**
 * Classes API Integration Tests
 * Comprehensive tests for class management endpoints
 */

const request    = require('supertest');
const app        = require('../../src/app');
const db         = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'classes-test-school';

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let adminToken;
let teacherToken;
let adminUser;
let teacherUser;
let testTeacher;   // staff row
let testClass;

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */
beforeAll(async () => {
  console.log('⚙️  Setting up classes tests...');

  // Root tenant — cascade-deletes everything on teardown
  school = await createTestSchool(SCHOOL_SLUG, { name: 'Classes Test School' });

  // Users
  adminUser = await createTestUser(
    school.id, 'classadmin', 'classadmin@test.com', 'admin123', 'ADMIN'
  );
  teacherUser = await createTestUser(
    school.id, 'classteacher', 'classteacher@test.com', 'teacher123', 'TEACHER'
  );

  // Staff record for the teacher (school-scoped)
  await db.query(
    `DELETE FROM staff WHERE school_id = $1 AND employee_number = $2`,
    [school.id, 'TEST_TEACHER_001']
  );
  testTeacher = await db.queryOne(
    `INSERT INTO staff
       (school_id, user_id, first_name, last_name, employee_number,
        position, department, hire_date, is_active)
     VALUES ($1, $2, 'Test', 'Teacher', 'TEST_TEACHER_001',
             'Teacher', 'Mathematics', CURRENT_DATE, TRUE)
     RETURNING *`,
    [school.id, teacherUser.id]
  );

  // Tokens
  adminToken   = await getAuthToken(app, 'classadmin',   'admin123');
  teacherToken = await getAuthToken(app, 'classteacher', 'teacher123');

  // Shared test class (school-scoped)
  const timestamp = Date.now();
  testClass = await db.queryOne(
    `INSERT INTO classes (school_id, name, grade_level, capacity, class_teacher_id)
     VALUES ($1, $2, 5, 30, $3)
     RETURNING *`,
    [school.id, `TEST_CLASS_MAIN_${timestamp}`, testTeacher.id]
  );

  console.log('✅ Test setup complete\n');
});

/* -------------------------------------------------------------------------- */
/*                            CREATE CLASS TESTS                              */
/* -------------------------------------------------------------------------- */
describe('POST /api/v1/classes', () => {
  test('should create a new class with admin token', async () => {
    const classData = {
      name:             `TEST_CLASS_NEW_${Date.now()}`,
      grade_level:      6,
      capacity:         30,
      class_teacher_id: testTeacher.id,
    };

    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(classData);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.name).toBe(classData.name);
    expect(response.body.data.grade_level).toBe(classData.grade_level);

    await db.query('DELETE FROM classes WHERE id = $1', [response.body.data.id]);
  });

  test('should create a class without a teacher', async () => {
    const classData = {
      name:        `TEST_CLASS_NO_TEACHER_${Date.now()}`,
      grade_level: 7,
      capacity:    25,
    };

    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(classData);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.class_teacher_id).toBeNull();

    await db.query('DELETE FROM classes WHERE id = $1', [response.body.data.id]);
  });

  test('should fail to create class without required fields', async () => {
    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ grade_level: 4 }); // missing name and capacity

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail to create class with duplicate name', async () => {
    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: testClass.name, grade_level: 5, capacity: 30 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .post('/api/v1/classes')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: `TEST_CLASS_UNAUTH_${Date.now()}`, grade_level: 8, capacity: 30 });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/classes')
      .send({ name: `TEST_CLASS_NOAUTH_${Date.now()}`, grade_level: 8, capacity: 30 });

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                            GET CLASSES TESTS                               */
/* -------------------------------------------------------------------------- */
describe('GET /api/v1/classes', () => {
  test('should get all classes with admin token', async () => {
    const response = await request(app)
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should get all classes with teacher token', async () => {
    const response = await request(app)
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should filter classes by grade level', async () => {
    const response = await request(app)
      .get('/api/v1/classes?grade_level=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail without authentication', async () => {
    const response = await request(app).get('/api/v1/classes');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                        GET CLASS BY ID TESTS                               */
/* -------------------------------------------------------------------------- */
describe('GET /api/v1/classes/:id', () => {
  test('should get class by ID', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(testClass.id);
  });

  test('should fail with non-existent class ID', async () => {
    const response = await request(app)
      .get('/api/v1/classes/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('should allow teacher to view class', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                           UPDATE CLASS TESTS                               */
/* -------------------------------------------------------------------------- */
describe('PUT /api/v1/classes/:id', () => {
  test('should update class name', async () => {
    const newName = `TEST_CLASS_UPDATED_${Date.now()}`;

    const response = await request(app)
      .put(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: newName });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.name).toBe(newName);

    testClass.name = newName; // keep reference in sync
  });

  test('should update class capacity', async () => {
    const response = await request(app)
      .put(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ capacity: 35 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.capacity).toBe(35);
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .put(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Updated Name' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail with non-existent class', async () => {
    const response = await request(app)
      .put('/api/v1/classes/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        GET CLASS STUDENTS TESTS                            */
/* -------------------------------------------------------------------------- */
describe('GET /api/v1/classes/:id/students', () => {
  test('should get all students in a class', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}/students`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should allow teacher to view class students', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}/students`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail with non-existent class', async () => {
    const response = await request(app)
      .get('/api/v1/classes/999999/students')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        ASSIGN TEACHER TESTS                                */
/* -------------------------------------------------------------------------- */
describe('POST /api/v1/classes/:id/teacher', () => {
  let classWithoutTeacher;

  beforeAll(async () => {
    classWithoutTeacher = await db.queryOne(
      `INSERT INTO classes (school_id, name, grade_level, capacity)
       VALUES ($1, $2, 3, 25)
       RETURNING *`,
      [school.id, `TEST_CLASS_NO_TEACHER_ASSIGN_${Date.now()}`]
    );
  });

  afterAll(async () => {
    if (classWithoutTeacher?.id) {
      await db.query('DELETE FROM classes WHERE id = $1', [classWithoutTeacher.id]);
    }
  });

  test('should assign teacher to class', async () => {
    const response = await request(app)
      .post(`/api/v1/classes/${classWithoutTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacher_id: testTeacher.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.class_teacher_id).toBe(testTeacher.id);
  });

  test('should fail without teacher_id', async () => {
    const response = await request(app)
      .post(`/api/v1/classes/${classWithoutTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail with invalid teacher', async () => {
    const response = await request(app)
      .post(`/api/v1/classes/${classWithoutTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teacher_id: 999999 });

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .post(`/api/v1/classes/${classWithoutTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ teacher_id: testTeacher.id });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        REMOVE TEACHER TESTS                                */
/* -------------------------------------------------------------------------- */
describe('DELETE /api/v1/classes/:id/teacher', () => {
  let classWithTeacher;

  beforeAll(async () => {
    classWithTeacher = await db.queryOne(
      `INSERT INTO classes (school_id, name, grade_level, capacity, class_teacher_id)
       VALUES ($1, $2, 4, 30, $3)
       RETURNING *`,
      [school.id, `TEST_CLASS_WITH_TEACHER_REMOVE_${Date.now()}`, testTeacher.id]
    );
  });

  afterAll(async () => {
    if (classWithTeacher?.id) {
      await db.query('DELETE FROM classes WHERE id = $1', [classWithTeacher.id]);
    }
  });

  test('should remove teacher from class', async () => {
    const response = await request(app)
      .delete(`/api/v1/classes/${classWithTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.class_teacher_id).toBeNull();
  });

  test('should fail when class has no teacher', async () => {
    // Teacher was just removed in the previous test
    const response = await request(app)
      .delete(`/api/v1/classes/${classWithTeacher.id}/teacher`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .delete(`/api/v1/classes/${testClass.id}/teacher`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        GET CLASSES BY TEACHER TESTS                        */
/* -------------------------------------------------------------------------- */
describe('GET /api/v1/classes/teacher/:teacherId', () => {
  test('should get all classes for a teacher', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/teacher/${testTeacher.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  test('should allow teacher to view their own classes', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/teacher/${testTeacher.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail with non-existent teacher', async () => {
    const response = await request(app)
      .get('/api/v1/classes/teacher/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        CAPACITY STATUS TESTS                               */
/* -------------------------------------------------------------------------- */
describe('GET /api/v1/classes/:id/capacity', () => {
  test('should get capacity status for a class', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}/capacity`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('capacity');
    expect(response.body.data).toHaveProperty('current_students');
    expect(response.body.data).toHaveProperty('available_slots');
  });

  test('should allow teacher to view capacity status', async () => {
    const response = await request(app)
      .get(`/api/v1/classes/${testClass.id}/capacity`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                        DELETE CLASS TESTS                                  */
/* -------------------------------------------------------------------------- */
describe('DELETE /api/v1/classes/:id', () => {
  test('should delete empty class', async () => {
    const classToDelete = await db.queryOne(
      `INSERT INTO classes (school_id, name, grade_level, capacity)
       VALUES ($1, $2, 2, 20)
       RETURNING *`,
      [school.id, `TEST_CLASS_TO_DELETE_${Date.now()}`]
    );

    const response = await request(app)
      .delete(`/api/v1/classes/${classToDelete.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const { rows } = await db.query(
      'SELECT id FROM classes WHERE id = $1',
      [classToDelete.id]
    );
    expect(rows.length).toBe(0);
  });

  test('should fail without admin authorization', async () => {
    const response = await request(app)
      .delete(`/api/v1/classes/${testClass.id}`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  test('should fail with non-existent class', async () => {
    const response = await request(app)
      .delete('/api/v1/classes/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                            CLEANUP                                         */
/* -------------------------------------------------------------------------- */
afterAll(async () => {
  console.log('\n Starting cleanup...');

  // Deleting the school cascades to all child records automatically
  await destroyTestSchool(SCHOOL_SLUG);

  console.log('✅ Cleanup completed');
});