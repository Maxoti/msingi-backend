/**
 * Notification Queue & SMS API – Integration Tests
 * Scope:
 * - Queue a notification (SMS / EMAIL)
 * - List / filter notifications
 * - Get single notification
 * - Update notification
 * - Delete notification
 * - Retry failed / retry-all
 * - Notification stats
 * - SMS logs (list, stats, single)
 */

const request = require('supertest');

const app = require('../../src/app');
const db  = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestStudent,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'notifications-test-school';

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let adminToken;
let testClass;
let testStudent;
let testNotification; // set after first successful POST

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  school = await createTestSchool(SCHOOL_SLUG, { name: 'Notifications Test School' });

  await createTestUser(
    school.id,
    'queueadmin',
    'queueadmin@test.com',
    'queueadmin123',
    'ADMIN'
  );

  adminToken = await getAuthToken(app, 'queueadmin', 'queueadmin123');

  testClass = await createTestClass(school.id, 'Queue Test Class', 5);

  testStudent = await createTestStudent(
    school.id,
    'QUEUE_TEST_001',
    'Queue',
    'Student',
    testClass.id,
    { gender: 'MALE', dateOfBirth: '2013-03-20' }
  );
});

/* -------------------------------------------------------------------------- */
/*                    POST /api/v1/notifications – Queue                      */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/notifications - Queue a Notification', () => {
  test('should queue an SMS notification', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type:       'SMS',
        recipient:  '+254712345678',
        message:    'Your fee balance is KES 5,000. Please pay by Friday.',
        student_id: testStudent.id,
        priority:   5,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.type).toBe('SMS');
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.recipient).toBe('+254712345678');

    testNotification = response.body.data; // store for later tests
  });

  test('should queue an EMAIL notification with subject', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type:       'EMAIL',
        recipient:  'parent@example.com',
        subject:    'School Fees Reminder',
        message:    'Dear parent, kindly settle outstanding fees.',
        student_id: testStudent.id,
        priority:   3,
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.type).toBe('EMAIL');
    expect(response.body.data.subject).toBe('School Fees Reminder');
  });

  test('should fail without type', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ recipient: '+254712345678', message: 'Missing type' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/type is required/i);
  });

  test('should fail with invalid type', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'PUSH', recipient: '+254712345678', message: 'Invalid type' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/SMS.*EMAIL/i);
  });

  test('should fail when EMAIL has no subject', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'EMAIL', recipient: 'test@example.com', message: 'Missing subject' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/subject is required/i);
  });

  test('should fail with non-existent student_id', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SMS', recipient: '+254712345678', message: 'Test', student_id: 999999 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/student_id does not exist/i);
  });

  test('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/notifications')
      .send({ type: 'SMS', recipient: '+254712345678', message: 'Unauthorized' });

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                   GET /api/v1/notifications – List                         */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications - List Notifications', () => {
  test('should get all notifications with pagination', async () => {
    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
  });

  test('should filter by status', async () => {
    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'PENDING' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should filter by type', async () => {
    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ type: 'SMS' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail with invalid status filter', async () => {
    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'INVALID' });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Invalid status/i);
  });

  test('should fail without authentication', async () => {
    const response = await request(app).get('/api/v1/notifications');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*               GET /api/v1/notifications/:id – Single                       */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications/:id - Get Single Notification', () => {
  test('should get notification by ID', async () => {
    expect(testNotification).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/notifications/${testNotification.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(testNotification.id);
    expect(response.body.data.message).toBe(testNotification.message);
  });

  test('should return 404 for non-existent notification', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/not found/i);
  });

  test('should fail with invalid ID', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/positive integer/i);
  });
});

/* -------------------------------------------------------------------------- */
/*               PUT /api/v1/notifications/:id – Update                       */
/* -------------------------------------------------------------------------- */

describe('PUT /api/v1/notifications/:id - Update Notification', () => {
  let pendingNotification;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SMS', recipient: '+254700000000', message: 'To be updated', priority: 5 });

    if (res.status === 201) pendingNotification = res.body.data;
  });

  test('should update priority of PENDING notification', async () => {
    expect(pendingNotification).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/notifications/${pendingNotification.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 1 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.priority).toBe(1);
  });

  test('should cancel notification by setting status to FAILED', async () => {
    expect(pendingNotification).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/notifications/${pendingNotification.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'FAILED' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('FAILED');
  });

  test('should fail to update non-existent notification', async () => {
    const response = await request(app)
      .put('/api/v1/notifications/999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priority: 3 });

    expect(response.status).toBe(404);
  });

  test('should fail with no update fields', async () => {
    expect(testNotification).toBeDefined();

    const response = await request(app)
      .put(`/api/v1/notifications/${testNotification.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/At least one field is required/i);
  });
});

/* -------------------------------------------------------------------------- */
/*              DELETE /api/v1/notifications/:id – Delete                     */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/v1/notifications/:id - Delete Notification', () => {
  test('should delete a PENDING notification', async () => {
    const createRes = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SMS', recipient: '+254711111111', message: 'To be deleted' });

    expect(createRes.status).toBe(201);

    const response = await request(app)
      .delete(`/api/v1/notifications/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toMatch(/deleted successfully/i);
  });

  test('should fail to delete non-existent notification', async () => {
    const response = await request(app)
      .delete('/api/v1/notifications/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*          POST /api/v1/notifications/retry/:id – Retry Failed               */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/notifications/retry/:id - Retry Failed Notification', () => {
  let failedNotification;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SMS', recipient: '+254722222222', message: 'Will fail and retry' });

    if (res.status === 201) {
      const notifId = res.body.data.id;

      await request(app)
        .put(`/api/v1/notifications/${notifId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'FAILED' });

      failedNotification = { id: notifId };
    }
  });

  test('should retry a FAILED notification', async () => {
    expect(failedNotification).toBeDefined();

    const response = await request(app)
      .post(`/api/v1/notifications/retry/${failedNotification.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.attempts).toBeGreaterThan(0);
  });

  test('should fail to retry non-existent notification', async () => {
    const response = await request(app)
      .post('/api/v1/notifications/retry/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/*          POST /api/v1/notifications/retry-all – Retry All Failed           */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/notifications/retry-all - Retry All Failed', () => {
  test('should retry all failed notifications', async () => {
    const response = await request(app)
      .post('/api/v1/notifications/retry-all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('retried_count');
    expect(response.body.data).toHaveProperty('retried_ids');
  });

  test('should retry failed notifications for specific student', async () => {
    const response = await request(app)
      .post('/api/v1/notifications/retry-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ student_id: testStudent.id });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*            GET /api/v1/notifications/stats – Queue Stats                   */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications/stats - Notification Stats', () => {
  test('should get notification queue statistics', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('by_status');
    expect(response.body.data).toHaveProperty('by_type');
    expect(response.body.data).toHaveProperty('today');
  });

  test('should fail without authentication', async () => {
    const response = await request(app).get('/api/v1/notifications/stats');

    expect(response.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*           GET /api/v1/notifications/sms-logs – List SMS Logs               */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications/sms-logs - List SMS Logs', () => {
  beforeAll(async () => {
    await db.query(
      `INSERT INTO sms_logs
         (school_id, recipient_phone, message, message_type, status, cost)
       VALUES ($1, '+254733333333', 'Test SMS', 'PAYMENT_CONFIRMATION', 'DELIVERED', 2.50)`,
      [school.id]
    );
  });

  test('should get SMS logs with pagination', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.pagination).toBeDefined();
  });

  test('should filter by status', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'DELIVERED' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should filter by phone number (partial match)', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ phone: '733' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('should fail with invalid status', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'INVALID' });

    expect(response.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/*       GET /api/v1/notifications/sms-logs/stats – SMS Stats                 */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications/sms-logs/stats - SMS Stats', () => {
  test('should get SMS log statistics', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('by_status');
    expect(response.body.data).toHaveProperty('by_message_type');
    expect(response.body.data).toHaveProperty('totals');
    expect(response.body.data).toHaveProperty('delivery_rate_percent');
  });
});

/* -------------------------------------------------------------------------- */
/*        GET /api/v1/notifications/sms-logs/:id – Single SMS Log             */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/notifications/sms-logs/:id - Get SMS Log', () => {
  test('should get SMS log by ID', async () => {
    const log = await db.queryOne(
      `INSERT INTO sms_logs
         (school_id, recipient_phone, message, message_type, status)
       VALUES ($1, '+254744444444', 'Single log test', 'INVOICE_REMINDER', 'SENT')
       RETURNING *`,
      [school.id]
    );

    expect(log).toBeDefined();
    expect(log.id).toBeDefined();

    const response = await request(app)
      .get(`/api/v1/notifications/sms-logs/${log.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(log.id);
    expect(response.body.data.recipient_phone).toBe('+254744444444');
  });

  test('should return 404 for non-existent log', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs/999999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });

  test('should fail with invalid ID', async () => {
    const response = await request(app)
      .get('/api/v1/notifications/sms-logs/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 CLEANUP                                    */
/* -------------------------------------------------------------------------- */

afterAll(async () => {
  // Deleting the school cascades to all child records automatically
  await destroyTestSchool(SCHOOL_SLUG);
});