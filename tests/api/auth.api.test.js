'use strict';

/**
 * Auth API Integration Tests
 *
 * MULTI-TENANT FIX
 * ────────────────
 * The original file called createTestUser('authtest', ...) — passing the
 * school slug (a string) where school_id (an integer) is required.
 * We now create a real school first and pass its numeric id everywhere.
 */

const request = require('supertest');
const app     = require('../../src/app');
const db      = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

/* ============================================================================
 * SUITE-WIDE CONSTANTS
 * ========================================================================== */

const SCHOOL_SLUG = 'auth-api-test-school';

/* ============================================================================
 * SUITE
 * ========================================================================== */
describe('Auth API Tests', () => {
  let schoolId;
  let authToken;

  /* --------------------------------------------------------------------------
   * GLOBAL SETUP
   * ------------------------------------------------------------------------ */
  beforeAll(async () => {
    const school = await createTestSchool(SCHOOL_SLUG, { name: 'Auth API Test School' });
    schoolId = school.id;

    // Create the primary test user that most login tests depend on
    await createTestUser(
      schoolId,
      'authtest',
      'authtest@test.com',
      'authtest123',
      'ADMIN'
    );

    authToken = await getAuthToken(app, 'authtest', 'authtest123');
  });

  /* --------------------------------------------------------------------------
   * TEARDOWN
   * ------------------------------------------------------------------------ */
  afterAll(async () => {
    await destroyTestSchool(SCHOOL_SLUG);
    if (app.close) await new Promise(resolve => app.close(resolve));
  });

  /* ==========================================================================
   * LOGIN
   * ======================================================================== */
  describe('POST /api/v1/auth/login', () => {

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest', password: 'authtest123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.username).toBe('authtest');
    });

    test('should fail with invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should fail with non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'doesnotexist_xyz', password: 'authtest123' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail for inactive user', async () => {
      // Create an inactive user — helper always sets is_active TRUE so do it raw
      await db.query(
        `DELETE FROM users WHERE school_id = $1 AND username = 'authtest_inactive_api'`,
        [schoolId]
      );
      const bcrypt = require('bcrypt');
      const hash   = await bcrypt.hash('inactive123', 10);
      await db.queryOne(
        `INSERT INTO users
           (school_id, username, email, password_hash, role, is_active)
         VALUES ($1, 'authtest_inactive_api', 'inactive_api@test.com', $2, 'TEACHER', FALSE)
         RETURNING *`,
        [schoolId, hash]
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_inactive_api', password: 'inactive123' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * REGISTER
   * ======================================================================== */
  describe('POST /api/v1/auth/register', () => {

    test('should register new user with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_newreg',
          email:     'newreg@test.com',
          password:  'NewReg123!',
          firstName: 'New',
          lastName:  'Reg',
          role:      'TEACHER',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('id');
    });

    test('should fail with duplicate username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest',            // already exists
          email:     'duplicate@test.com',
          password:  'Duplicate123!',
          firstName: 'Dup',
          lastName:  'User',
          role:      'TEACHER',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    test('should fail with weak password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_weakpw',
          email:     'weakpw@test.com',
          password:  '123',               // too weak
          firstName: 'Weak',
          lastName:  'Pass',
          role:      'TEACHER',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail with invalid role', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_invalidrole',
          email:     'invalidrole@test.com',
          password:  'ValidPass123!',
          firstName: 'Bad',
          lastName:  'Role',
          role:      'SUPERUSER',           // invalid role
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  /* ==========================================================================
   * GET CURRENT USER
   * ======================================================================== */
  describe('GET /api/v1/auth/me - Get Current User', () => {

    // Each nested describe gets a fresh login so token lifetime
    // doesn't bleed between the outer password-change tests.
    beforeAll(async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest', password: 'authtest123' });

      authToken = loginResponse.body.data?.token;
    });

    test('should get current user with valid token', async () => {
      expect(authToken).toBeDefined();

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.username).toBe('authtest');
    });

    test('should fail without token', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
    });

    test('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer this_is_not_a_real_token');

      expect(response.status).toBe(401);
    });

    test('should fail with expired token', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 9999, username: 'authtest', role: 'ADMIN' },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * LOGOUT
   * ======================================================================== */
  describe('POST /api/v1/auth/logout', () => {

    test('should logout successfully', async () => {
      // Obtain a fresh token to logout with
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest', password: 'authtest123' });

      const token = loginResponse.body.data.token;

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect([200, 204]).toContain(response.status);
    });
  });

  /* ==========================================================================
   * CHANGE PASSWORD
   * ======================================================================== */
  describe('POST /api/v1/auth/change-password', () => {

    // Re-login for this block so the token is definitely valid
    beforeAll(async () => {
      authToken = await getAuthToken(app, 'authtest', 'authtest123');
    });

    test('should change password with valid data', async () => {
      expect(authToken).toBeDefined();

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ oldPassword: 'authtest123', newPassword: 'NewAuth123!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Restore the password so other tests aren't broken
      const newToken = await getAuthToken(app, 'authtest', 'NewAuth123!');
      await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ oldPassword: 'NewAuth123!', newPassword: 'authtest123' });
    });

    test('should fail with incorrect current password', async () => {
      expect(authToken).toBeDefined();

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ oldPassword: 'wrongpassword', newPassword: 'NewAuth123!' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ oldPassword: 'authtest123', newPassword: 'NewAuth123!' });

      expect(response.status).toBe(401);
    });
  });
});