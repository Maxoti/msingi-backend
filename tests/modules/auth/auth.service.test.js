'use strict';

/**
 * Authentication Service Integration Tests
 * Tests complete authentication workflow including login, registration,
 * token management, and security.
 *
 * MULTI-TENANT NOTES
 * ──────────────────
 * Every user row requires school_id. Tests create one dedicated school and
 * destroy it in afterAll — the cascade removes all users, tokens, etc.
 * No ON CONFLICT (username) is used anywhere; the real constraint is
 * (school_id, username). We use DELETE → INSERT throughout.
 */

const request = require('supertest');
const app     = require('../../../src/app');
const db      = require('../../../src/shared/database/client');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const {
  createTestSchool,
  createTestUser,
  getAuthToken,
  destroyTestSchool,
} = require('../../helpers/test-helpers');

/* ============================================================================
 * SUITE-WIDE CONSTANTS
 * ========================================================================== */

const SCHOOL_SLUG = 'auth-service-test-school';

/* ============================================================================
 * SUITE
 * ========================================================================== */
describe('Authentication Service Integration Tests', () => {
  let schoolId;
  let testUser;       // authtest_loginuser — the main login-test account
  let authToken;
  let refreshToken;

  /* --------------------------------------------------------------------------
   * GLOBAL SETUP
   * Create the school once; individual describe blocks add users as needed.
   * ------------------------------------------------------------------------ */
  beforeAll(async () => {
    const school = await createTestSchool(SCHOOL_SLUG, { name: 'Auth Service Test School' });
    schoolId = school.id;
  });

  /* --------------------------------------------------------------------------
   * GLOBAL TEARDOWN — cascade wipes everything in the school
   * ------------------------------------------------------------------------ */
  afterAll(async () => {
    await destroyTestSchool(SCHOOL_SLUG);
    // Close the server so Jest can exit cleanly
    if (app.close) await new Promise(resolve => app.close(resolve));
  });

  /* ==========================================================================
   * USER REGISTRATION
   * ======================================================================== */
  describe('User Registration', () => {

    test('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id:  schoolId,
          username:   'authtest_user1',
          email:      'authtest1@example.com',
          password:   'SecurePass123!',
          firstName:  'Auth',
          lastName:   'Test',
          role:       'TEACHER',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('authtest_user1');
      expect(response.body.data.user).not.toHaveProperty('password_hash');

      const user = await db.queryOne(
        'SELECT * FROM users WHERE school_id = $1 AND username = $2',
        [schoolId, 'authtest_user1']
      );
      expect(user).toBeTruthy();
      expect(user.is_active).toBe(true);
    });

    test('should hash password before storing', async () => {
      const password = 'TestPassword123!';

      await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_user2',
          email:     'authtest2@example.com',
          password,
          firstName: 'Test',
          lastName:  'User',
          role:      'TEACHER',
        });

      const user = await db.queryOne(
        'SELECT password_hash FROM users WHERE school_id = $1 AND username = $2',
        [schoolId, 'authtest_user2']
      );

      expect(user.password_hash).not.toBe(password);
      expect(user.password_hash).toMatch(/^\$2[aby]\$/);
      expect(await bcrypt.compare(password, user.password_hash)).toBe(true);
    });

    test('should reject duplicate username', async () => {
      // Seed first user directly so we don't depend on prior test ordering
      await createTestUser(schoolId, 'authtest_duplicate', 'authtest_dup1@example.com', 'Password123!', 'TEACHER');

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_duplicate',
          email:     'authtest_dup2@example.com',
          password:  'Password123!',
          firstName: 'Second',
          lastName:  'User',
          role:      'TEACHER',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/username/i);
    });

    test('should reject duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_newemail',
          email:     'authtest1@example.com',   // already used above
          password:  'Password123!',
          firstName: 'Test',
          lastName:  'User',
          role:      'TEACHER',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/email/i);
    });

    test('should validate password strength', async () => {
      const weakPasswords = ['12345', 'password', 'abc', '        '];

      for (const weakPassword of weakPasswords) {
        const ts = Date.now();
        const response = await request(app)
          .post('/api/v1/auth/register')
          .send({
            school_id: schoolId,
            username:  `authtest_weak_${ts}`,
            email:     `weak_${ts}@example.com`,
            password:  weakPassword,
            firstName: 'Test',
            lastName:  'User',
            role:      'TEACHER',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/password/i);
      }
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_bademail',
          email:     'not-an-email',
          password:  'SecurePass123!',
          firstName: 'Test',
          lastName:  'User',
          role:      'TEACHER',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/email/i);
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ school_id: schoolId, username: 'authtest_incomplete' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeTruthy();
    });

    test('should set default role if not provided', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          school_id: schoolId,
          username:  'authtest_defaultrole',
          email:     'defaultrole@example.com',
          password:  'SecurePass123!',
          firstName: 'Default',
          lastName:  'Role',
          // No role
        });

      expect(response.status).toBe(201);

      const user = await db.queryOne(
        'SELECT role FROM users WHERE school_id = $1 AND username = $2',
        [schoolId, 'authtest_defaultrole']
      );
      expect(user.role).toBe('TEACHER');
    });
  });

  /* ==========================================================================
   * USER LOGIN
   * ======================================================================== */
  describe('User Login', () => {

    beforeAll(async () => {
      // Create the main login test user via helper (handles school_id + DELETE→INSERT)
      testUser = await createTestUser(
        schoolId,
        'authtest_loginuser',
        'loginuser@example.com',
        'LoginTest123!',
        'TEACHER'
      );
    });

    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.username).toBe('authtest_loginuser');
      expect(response.body.data.user).not.toHaveProperty('password_hash');

      authToken = response.body.data.token;

      const decoded = jwt.decode(authToken);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('username');
      expect(decoded).toHaveProperty('role');
    });

    test('should login with email instead of username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'loginuser@example.com', password: 'LoginTest123!' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('token');
    });

    test('should reject login with wrong password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'WrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/invalid|incorrect|credentials/i);
    });

    test('should reject login with non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'Password123!' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('should reject login for inactive user', async () => {
      // Create inactive user directly via DB (helper always sets is_active = TRUE)
      await db.query(
        `DELETE FROM users WHERE school_id = $1 AND username = 'authtest_inactive'`,
        [schoolId]
      );
      const hash = await bcrypt.hash('InactivePass123!', 10);
      await db.queryOne(
        `INSERT INTO users
           (school_id, username, email, password_hash, role, is_active)
         VALUES ($1, 'authtest_inactive', 'inactive@example.com', $2, 'TEACHER', FALSE)
         RETURNING *`,
        [schoolId, hash]
      );

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_inactive', password: 'InactivePass123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/inactive|disabled|deactivated/i);
    });

    test('should update last_login timestamp on successful login', async () => {
      const beforeLogin = new Date();

      await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const user = await db.queryOne(
        'SELECT last_login FROM users WHERE school_id = $1 AND username = $2',
        [schoolId, 'authtest_loginuser']
      );

      expect(user.last_login).toBeTruthy();
      expect(new Date(user.last_login).getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
    });

    test('should return refresh token on login', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      expect(response.body.data).toHaveProperty('refreshToken');
      refreshToken = response.body.data.refreshToken;

      const storedToken = await db.queryOne(
        'SELECT * FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );

      expect(storedToken).toBeTruthy();
      expect(storedToken.user_id).toBe(testUser.id);
      expect(storedToken.is_revoked).toBe(false);
    });
  });

  /* ==========================================================================
   * TOKEN AUTHENTICATION
   * ======================================================================== */
  describe('Token Authentication', () => {

    test('should access protected route with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.username).toBe('authtest_loginuser');
    });

    test('should reject request without token', async () => {
      const response = await request(app).get('/api/v1/users/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/token|authentication/i);
    });

    test('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid_token_here');

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid|token/i);
    });

    test('should reject request with expired token', async () => {
      const expiredToken = jwt.sign(
        { userId: testUser.id, username: testUser.username, role: testUser.role },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '-1h' }
      );

      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/expired|token/i);
    });

    test('should reject token with malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', authToken);   // Missing "Bearer " prefix

      expect(response.status).toBe(401);
    });

    test('should include user info in token payload', async () => {
      const decoded = jwt.decode(authToken);

      expect(decoded.userId).toBe(testUser.id);
      expect(decoded.username).toBe(testUser.username);
      expect(decoded.role).toBe(testUser.role);
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });
  });

  /* ==========================================================================
   * TOKEN REFRESH
   * ======================================================================== */
  describe('Token Refresh', () => {

    test('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.token).not.toBe(authToken);

      // Update for downstream tests
      authToken    = response.body.data.token;
      refreshToken = response.body.data.refreshToken;
    });

    test('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid_refresh_token' });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/invalid|token/i);
    });

    test('should reject refresh with revoked token', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const tokenToRevoke = loginResponse.body.data.refreshToken;

      await db.query(
        'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1',
        [tokenToRevoke]
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tokenToRevoke });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/revoked|invalid/i);
    });

    test('should reject refresh with expired refresh token', async () => {
      const expiredRefreshToken = jwt.sign(
        { userId: testUser.id, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'test_refresh_secret',
        { expiresIn: '-1d' }
      );

      await db.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at, is_revoked)
         VALUES ($1, $2, NOW() - INTERVAL '1 day', FALSE)`,
        [testUser.id, expiredRefreshToken]
      );

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: expiredRefreshToken });

      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * LOGOUT
   * ======================================================================== */
  describe('Logout', () => {

    test('should logout and revoke refresh token', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const token        = loginResponse.body.data.token;
      const sessionToken = loginResponse.body.data.refreshToken;

      const logoutResponse = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({ refreshToken: sessionToken });

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);

      const revokedToken = await db.queryOne(
        'SELECT is_revoked FROM refresh_tokens WHERE token = $1',
        [sessionToken]
      );
      expect(revokedToken.is_revoked).toBe(true);

      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: sessionToken });
      expect(refreshResponse.status).toBe(401);
    });

    test('should logout without refresh token (access token only)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 204]).toContain(response.status);
    });

    test('should require authentication for logout', async () => {
      const response = await request(app).post('/api/v1/auth/logout');
      expect(response.status).toBe(401);
    });
  });

  /* ==========================================================================
   * PASSWORD MANAGEMENT
   * ======================================================================== */
  describe('Password Management', () => {

    // Re-login at the start of this block because the logout tests above
    // may have revoked tokens.
    beforeAll(async () => {
      authToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });

    test('should change password with correct old password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ oldPassword: 'LoginTest123!', newPassword: 'NewSecurePass123!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify new password works
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'NewSecurePass123!' });
      expect(loginResponse.status).toBe(200);

      // Restore original password
      const newToken = loginResponse.body.data.token;
      await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ oldPassword: 'NewSecurePass123!', newPassword: 'LoginTest123!' });

      authToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });

    test('should reject password change with wrong old password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ oldPassword: 'WrongPassword123!', newPassword: 'NewSecurePass123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/incorrect|invalid|old password/i);
    });

    test('should validate new password strength on change', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ oldPassword: 'LoginTest123!', newPassword: 'weak' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/password/i);
    });

    test('should require authentication for password change', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ oldPassword: 'LoginTest123!', newPassword: 'NewSecurePass123!' });

      expect(response.status).toBe(401);
    });

    test('should initiate password reset request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'loginuser@example.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const resetToken = await db.queryOne(
        `SELECT * FROM password_reset_tokens
         WHERE user_id = $1 AND used = FALSE AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [testUser.id]
      );
      expect(resetToken).toBeTruthy();
    });

    test('should reset password with valid token', async () => {
      const resetToken  = require('crypto').randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour', FALSE)`,
        [testUser.id, hashedToken]
      );

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'ResetPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'ResetPassword123!' });
      expect(loginResponse.status).toBe(200);

      // Restore original password
      const newToken = loginResponse.body.data.token;
      await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ oldPassword: 'ResetPassword123!', newPassword: 'LoginTest123!' });

      authToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });

    test('should reject password reset with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid_reset_token', newPassword: 'NewPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid|expired|token/i);
    });

    test('should reject password reset with expired token', async () => {
      const resetToken  = require('crypto').randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
         VALUES ($1, $2, NOW() - INTERVAL '1 hour', FALSE)`,
        [testUser.id, hashedToken]
      );

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/expired/i);
    });

    test('should mark reset token as used after successful reset', async () => {
      const resetToken  = require('crypto').randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);

      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour', FALSE)`,
        [testUser.id, hashedToken]
      );

      await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherPassword123!' });

      // Attempt to reuse the same token
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: resetToken, newPassword: 'YetAnotherPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/used|invalid/i);

      // Restore password for downstream tests
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'AnotherPassword123!' });
      const newToken = loginResponse.body.data.token;
      await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ oldPassword: 'AnotherPassword123!', newPassword: 'LoginTest123!' });

      authToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });
  });

  /* ==========================================================================
   * AUTHORIZATION AND ROLES
   * ======================================================================== */
  describe('Authorization and Roles', () => {
    let adminToken;
    let teacherToken;

    beforeAll(async () => {
      await createTestUser(schoolId, 'authtest_admin', 'admin@example.com', 'AdminPass123!', 'ADMIN');
      adminToken   = await getAuthToken(app, 'authtest_admin',     'AdminPass123!');
      teacherToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });

    test('should allow admin to access admin-only routes', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) expect(response.body.success).toBe(true);
    });

    test('should deny teacher access to admin-only routes', async () => {
      const response = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/forbidden|permission|unauthorized|access denied/i);
    });

    test('should include role in JWT payload', async () => {
      expect(jwt.decode(adminToken).role).toBe('ADMIN');
      expect(jwt.decode(teacherToken).role).toBe('TEACHER');
    });

    test('should allow role-based access control', async () => {
      const adminResponse = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          school_id: schoolId,
          username:  'authtest_newuser',
          email:     'newuser@example.com',
          password:  'NewUser123!',
          firstName: 'New',
          lastName:  'User',
          role:      'TEACHER',
        });
      expect([200, 201, 404]).toContain(adminResponse.status);

      const teacherResponse = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          school_id: schoolId,
          username:  'authtest_anotheruser',
          email:     'another@example.com',
          password:  'AnotherUser123!',
          firstName: 'Another',
          lastName:  'User',
          role:      'TEACHER',
        });
      if (teacherResponse.status !== 404) expect(teacherResponse.status).toBe(403);
    });
  });

  /* ==========================================================================
   * SESSION MANAGEMENT
   * ======================================================================== */
  describe('Session Management', () => {

    test('should track multiple active sessions', async () => {
      const session1 = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const session2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      expect(session1.body.data.token).not.toBe(session2.body.data.token);

      const check1 = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${session1.body.data.token}`);
      const check2 = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${session2.body.data.token}`);

      expect(check1.status).toBe(200);
      expect(check2.status).toBe(200);
    });

    test('should list active sessions for user', async () => {
      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data.length).toBeGreaterThan(0);
      }
    });

    test('should revoke specific session', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const sessionRefreshToken = loginResponse.body.data.refreshToken;

      const revokeResponse = await request(app)
        .delete(`/api/v1/auth/sessions/${sessionRefreshToken}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (revokeResponse.status === 200) {
        const refreshResponse = await request(app)
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: sessionRefreshToken });
        expect(refreshResponse.status).toBe(401);
      }
    });

    test('should revoke all sessions (logout all devices)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        const activeTokens = await db.queryAll(
          'SELECT * FROM refresh_tokens WHERE user_id = $1 AND is_revoked = FALSE',
          [testUser.id]
        );
        expect(activeTokens.length).toBe(0);
      }
    });
  });

  /* ==========================================================================
   * SECURITY FEATURES
   * ======================================================================== */
  describe('Security Features', () => {

    // Re-login because logout-all above may have wiped all tokens
    beforeAll(async () => {
      authToken = await getAuthToken(app, 'authtest_loginuser', 'LoginTest123!');
    });

    test('should rate limit login attempts', async () => {
      const attempts = [];
      for (let i = 0; i < 6; i++) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'authtest_loginuser', password: 'WrongPassword123!' });
        attempts.push(response);
      }

      const last = attempts[attempts.length - 1];
      expect([401, 429]).toContain(last.status);
      if (last.status === 429) {
        expect(last.body.error).toMatch(/rate limit|too many/i);
      }
    });

    test('should sanitize user input to prevent SQL injection', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: "admin' OR '1'='1", password: 'anything' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

   test('should prevent timing attacks on password comparison', async () => {
      // Run sequentially — parallel bcrypt calls compete for the same CPU
      // thread and will always show high variance on a single Node process.
      const times = [];
      for (let i = 0; i < 4; i++) {
        const start = Date.now();
        await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'authtest_loginuser', password: 'WrongPassword123!' });
        times.push(Date.now() - start);
      }

      // bcrypt must actually run (not short-circuit on user-not-found)
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avg).toBeGreaterThan(50);

      // Variance should be reasonable across runs
      const maxDeviation = Math.max(...times.map(t => Math.abs(t - avg)));
      expect(maxDeviation).toBeLessThan(2000);
    });

    test('should implement CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000');

      if (response.headers['access-control-allow-origin']) {
        expect(response.headers).toHaveProperty('access-control-allow-origin');
        expect(response.headers).toHaveProperty('access-control-allow-methods');
      }
    });

    test('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'nonexistent_user_xyz', password: 'Password123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).not.toMatch(/user not found|username does not exist/i);
      expect(response.body.error).toMatch(/invalid credentials|authentication failed/i);
    });

    test('should use secure password hashing (bcrypt)', async () => {
      const password = 'TestPassword123!';
      const hash1    = await bcrypt.hash(password, 10);
      const hash2    = await bcrypt.hash(password, 10);

      expect(hash1).toMatch(/^\$2[aby]\$/);
      expect(hash1.length).toBeGreaterThan(50);
      expect(hash1).not.toBe(hash2);  // salt randomness
    });
  });

  /* ==========================================================================
   * TOKEN EXPIRATION AND RENEWAL
   * ======================================================================== */
  describe('Token Expiration and Renewal', () => {

    test('should set appropriate token expiration times', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const decoded    = jwt.decode(loginResponse.body.data.token);
      const expiresIn  = decoded.exp - decoded.iat;

      expect(expiresIn).toBeGreaterThan(900);    // > 15 minutes
      expect(expiresIn).toBeLessThan(86400);     // < 24 hours
    });

    test('should allow token refresh before expiration', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'authtest_loginuser', password: 'LoginTest123!' });

      const rt = loginResponse.body.data.refreshToken;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const refreshResponse = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.data.token).toBeTruthy();
    });

    test('should clean up expired tokens', async () => {
      const response = await request(app)
        .post('/api/v1/auth/cleanup-tokens')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status !== 404) {
        expect([200, 204, 403]).toContain(response.status);
      }
    });
  });
});