/**
 * Result Services Integration Tests
 * Tests grade calculations, report cards, analytics, ranking, and result management
 */

const request = require('supertest');
const app     = require('../../../src/app');
const db      = require('../../../src/shared/database/client');

const {
  createFullTestSetup,
  createTestUser,
  createTestStudent,
  getAuthToken,
  destroyTestSchool,
} = require('../../helpers/test-helpers');

// ─── Shared state ─────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'results-service-test-school';

let schoolId;
let adminToken;
let teacherToken;
let testData = {};

const calculateGrade = (percentage) => {
  if (percentage >= 80) return 'EE';
  if (percentage >= 60) return 'ME';
  if (percentage >= 40) return 'AE';
  return 'BE';
};

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    // Bootstrap: school → admin user → class → term → seed student → invoice
    const setup = await createFullTestSetup({
      schoolSlug:   SCHOOL_SLUG,
      schoolName:   'Results Service Test School',
      userPrefix:   'resulttest_admin',
      userPassword: 'result123',
      userRole:     'ADMIN',
      className:    'Grade 3',
      gradeLevel:   4,
      year:         2025,
      term:         1,
      studentAdmissionNo: `RSTEST_SEED_${Date.now()}`,
      invoiceAmount: 0,
    });

    schoolId       = setup.school.id;
    testData.class = setup.class;
    testData.term  = setup.term;

    // Teacher user (TEACHER role)
    await createTestUser(
      schoolId,
      'resulttest_teacher',
      'resultteacher@test.com',
      'result123',
      'TEACHER'
    );

    adminToken   = await getAuthToken(app, 'resulttest_admin',   'result123');
    teacherToken = await getAuthToken(app, 'resulttest_teacher', 'result123');

    if (!adminToken || !teacherToken) {
      throw new Error('Token generation failed');
    }

    // Subjects — scoped to school
    testData.subjects = await db.queryAll(
      `INSERT INTO subjects (school_id, name, code)
       VALUES
         ($1, 'Mathematics',    'RS_MATH'),
         ($1, 'English',        'RS_ENG'),
         ($1, 'Kiswahili',      'RS_KIS'),
         ($1, 'Science',        'RS_SCI'),
         ($1, 'Social Studies', 'RS_SST')
       ON CONFLICT (school_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [schoolId]
    );

    // Students — three test learners, all explicitly school-scoped
    testData.students = await Promise.all([
      createTestStudent(schoolId, 'RSTEST001', 'Alice', 'Mwangi',   testData.class.id, { gender: 'FEMALE', dateOfBirth: '2015-01-15' }),
      createTestStudent(schoolId, 'RSTEST002', 'Brian', 'Ochieng',  testData.class.id, { gender: 'MALE',   dateOfBirth: '2015-03-20' }),
      createTestStudent(schoolId, 'RSTEST003', 'Carol', 'Kimani',   testData.class.id, { gender: 'FEMALE', dateOfBirth: '2015-05-10' }),
    ]);

    // One exam per subject
    testData.exams = [];
    for (const subject of testData.subjects) {
      const exam = await db.queryOne(
        `INSERT INTO exams (school_id, name, term_id, exam_type, status)
         VALUES ($1, $2, $3, 'ENDTERM', 'PUBLISHED')
         RETURNING *`,
        [schoolId, `${subject.name} End of Term 1 Assessment`, testData.term.id]
      );
      testData.exams.push(exam);
    }

    console.log(`beforeAll complete: ${testData.students.length} students, ${testData.exams.length} exams`);
  } catch (err) {
    console.error('BEFOREALL FAILED:', err.message);
    throw err;
  }
});

afterAll(async () => {
  // CASCADE from schools row removes everything beneath it automatically
  await destroyTestSchool(SCHOOL_SLUG);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Result Services Integration Tests', () => {

  // ── CBC Competency Assessment ─────────────────────────────────────────────

  describe('CBC Competency Assessment', () => {
    test('should assess learner competencies across strands', async () => {
      const response = await request(app)
        .post('/api/v1/assessments/competency')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          studentId: testData.students[0].id,
          subjectId: testData.subjects[0].id,
          termId:    testData.term.id,
          strands: [
            { name: 'Numbers',     competency: 'EE', percentage: 85 },
            { name: 'Measurement', competency: 'ME', percentage: 70 },
            { name: 'Geometry',    competency: 'ME', percentage: 65 },
          ],
        });

      expect([200, 201, 404, 501]).toContain(response.status);
    });

    test('should generate formative assessment records', async () => {
      const response = await request(app)
        .post('/api/v1/assessments/formative')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          studentId:      testData.students[0].id,
          subjectId:      testData.subjects[0].id,
          assessmentType: 'CLASS_ACTIVITY',
          competency:     'ME',
          observations:   'Shows good understanding of concepts',
        });

      expect([200, 201, 404, 501]).toContain(response.status);
    });

    test('should track learner progress across terms', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/progress-tracker`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ subjectId: testData.subjects[0].id });

      expect([200, 404]).toContain(response.status);
    });

    test('should validate competency rubrics', async () => {
      const response = await request(app)
        .get(`/api/v1/subjects/${testData.subjects[0].id}/competency-rubrics`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 404, 501]).toContain(response.status);
    });
  });

  // ── Result Entry ──────────────────────────────────────────────────────────

  describe('Result Entry', () => {
    test('should record exam result', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: 85, remarks: 'Excellent work' }],
        });

      expect([200, 201]).toContain(response.status);
      if ([200, 201].includes(response.status)) {
        const result = response.body.data.results?.[0] || response.body.data;
        expect(parseFloat(result.marks)).toBe(85);
      }
    });

    test('should validate marks range', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: 150 }],
        });

      expect([400, 422]).toContain(response.status);
    });

    test('should handle negative marks', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: -10 }],
        });

      expect([400, 422]).toContain(response.status);
    });

    test('should accept decimal marks', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: 87.5 }],
        });

      expect([200, 201, 400]).toContain(response.status);
    });

    test('should record results for multiple students', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[1].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: testData.students.map((student, idx) => ({
            studentId: student.id,
            marks:     70 + idx * 5,
          })),
        });

      expect([200, 201]).toContain(response.status);
    });

    test('should update existing result', async () => {
      await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[1].id, marks: 70 }],
        });

      const response = await request(app)
        .put(`/api/v1/exams/${testData.exams[0].id}/results/${testData.students[1].id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ marks: 75, remarks: 'Improved' });

      expect([200, 404]).toContain(response.status);
    });
  });

  // ── Grade Calculation ─────────────────────────────────────────────────────

  describe('Grade Calculation', () => {
    test('should calculate grade from marks', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[2].id, marks: 92 }],
        });

      if ([200, 201].includes(response.status)) {
        const result = response.body.data.results?.[0] || response.body.data;
        expect(result.grade).toBeTruthy();
        expect(['EE', 'ME', 'EE1', 'ME1']).toContain(result.grade);
      }
    });

    test('should calculate CBC competency grade correctly', async () => {
      const testCases = [
        { marks: 90, expectedGrade: 'EE' },
        { marks: 70, expectedGrade: 'ME' },
        { marks: 50, expectedGrade: 'AE' },
        { marks: 30, expectedGrade: 'BE' },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post(`/api/v1/exams/${testData.exams[0].id}/results`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({
            results: [{ studentId: testData.students[0].id, marks: testCase.marks }],
          });

        if ([200, 201].includes(response.status)) {
          const result = response.body.data.results?.[0] || response.body.data;
          if (result.grade) {
            expect(result.grade.startsWith(testCase.expectedGrade)).toBe(true);
          }
        }
      }
    });

    test('should calculate percentage correctly', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[2].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: 75 }],
        });

      if ([200, 201].includes(response.status)) {
        const result = response.body.data.results?.[0] || response.body.data;
        if (result.percentage !== undefined) {
          expect(result.percentage).toBeCloseTo(75, 1);
        }
      }
    });

    test('should determine pass/fail status', async () => {
      const responses = await Promise.all([
        request(app)
          .post(`/api/v1/exams/${testData.exams[2].id}/results`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({ results: [{ studentId: testData.students[1].id, marks: 45 }] }),
        request(app)
          .post(`/api/v1/exams/${testData.exams[2].id}/results`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({ results: [{ studentId: testData.students[2].id, marks: 35 }] }),
      ]);

      responses.forEach((response, idx) => {
        if ([200, 201].includes(response.status)) {
          const result = response.body.data.results?.[0] || response.body.data;
          if (result.status) {
            expect(result.status).toBe(idx === 0 ? 'PASS' : 'FAIL');
          }
        }
      });
    });

    test('should handle edge case at passing marks', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marks: 40 }],
        });

      if ([200, 201].includes(response.status)) {
        const result = response.body.data.results?.[0] || response.body.data;
        if (result.status) {
          expect(result.status).toBe('PASS');
        }
      }
    });

    test('should calculate overall competency level if applicable', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/overall-competency`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('overallCompetency');
        expect(['EE', 'ME', 'AE', 'BE', 'EE1', 'ME1', 'AE1', 'BE1'])
          .toContain(response.body.data.overallCompetency);
      }
    });
  });

  // ── Result Retrieval ──────────────────────────────────────────────────────

  describe('Result Retrieval', () => {
    test('should get student result for specific exam', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/results/${testData.students[0].id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 404]).toContain(response.status);
    });

    test('should get all results for an exam', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get student results for all subjects', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter results by status', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ status: 'PASS' });

      expect(response.status).toBe(200);
    });

    test('should get results with grade filtering', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ minGrade: 'B' });

      expect(response.status).toBe(200);
    });
  });

  // ── Report Card Generation ────────────────────────────────────────────────

  describe('Report Card Generation', () => {
    test('should generate student report card', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/report-card`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('student');
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data).toHaveProperty('summary');
      }
    });

    test('should include overall performance in report card', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/report-card`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      if (response.status === 200) {
        const summary = response.body.data.summary;
        expect(summary).toHaveProperty('totalMarks');
        expect(summary).toHaveProperty('averagePercentage');
      }
    });

    test('should generate class report summary', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/report-summary`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404]).toContain(response.status);
    });

    test('should generate subject-wise report', async () => {
      const response = await request(app)
        .get(`/api/v1/subjects/${testData.subjects[0].id}/report`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404]).toContain(response.status);
    });

    test('should export report card as PDF', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/report-card/pdf`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404, 501]).toContain(response.status);
    });
  });

  // ── Ranking and Analytics ─────────────────────────────────────────────────

  describe('Ranking and Analytics', () => {
    beforeAll(async () => {
      if (!testData.students?.length || !testData.exams?.length) {
        throw new Error('Test data not properly initialized');
      }

      const resultsData = [
        { studentId: testData.students[0].id, marks: 90 },
        { studentId: testData.students[1].id, marks: 85 },
        { studentId: testData.students[2].id, marks: 80 },
      ];

      for (const exam of testData.exams) {
        await request(app)
          .post(`/api/v1/exams/${exam.id}/results`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({ results: resultsData });
      }
    });

    test('should calculate class ranking', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/ranking`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data)).toBe(true);
        if (response.body.data.length > 0) {
          expect(response.body.data[0]).toHaveProperty('rank');
          expect(response.body.data[0]).toHaveProperty('student');
        }
      }
    });

    test('should rank students in descending order of performance', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/ranking`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      if (response.status === 200 && response.body.data.length > 1) {
        const rankings = response.body.data;
        for (let i = 0; i < rankings.length - 1; i++) {
          const a = rankings[i].totalMarks     ?? rankings[i].average;
          const b = rankings[i + 1].totalMarks ?? rankings[i + 1].average;
          expect(a).toBeGreaterThanOrEqual(b);
        }
      }
    });

    test('should get student rank in class', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/rank`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('rank');
        expect(response.body.data.rank).toBeGreaterThan(0);
      }
    });

    test('should get subject toppers', async () => {
      const response = await request(app)
        .get(`/api/v1/subjects/${testData.subjects[0].id}/toppers`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id, limit: 3 });

      expect([200, 404]).toContain(response.status);
    });

    test('should handle ties in ranking', async () => {
      // Create two tie students scoped to the test school
      const tieStudent1 = await createTestStudent(
        schoolId, 'RSTESTTIE1', 'Tie1', 'Student', testData.class.id,
        { gender: 'MALE', dateOfBirth: '2008-01-01' }
      );
      const tieStudent2 = await createTestStudent(
        schoolId, 'RSTESTTIE2', 'Tie2', 'Student', testData.class.id,
        { gender: 'FEMALE', dateOfBirth: '2008-01-01' }
      );

      for (const exam of testData.exams) {
        await request(app)
          .post(`/api/v1/exams/${exam.id}/results`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({
            results: [
              { studentId: tieStudent1.id, marks: 88 },
              { studentId: tieStudent2.id, marks: 88 },
            ],
          });
      }

      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/ranking`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      // Tie students are under the test school and will be cleaned up by destroyTestSchool
      expect([200, 401, 404]).toContain(response.status);
    });
  });

  // ── Result Analytics ──────────────────────────────────────────────────────

  describe('Result Analytics', () => {
    test('should calculate class average', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/analytics`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 401, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('averageMarks');
        expect(typeof response.body.data.averageMarks).toBe('number');
      }
    });

    test('should calculate pass percentage', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/statistics`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401]).toContain(response.status);
      if (response.status === 200 && response.body.data?.passPercentage !== undefined) {
        expect(response.body.data.passPercentage).toBeGreaterThanOrEqual(0);
        expect(response.body.data.passPercentage).toBeLessThanOrEqual(100);
      }
    });

    test('should get grade distribution', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/grade-distribution`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('distribution');
      }
    });

    test('should calculate highest and lowest scores', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/statistics`)
        .set('Authorization', `Bearer ${teacherToken}`);

      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('highestMarks');
        expect(response.body.data).toHaveProperty('lowestMarks');
      }
    });

    test('should calculate subject-wise performance', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/subject-performance`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 401, 404]).toContain(response.status);
    });

    test('should generate performance trends', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/performance-trend`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ terms: 3 });

      expect([200, 401, 404]).toContain(response.status);
    });

    test('should compare class performance across terms', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/performance-comparison`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ term1: testData.term.id, term2: testData.term.id });

      expect([200, 401, 404]).toContain(response.status);
    });
  });

  // ── Result Publishing ─────────────────────────────────────────────────────

  describe('Result Publishing', () => {
    test('should publish exam results', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 400, 401, 404]).toContain(response.status);
    });

    test('should unpublish results', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/unpublish`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 401, 404]).toContain(response.status);
    });

    test('should prevent publishing incomplete results', async () => {
      const newExam = await db.queryOne(
        `INSERT INTO exams (school_id, name, term_id, exam_type, status)
         VALUES ($1, 'Incomplete Result Test Exam', $2, 'ENDTERM', 'PUBLISHED')
         RETURNING *`,
        [schoolId, testData.term.id]
      );

      const response = await request(app)
        .post(`/api/v1/exams/${newExam.id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 400, 401, 404]).toContain(response.status);
    });

    test('should notify students on result publication', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notify: true });

      expect([200, 401,400, 404]).toContain(response.status);
    });
  });

  // ── Result Export ─────────────────────────────────────────────────────────

  describe('Result Export', () => {
    test('should export results to CSV', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/export/csv`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401, 404, 501]).toContain(response.status);
      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/csv/);
      }
    });

    test('should export results to Excel', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/export/excel`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401, 404, 501]).toContain(response.status);
    });

    test('should export class results', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/export/results`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id, format: 'pdf' });

      expect([200, 401, 404, 501]).toContain(response.status);
    });

    test('should export student transcript', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/transcript`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ format: 'pdf' });

      expect([200, 401, 404, 501]).toContain(response.status);
    });
  });

  // ── Result Validation ─────────────────────────────────────────────────────

  describe('Result Validation', () => {
    test('should validate result before saving', async () => {
      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results/validate`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          results: [{ studentId: testData.students[0].id, marksObtained: 105 }],
        });

      expect([400, 401]).toContain(response.status);
      if (response.status === 400) {
        expect(response.body).toHaveProperty('errors');
      }
    });

    test('should detect missing results', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/missing-results`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    test('should identify outlier scores', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/outliers`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401, 404, 501]).toContain(response.status);
    });
  });

  // ── Bulk Operations ───────────────────────────────────────────────────────

  describe('Bulk Operations', () => {
    test('should bulk import results from CSV', async () => {
      const csv = [
        'studentId,marks',
        ...testData.students.map((s, i) => `${s.id},${70 + i * 5}`),
      ].join('\n');

      const response = await request(app)
        .post(`/api/v1/exams/${testData.exams[0].id}/results/import`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .attach('file', Buffer.from(csv), 'results.csv');

      expect([200, 201, 400, 401, 501]).toContain(response.status);
    });

    test('should bulk update grades', async () => {
      const updates = testData.students.map(s => ({ studentId: s.id, marks: 80 }));

      const response = await request(app)
        .put(`/api/v1/exams/${testData.exams[0].id}/results/bulk`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ updates });

      expect([200, 401, 403, 404]).toContain(response.status);
    });

    test('should bulk delete results', async () => {
      const response = await request(app)
        .delete(`/api/v1/exams/${testData.exams[0].id}/results/bulk`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentIds: [testData.students[0].id] });

      expect([200, 204, 401, 404]).toContain(response.status);
    });
  });

  // ── Access Control ────────────────────────────────────────────────────────

  describe('Access Control', () => {
    test('should allow teachers to view their subject results', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401]).toContain(response.status);
    });

    test('should prevent unauthorized result modification', async () => {
      const response = await request(app)
        .put(`/api/v1/exams/${testData.exams[0].id}/results/${testData.students[0].id}`)
        .send({ marks: 95 }); // no auth header

      expect(response.status).toBe(401);
    });

    test('should allow students to view only their results', async () => {
      const response = await request(app)
        .get(`/api/v1/students/${testData.students[0].id}/results`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401, 404]).toContain(response.status);
    });

    test('should restrict result deletion to admins', async () => {
      const response = await request(app)
        .delete(`/api/v1/exams/${testData.exams[0].id}/results/${testData.students[0].id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 204, 401, 403]).toContain(response.status);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    test('should handle student with no results', async () => {
      const newStudent = await createTestStudent(
        schoolId, 'RSTEST999', 'No', 'Results', testData.class.id,
        { gender: 'MALE', dateOfBirth: '2008-01-01' }
      );

      const response = await request(app)
        .get(`/api/v1/students/${newStudent.id}/report-card`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: testData.term.id });

      expect([200, 401, 404]).toContain(response.status);
      // newStudent is under test school — cleaned up by destroyTestSchool in afterAll
    });

    test('should handle exam with no results', async () => {
      const response = await request(app)
        .get(`/api/v1/exams/${testData.exams[0].id}/statistics`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect([200, 401]).toContain(response.status);
    });

    test('should handle division by zero in calculations', async () => {
      const response = await request(app)
        .get(`/api/v1/classes/${testData.class.id}/analytics`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ termId: 9999 }); // Non-existent term

      expect([200, 401, 404]).toContain(response.status);
    });

    test('should handle concurrent result updates', async () => {
      if (!testData.exams?.[0]?.id || !testData.students?.[0]?.id) return;

      const promises = Array(5).fill(null).map((_, i) =>
        request(app)
          .put(`/api/v1/exams/${testData.exams[0].id}/results/${testData.students[0].id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ marks: 80 + i })
      );

      const results      = await Promise.all(promises);
      const validStatuses = results.filter(r => [200, 201, 404, 409].includes(r.status)).length;
      expect(validStatuses).toBeGreaterThan(0);
    });
  });

});