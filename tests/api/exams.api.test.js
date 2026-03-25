/**
 * Exams API Integration Tests
 * Comprehensive tests for exam management endpoints
 */

const request = require('supertest');
const app = require('../../src/app');
const db  = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestTerm,
  createTestStudent,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

describe('Exams API Integration Tests', () => {
  let testSchool;
  let adminToken;
  let teacherToken;
  let testTerm;
  let testExam;
  let testSubject;
  let testStudent;
  let testClass;

  beforeAll(async () => {
    testSchool = await createTestSchool('exams-api-test', {
      name: 'Exams API Test School',
    });

    await createTestUser(testSchool.id, 'exams_admin',   'exams_admin@test.com',   'admin123',   'ADMIN');
    await createTestUser(testSchool.id, 'exams_teacher', 'exams_teacher@test.com', 'teacher123', 'TEACHER');

    adminToken   = await getAuthToken(app, 'exams_admin',   'admin123');
    teacherToken = await getAuthToken(app, 'exams_teacher', 'teacher123');

    testClass = await createTestClass(testSchool.id, 'Test Class Exams', 1);
    testTerm  = await createTestTerm(testSchool.id, 2024, 1, '2024-01-01', '2024-04-30');
    testStudent = await createTestStudent(
      testSchool.id, 'EXAM_TEST_001', 'Exam', 'Student', testClass.id,
      { gender: 'MALE', dateOfBirth: '2010-01-01' }
    );
  });

  afterAll(async () => {
    await destroyTestSchool('exams-api-test');
  });

  // ── CREATE ────────────────────────────────────────────────────────────────

  describe('POST /api/v1/exams', () => {
    test('should create a new exam with admin token', async () => {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mid-Term Exam 2024', term_id: testTerm.id, exam_type: 'MIDTERM' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Mid-Term Exam 2024');
      expect(response.body.data.exam_type).toBe('MIDTERM');
      expect(response.body.data.status).toBe('DRAFT');
      testExam = response.body.data;
    });

    test('should fail without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exam_type: 'CAT' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid exam type', async () => {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid Exam', term_id: testTerm.id, exam_type: 'INVALID_TYPE' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without admin authorization', async () => {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: 'Unauthorized Exam', term_id: testTerm.id, exam_type: 'CAT' });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/exams')
        .send({ name: 'No Auth Exam', term_id: testTerm.id, exam_type: 'CAT' });
      expect(response.status).toBe(401);
    });
  });

  // ── GET ALL ───────────────────────────────────────────────────────────────

  describe('GET /api/v1/exams', () => {
    test('should get all exams with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get all exams with teacher token', async () => {
      const response = await request(app)
        .get('/api/v1/exams')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by term', async () => {
      const response = await request(app)
        .get(`/api/v1/exams?term_id=${testTerm.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by exam type', async () => {
      const response = await request(app)
        .get('/api/v1/exams?exam_type=MIDTERM')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/exams?status=DRAFT')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/exams');
      expect(response.status).toBe(401);
    });
  });

  // ── GET BY ID ─────────────────────────────────────────────────────────────

  describe('GET /api/v1/exams/:id', () => {
    test('should get exam by ID', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testExam.id);
    });

    test('should fail with non-existent exam ID', async () => {
      const response = await request(app)
        .get('/api/v1/exams/999999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should allow teacher to view exam', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ── UPDATE ────────────────────────────────────────────────────────────────

  describe('PUT /api/v1/exams/:id', () => {
    test('should update exam name', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .put(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Mid-Term Exam 2024 - Updated' });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Mid-Term Exam 2024 - Updated');
      testExam.name = response.body.data.name;
    });

    test('should update exam type', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .put(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ exam_type: 'ENDTERM' });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.exam_type).toBe('ENDTERM');
    });

    test('should fail without admin authorization', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .put(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ name: 'Unauthorized Update' });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent exam', async () => {
      const response = await request(app)
        .put('/api/v1/exams/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Name' });
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ── ADD SUBJECTS ──────────────────────────────────────────────────────────

  describe('POST /api/v1/exams/:id/subjects', () => {
    test('should add subject to exam', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject_name: 'Mathematics', max_marks: 100 });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.subject_name).toBe('Mathematics');
      testSubject = response.body.data;
    });

    test('should add multiple subjects to exam', async () => {
      expect(testExam).toBeDefined();
      for (const subject of [
        { subject_name: 'English', max_marks: 100 },
        { subject_name: 'Science', max_marks: 100 },
      ]) {
        const response = await request(app)
          .post(`/api/v1/exams/${testExam.id}/subjects`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(subject);
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      }
    });

    test('should fail without required fields', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ max_marks: 100 });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without admin authorization', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ subject_name: 'History', max_marks: 100 });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  // ── GET SUBJECTS ──────────────────────────────────────────────────────────

  describe('GET /api/v1/exams/:id/subjects', () => {
    test('should get all subjects for an exam', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should allow teacher to view subjects', async () => {
      expect(testExam).toBeDefined();
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail with non-existent exam', async () => {
      const response = await request(app)
        .get('/api/v1/exams/999999/subjects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  // ── UPDATE SUBJECT ────────────────────────────────────────────────────────

  describe('PUT /api/v1/exams/subjects/:subjectId', () => {
    test('should update subject details', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .put(`/api/v1/exams/subjects/${testSubject.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ subject_name: 'Advanced Mathematics', max_marks: 150 });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.subject_name).toBe('Advanced Mathematics');
      testSubject = response.body.data;
    });

    test('should fail without admin authorization', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .put(`/api/v1/exams/subjects/${testSubject.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ max_marks: 120 });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  // ── ADD RESULTS ───────────────────────────────────────────────────────────

  describe('POST /api/v1/exams/:id/results', () => {
    test('should add exam result', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ student_id: testStudent.id, subject_id: testSubject.id, marks: 85 });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(parseFloat(response.body.data.marks)).toBe(85);
    });

    test('should allow teacher to add result', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ student_id: testStudent.id, subject_id: testSubject.id, marks: 90 });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should update existing result (upsert)', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ student_id: testStudent.id, subject_id: testSubject.id, marks: 95 });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(parseFloat(response.body.data.marks)).toBe(95);
    });

    test('should fail with marks exceeding max_marks', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ student_id: testStudent.id, subject_id: testSubject.id, marks: 200 });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with negative marks', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ student_id: testStudent.id, subject_id: testSubject.id, marks: -10 });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ── GET RESULTS ───────────────────────────────────────────────────────────

  describe('GET /api/v1/exams/:id/results', () => {
    test('should get all results for an exam', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter results by student', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/results?student_id=${testStudent.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should allow teacher to view results', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ── GET STUDENT RESULTS ───────────────────────────────────────────────────

  describe('GET /api/v1/exams/:id/students/:studentId/results', () => {
    test('should get student results with summary', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/students/${testStudent.id}/results`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('results');
      expect(response.body.data).toHaveProperty('summary');
    });

    test('should allow teacher to view student results', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testExam.id}/students/${testStudent.id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // ── STATISTICS ────────────────────────────────────────────────────────────
describe('GET /api/v1/exams/:id/statistics', () => {
  test('should get exam statistics', async () => {
    const response = await request(app)
      .get(`/api/v1/exams/${testExam.id}/statistics`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('totalStudents');
    expect(response.body.data).toHaveProperty('averageMarks');
    expect(response.body.data).toHaveProperty('passPercentage');
  });

  test('should allow teacher to view statistics', async () => {
    const response = await request(app)
      .get(`/api/v1/exams/${testExam.id}/statistics`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

  // ── BULK RESULTS ──────────────────────────────────────────────────────────

  describe('POST /api/v1/exams/:id/results/bulk', () => {
    test('should bulk upload multiple results', async () => {
      const subjectsResponse = await request(app)
        .get(`/api/v1/exams/${testExam.id}/subjects`)
        .set('Authorization', `Bearer ${adminToken}`);
      const subjects = subjectsResponse.body.data;
      if (!subjects || subjects.length < 2) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results/bulk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          results: subjects.slice(0, 2).map(s => ({
            student_id: testStudent.id, subject_id: s.id, marks: 80,
          })),
        });
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should fail without admin authorization', async () => {
      if (!testSubject?.id) return;
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results/bulk`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ results: [{ student_id: testStudent.id, subject_id: testSubject.id, marks: 75 }] });
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid data format', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/results/bulk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ results: 'not-an-array' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ── PUBLISH ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/exams/:id/publish', () => {
    test('should publish exam', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('PUBLISHED');
      testExam.status = 'PUBLISHED';
    });

    test('should fail to publish already published exam', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without admin authorization', async () => {
      // Explicit school_id — trigger never fires
      const draft = await db.queryOne(
        `INSERT INTO exams (school_id, name, term_id, exam_type, status)
         VALUES ($1, 'Publish Auth Test Exam', $2, 'CAT', 'DRAFT') RETURNING *`,
        [testSchool.id, testTerm.id]
      );
      const response = await request(app)
        .post(`/api/v1/exams/${draft.id}/publish`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      await db.query('DELETE FROM exams WHERE id = $1', [draft.id]);
    });
  });

  // ── ARCHIVE ───────────────────────────────────────────────────────────────

  describe('POST /api/v1/exams/:id/archive', () => {
    test('should archive exam', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ARCHIVED');
      testExam.status = 'ARCHIVED';
    });

    test('should fail to archive already archived exam', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testExam.id}/archive`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  describe('DELETE /api/v1/exams/:id', () => {
    test('should fail to delete published/archived exam', async () => {
      const response = await request(app)
        .delete(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should delete draft exam without results', async () => {
      const draft = await db.queryOne(
        `INSERT INTO exams (school_id, name, term_id, exam_type, status)
         VALUES ($1, 'Draft Exam to Delete', $2, 'CAT', 'DRAFT') RETURNING *`,
        [testSchool.id, testTerm.id]
      );
      const response = await request(app)
        .delete(`/api/v1/exams/${draft.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail without admin authorization', async () => {
      const response = await request(app)
        .delete(`/api/v1/exams/${testExam.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent exam', async () => {
      const response = await request(app)
        .delete('/api/v1/exams/999999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});