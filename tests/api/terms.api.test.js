/**
 * Terms API Integration Tests
 * Comprehensive tests for academic terms management endpoints
 */

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/shared/database/client');
const { getAdminToken, getTeacherToken } = require('../helpers/test-users');

describe('Terms API Integration Tests', () => {
  let adminToken;
  let teacherToken;
  let testTerm1;
  let testTerm2;
  let testTerm3;

  /* -------------------------------------------------------------------------- */
  /*                               GLOBAL SETUP                                 */
  /* -------------------------------------------------------------------------- */
  beforeAll(async () => {
    try {
      console.log(' Setting up terms tests...');

      // Get authentication tokens
      adminToken = await getAdminToken();
      teacherToken = await getTeacherToken();
      console.log('✅ Admin token obtained');
      console.log('✅ Teacher token obtained');

      // Clean up any existing test terms first
      await db.query(
        `DELETE FROM academic_terms WHERE year = 2099`
      );

      console.log('✅ Test setup complete\n');

    } catch (error) {
      console.error('❌ Test setup failed:', error.message);
      throw error;
    }
  });

  /* -------------------------------------------------------------------------- */
  /*                            CREATE TERM TESTS                               */
  /* -------------------------------------------------------------------------- */
  describe('POST /api/v1/terms', () => {
    test('should create a new term with admin token', async () => {
      const termData = {
        year: 2099,
        term: 1,
        start_date: '2099-01-15',
        end_date: '2099-04-15',
        is_active: false
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.year).toBe(2099);
      expect(response.body.data.term).toBe(1);
      expect(response.body.data.is_active).toBe(false);

      // Save for other tests
      testTerm1 = response.body.data;
    });

    test('should create term and set as active', async () => {
      const termData = {
        year: 2099,
        term: 2,
        start_date: '2099-05-01',
        end_date: '2099-08-15',
        is_active: true
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);

      testTerm2 = response.body.data;

      // Verify term 1 was deactivated
      const term1Check = await db.queryOne(
        'SELECT is_active FROM academic_terms WHERE id = $1',
        [testTerm1.id]
      );
      expect(term1Check.is_active).toBe(false);
    });

    test('should create third term for the year', async () => {
      const termData = {
        year: 2099,
        term: 3,
        start_date: '2099-09-01',
        end_date: '2099-11-30',
        is_active: false
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.term).toBe(3);

      testTerm3 = response.body.data;
    });

    test('should fail to create term without required fields', async () => {
      const termData = {
        year: 2099,
        term: 1
        // Missing start_date and end_date
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail to create term with invalid term number', async () => {
      const termData = {
        year: 2099,
        term: 4, // Invalid - must be 1, 2, or 3
        start_date: '2099-01-15',
        end_date: '2099-04-15'
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('must be 1, 2, or 3');
    });

    test('should fail to create duplicate term', async () => {
      const termData = {
        year: 2099,
        term: 1, // Already exists
        start_date: '2099-01-15',
        end_date: '2099-04-15'
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    test('should fail with start date after end date', async () => {
      const termData = {
        year: 2098,
        term: 1,
        start_date: '2098-04-15',
        end_date: '2098-01-15' // Before start date
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('must be before');
    });

    test('should fail with term too short', async () => {
      const termData = {
        year: 2098,
        term: 1,
        start_date: '2098-01-15',
        end_date: '2098-01-30' // Only 15 days
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(termData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('at least 30 days');
    });

    test('should fail without admin authorization', async () => {
      const termData = {
        year: 2098,
        term: 2,
        start_date: '2098-05-01',
        end_date: '2098-08-15'
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(termData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const termData = {
        year: 2098,
        term: 2,
        start_date: '2098-05-01',
        end_date: '2098-08-15'
      };

      const response = await request(app)
        .post('/api/v1/terms')
        .send(termData);

      expect(response.status).toBe(401);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                            GET TERMS TESTS                                 */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms', () => {
    test('should get all terms with admin token', async () => {
      const response = await request(app)
        .get('/api/v1/terms')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    test('should get all terms with teacher token', async () => {
      const response = await request(app)
        .get('/api/v1/terms')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should filter terms by year', async () => {
      const response = await request(app)
        .get('/api/v1/terms?year=2099')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
      expect(response.body.data.every(term => term.year === 2099)).toBe(true);
    });

    test('should filter terms by active status', async () => {
      const response = await request(app)
        .get('/api/v1/terms?is_active=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.every(term => term.is_active === true)).toBe(true);
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/v1/terms?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/terms');

      expect(response.status).toBe(401);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET TERM BY ID TESTS                                */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/:id', () => {
    test('should get term by ID', async () => {
      expect(testTerm1).toBeDefined();
      expect(testTerm1.id).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/terms/${testTerm1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testTerm1.id);
      expect(response.body.data.year).toBe(2099);
      expect(response.body.data.term).toBe(1);
    });

    test('should allow teacher to view term', async () => {
      expect(testTerm1).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/terms/${testTerm1.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail with non-existent ID', async () => {
      const response = await request(app)
        .get('/api/v1/terms/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET ACTIVE TERM TESTS                               */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/active', () => {
    test('should get active term', async () => {
      const response = await request(app)
        .get('/api/v1/terms/active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);
      expect(response.body.data.id).toBe(testTerm2.id);
    });

    test('should allow teacher to view active term', async () => {
      const response = await request(app)
        .get('/api/v1/terms/active')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET TERMS BY YEAR TESTS                             */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/year/:year', () => {
    test('should get all terms for a year', async () => {
      const response = await request(app)
        .get('/api/v1/terms/year/2099')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(3);
      expect(response.body.data.every(term => term.year === 2099)).toBe(true);
    });

    test('should return empty array for year with no terms', async () => {
      const response = await request(app)
        .get('/api/v1/terms/year/2050')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET ALL YEARS TESTS                                 */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/years', () => {
    test('should get all years with terms', async () => {
      const response = await request(app)
        .get('/api/v1/terms/years')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toContain(2099);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET CURRENT TERM TESTS                              */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/current', () => {
    test('should get current term based on date', async () => {
      const response = await request(app)
        .get('/api/v1/terms/current?date=2099-06-15')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.term).toBe(2);
    });

    test('should return 404 for date with no term', async () => {
      const response = await request(app)
        .get('/api/v1/terms/current?date=2099-12-31')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        GET TERM STATISTICS TESTS                           */
  /* -------------------------------------------------------------------------- */
  describe('GET /api/v1/terms/:id/statistics', () => {
    test('should get term statistics', async () => {
      expect(testTerm1).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/terms/${testTerm1.id}/statistics`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('term_info');
      expect(response.body.data).toHaveProperty('statistics');
      expect(response.body.data).toHaveProperty('progress');
      expect(response.body.data.statistics).toHaveProperty('total_exams');
      expect(response.body.data.progress).toHaveProperty('status');
    });

    test('should allow teacher to view statistics', async () => {
      expect(testTerm1).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/terms/${testTerm1.id}/statistics`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should fail with non-existent term', async () => {
      const response = await request(app)
        .get('/api/v1/terms/999999/statistics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                           UPDATE TERM TESTS                                */
  /* -------------------------------------------------------------------------- */
  describe('PUT /api/v1/terms/:id', () => {
    test('should update term dates', async () => {
      expect(testTerm1).toBeDefined();

      const updateData = {
        start_date: '2099-01-20',
        end_date: '2099-04-20'
      };

      const response = await request(app)
        .put(`/api/v1/terms/${testTerm1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
     expect(response.body.data.start_date).toBe('2099-01-20');
expect(response.body.data.end_date).toBe('2099-04-20');
    });

    test('should update term active status', async () => {
      expect(testTerm3).toBeDefined();

      const updateData = {
        is_active: true
      };

      const response = await request(app)
        .put(`/api/v1/terms/${testTerm3.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);

      // Verify term 2 was deactivated
      const term2Check = await db.queryOne(
        'SELECT is_active FROM academic_terms WHERE id = $1',
        [testTerm2.id]
      );
      expect(term2Check.is_active).toBe(false);
    });

    test('should fail without admin authorization', async () => {
      expect(testTerm1).toBeDefined();

      const updateData = {
        start_date: '2099-01-25'
      };

      const response = await request(app)
        .put(`/api/v1/terms/${testTerm1.id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send(updateData);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent term', async () => {
      const updateData = {
        start_date: '2099-01-25'
      };

      const response = await request(app)
        .put('/api/v1/terms/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid dates', async () => {
      expect(testTerm1).toBeDefined();

      const updateData = {
        start_date: '2099-04-20',
        end_date: '2099-01-20' // End before start
      };

      const response = await request(app)
        .put(`/api/v1/terms/${testTerm1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                        ACTIVATE TERM TESTS                                 */
  /* -------------------------------------------------------------------------- */
  describe('POST /api/v1/terms/:id/activate', () => {
    test('should activate a term', async () => {
      expect(testTerm1).toBeDefined();

      const response = await request(app)
        .post(`/api/v1/terms/${testTerm1.id}/activate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(true);

      // Verify other terms were deactivated
      const otherTerms = await db.query(
        'SELECT id, is_active FROM academic_terms WHERE year = 2099 AND id != $1',
        [testTerm1.id]
      );
      expect(otherTerms.rows.every(term => term.is_active === false)).toBe(true);
    });

    test('should fail without admin authorization', async () => {
      expect(testTerm2).toBeDefined();

      const response = await request(app)
        .post(`/api/v1/terms/${testTerm2.id}/activate`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent term', async () => {
      const response = await request(app)
        .post('/api/v1/terms/999999/activate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /*                           DELETE TERM TESTS                                */
  /* -------------------------------------------------------------------------- */
  describe('DELETE /api/v1/terms/:id', () => {
   test('should fail to delete active term', async () => {
  expect(testTerm1).toBeDefined();
  
  // Re-activate testTerm1 for this test
  await request(app)
    .post(`/api/v1/terms/${testTerm1.id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`);
  
  // Refresh testTerm1 data
  const freshTerm = await db.queryOne(
    'SELECT * FROM academic_terms WHERE id = $1',
    [testTerm1.id]
  );
  
  expect(freshTerm.is_active).toBe(true);

  const response = await request(app)
    .delete(`/api/v1/terms/${testTerm1.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(response.status).toBe(400);
  expect(response.body.success).toBe(false);
  expect(response.body.message).toContain('Cannot delete the active term');
});

    test('should delete inactive term without exams', async () => {
      expect(testTerm2).toBeDefined();

      const response = await request(app)
        .delete(`/api/v1/terms/${testTerm2.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const deleted = await db.queryOne(
        'SELECT * FROM academic_terms WHERE id = $1',
        [testTerm2.id]
      );
      expect(deleted).toBeNull();
    });

    test('should fail without admin authorization', async () => {
      expect(testTerm3).toBeDefined();

      const response = await request(app)
        .delete(`/api/v1/terms/${testTerm3.id}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent term', async () => {
      const response = await request(app)
        .delete('/api/v1/terms/999999')
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

    try {
      // Delete test terms
      await db.query('DELETE FROM academic_terms WHERE year = 2099');
      console.log('✅ Deleted test terms');

      // Clean up any 2098 terms from validation tests
      await db.query('DELETE FROM academic_terms WHERE year = 2098');
      console.log(' Deleted validation test terms');

      // Close database connection
      console.log(' Cleanup completed successfully\n');

    } catch (error) {
      console.error(' Cleanup failed:', error.message);
    }
  });
});
