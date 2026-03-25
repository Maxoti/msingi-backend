'use strict';

/**
 * Attendance API Integration Tests
 * Comprehensive tests for attendance management endpoints
 */

const request = require('supertest');
const app     = require('../../src/app');
const db      = require('../../src/shared/database/client');
const {
  createFullTestSetup,
  createTestUser,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

/* ============================================================================
 * SUITE-WIDE CONSTANTS
 * ========================================================================== */

const SCHOOL_SLUG = 'attendance-test-school';

/* ============================================================================
 * SUITE
 * ========================================================================== */
describe('Attendance API Integration Tests', () => {
  let adminToken;
  let teacherToken;
  let schoolId;
  let testClass;
  let testStudent1;
  let testStudent2;
  let testAttendance;
  const testDate = '2024-03-15';

  /* --------------------------------------------------------------------------
   * GLOBAL SETUP
   * ------------------------------------------------------------------------ */
  beforeAll(async () => {
    try {
      console.log('🚀 Setting up attendance tests...');

      // Bootstrap school → admin user → class → term → student → invoice
      const ctx = await createFullTestSetup({
        schoolSlug:         SCHOOL_SLUG,
        schoolName:         'Attendance Test School',
        userPrefix:         'attendanceadmin',
        userPassword:       'attend123',
        userRole:           'ADMIN',
        className:          'Test Attendance Class',
        gradeLevel:         6,
        studentAdmissionNo: `ATT_S1_${Date.now()}`,
        invoiceAmount:      10000,
        year:               2024,
        term:               1,
      });

      schoolId      = ctx.school.id;
      testClass     = ctx.class;
      testStudent1  = ctx.student;   // first student comes from createFullTestSetup

      // Create a second student in the same school + class
      await db.query(
        `DELETE FROM students
         WHERE school_id = $1 AND admission_no = $2`,
        [schoolId, `ATT_S2_${Date.now()}`]
      );
      testStudent2 = await db.queryOne(
        `INSERT INTO students
           (school_id, admission_no, first_name, last_name, gender,
            date_of_birth, admission_date, class_id, is_active)
         VALUES ($1, $2, 'Jane', 'Smith', 'FEMALE',
                 '2012-02-02', '2024-01-15', $3, TRUE)
         RETURNING *`,
        [schoolId, `ATT_S2_${Date.now()}`, testClass.id]
      );

      // Create a TEACHER user for the same school
      await createTestUser(
        schoolId,
        'attendanceteacher',
        'attendanceteacher@test.com',
        'teacher123',
        'TEACHER'
      );

      // Obtain tokens via the login endpoint
      adminToken   = await getAuthToken(app, 'attendanceadmin',   'attend123');
      teacherToken = await getAuthToken(app, 'attendanceteacher', 'teacher123');

      console.log('✅ Admin token obtained');
      console.log('✅ Teacher token obtained');
      console.log('✅ Test setup complete — school:', schoolId);

    } catch (error) {
      console.error('❌ Test setup failed:', error.message);
      throw error;
    }
  });

  /* --------------------------------------------------------------------------
   * TEARDOWN — cascade from school removes everything
   * ------------------------------------------------------------------------ */
  afterAll(async () => {
    console.log('\n🧹 Starting cleanup...');
    try {
      await destroyTestSchool(SCHOOL_SLUG);
      console.log('✅ Cleanup completed successfully');
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  });

  /* ==========================================================================
   * MARK ATTENDANCE
   * ======================================================================== */
  describe('POST /api/v1/attendance', () => {

    test('should mark attendance for a student', async () => {
      expect(testStudent1).toBeDefined();
      expect(testClass).toBeDefined();

      const response = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          student_id: testStudent1.id,
          class_id:   testClass.id,
          date:       testDate,
          status:     'PRESENT',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toBe('PRESENT');

      // Save for later tests
      testAttendance = response.body.data;
    });

    test('should allow teacher to mark attendance', async () => {
      expect(testStudent2).toBeDefined();
      expect(testClass).toBeDefined();

      const response = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          student_id: testStudent2.id,
          class_id:   testClass.id,
          date:       testDate,
          status:     'PRESENT',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should update existing attendance (upsert)', async () => {
      expect(testStudent1).toBeDefined();
      expect(testClass).toBeDefined();

      const response = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          student_id: testStudent1.id,
          class_id:   testClass.id,
          date:       testDate,
          status:     'LATE',
          remarks:    'Came in 10 minutes late',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LATE');
    });

    test('should fail to mark attendance without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          student_id: testStudent1.id,
          date:       testDate,
          // Missing class_id and status
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid status', async () => {
      const response = await request(app)
        .post('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          student_id: testStudent1.id,
          class_id:   testClass.id,
          date:       testDate,
          status:     'INVALID_STATUS',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/attendance')
        .send({
          student_id: testStudent1.id,
          class_id:   testClass.id,
          date:       testDate,
          status:     'PRESENT',
        });

      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * BULK MARK ATTENDANCE
   * ======================================================================== */
  describe('POST /api/v1/attendance/bulk', () => {

    test('should bulk mark attendance for multiple students', async () => {
      expect(testStudent1).toBeDefined();
      expect(testStudent2).toBeDefined();
      expect(testClass).toBeDefined();

      const response = await request(app)
        .post('/api/v1/attendance/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          attendance_records: [
            { student_id: testStudent1.id, class_id: testClass.id, date: '2024-03-16', status: 'PRESENT' },
            { student_id: testStudent2.id, class_id: testClass.id, date: '2024-03-16', status: 'ABSENT'  },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBeGreaterThanOrEqual(2);
    });

    test('should fail with invalid bulk data format', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ attendance_records: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/attendance/bulk')
        .send({
          attendance_records: [
            { student_id: testStudent1.id, class_id: testClass.id, date: '2024-03-17', status: 'PRESENT' },
          ],
        });

      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * MARK CLASS ATTENDANCE
   * ======================================================================== */
  describe('POST /api/v1/attendance/class/:classId', () => {

    test('should mark attendance for entire class', async () => {
      expect(testClass).toBeDefined();

      const response = await request(app)
        .post(`/api/v1/attendance/class/${testClass.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          date: '2024-03-18',
          student_statuses: {
            [testStudent1.id]: 'PRESENT',
            [testStudent2.id]: 'ABSENT',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.count).toBeGreaterThanOrEqual(2);
    });

    test('should fail without date', async () => {
      const response = await request(app)
        .post(`/api/v1/attendance/class/${testClass.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          student_statuses: { [testStudent1.id]: 'PRESENT' },
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * GET ATTENDANCE LIST
   * ======================================================================== */
  describe('GET /api/v1/attendance', () => {

    test('should get all attendance records', async () => {
      const response = await request(app)
        .get('/api/v1/attendance')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter by student', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance?student_id=${testStudent1.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by class', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance?class_id=${testClass.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by date', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance?date=${testDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/attendance?status=PRESENT')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/attendance');

      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * GET ATTENDANCE BY ID
   * ======================================================================== */
  describe('GET /api/v1/attendance/:id', () => {

    test('should get attendance by ID', async () => {
      expect(testAttendance).toBeDefined();
      expect(testAttendance.id).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/attendance/${testAttendance.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testAttendance.id);
    });

    test('should fail with non-existent ID', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * STATISTICS — per student
   * ======================================================================== */
  describe('GET /api/v1/attendance/students/:studentId/stats', () => {

    test('should get student attendance statistics', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/students/${testStudent1.id}/stats?start_date=2024-03-01&end_date=2024-03-31`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('present_count');
      expect(response.body.data).toHaveProperty('absent_count');
    });

    test('should allow teacher to view statistics', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/students/${testStudent1.id}/stats?start_date=2024-03-01&end_date=2024-03-31`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail without date range', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/students/${testStudent1.id}/stats`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * STATISTICS — per class / date
   * ======================================================================== */
  describe('GET /api/v1/attendance/classes/:classId/date/:date', () => {

    test('should get class attendance for a specific date', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/classes/${testClass.id}/date/${testDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('present_count');
    });
  });

  describe('GET /api/v1/attendance/classes/:classId/stats', () => {

    test('should get class statistics over date range', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/classes/${testClass.id}/stats?start_date=2024-03-01&end_date=2024-03-31`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/attendance/classes/:classId/absent/:date', () => {

    test('should get absent students for a date', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/classes/${testClass.id}/absent/2024-03-16`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/attendance/school/:date', () => {

    test('should get school-wide attendance for a date', async () => {
      const response = await request(app)
        .get(`/api/v1/attendance/school/${testDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
    });
  });

  describe('GET /api/v1/attendance/low-attendance', () => {

    test('should get students with low attendance', async () => {
      const response = await request(app)
        .get('/api/v1/attendance/low-attendance?threshold=75&start_date=2024-03-01&end_date=2024-03-31')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  /* ==========================================================================
   * UPDATE ATTENDANCE
   * ======================================================================== */
  describe('PUT /api/v1/attendance/:id', () => {

    test('should update attendance status', async () => {
      expect(testAttendance).toBeDefined();

      const response = await request(app)
        .put(`/api/v1/attendance/${testAttendance.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'EXCUSED', remarks: 'Medical appointment' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('EXCUSED');
    });

    test('should allow teacher to update attendance', async () => {
      expect(testAttendance).toBeDefined();

      const response = await request(app)
        .put(`/api/v1/attendance/${testAttendance.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ remarks: 'Updated by teacher' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail with non-existent ID', async () => {
      const response = await request(app)
        .put('/api/v1/attendance/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'PRESENT' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * DELETE ATTENDANCE
   * ======================================================================== */
  describe('DELETE /api/v1/attendance/:id', () => {

    test('should fail without admin authorization', async () => {
      expect(testAttendance).toBeDefined();

      const response = await request(app)
        .delete(`/api/v1/attendance/${testAttendance.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should delete attendance as admin', async () => {
      // Insert a throwaway attendance row with school_id
      const temp = await db.queryOne(
        `INSERT INTO attendance
           (school_id, student_id, class_id, date, status)
         VALUES ($1, $2, $3, '2024-03-20', 'PRESENT')
         RETURNING *`,
        [schoolId, testStudent1.id, testClass.id]
      );

      const response = await request(app)
        .delete(`/api/v1/attendance/${temp.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail with non-existent ID', async () => {
      const response = await request(app)
        .delete('/api/v1/attendance/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});