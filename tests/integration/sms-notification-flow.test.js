/**
 * SMS Notification Flow Integration Tests
 *
 * MULTI-TENANT NOTES
 * ──────────────────
 * Every tenant table has a stamp_school_id() BEFORE INSERT trigger that fires
 * WHEN (NEW.school_id IS NULL) and reads it from session context — which does
 * not exist in tests.
 *
 * Golden rule: every raw INSERT must supply school_id explicitly so the
 * trigger condition is never true.
 *
 * school_config has NO school_id column (confirmed from schema dump).
 * Its unique constraint is school_config_config_key_key (config_key only).
 */

'use strict';

const request = require('supertest');
const nock    = require('nock');
const app     = require('../../src/app');
const db      = require('../../src/shared/database/client');

const {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestTerm,
  createTestStudent,
  destroyTestSchool,
  getAuthToken,
} = require('../helpers/test-helpers');

describe('SMS Notification Flow Integration Tests', () => {
  let authToken;
  let adminToken;
  let testSchool;
  let testClass;
  let testTerm;
  let testStudent1;
  let testStudent2;
  let testStudent3;

  // ============================================================
  // SETUP
  // ============================================================

  beforeAll(async () => {
    try {
      testSchool = await createTestSchool('sms-test-school', { name: 'SMS Test School' });

      await createTestUser(testSchool.id, 'smsadmin', 'smsadmin@test.com', 'sms123', 'ADMIN');
      await createTestUser(testSchool.id, 'smsuser',  'smsuser@test.com',  'sms123', 'TEACHER');

      adminToken = await getAuthToken(app, 'smsadmin', 'sms123');
      authToken  = await getAuthToken(app, 'smsuser',  'sms123');

      testClass = await createTestClass(testSchool.id, 'SMS Test Class', 4);
      testTerm  = await createTestTerm(testSchool.id, 2025, 1, '2025-01-01', '2025-04-30');

      testStudent1 = await createTestStudent(
        testSchool.id, 'SMS_TEST_001', 'John', 'Doe', testClass.id,
        { gender: 'MALE', dateOfBirth: '2012-01-15' }
      );
      testStudent2 = await createTestStudent(
        testSchool.id, 'SMS_TEST_002', 'Jane', 'Smith', testClass.id,
        { gender: 'FEMALE', dateOfBirth: '2012-03-20' }
      );
      testStudent3 = await createTestStudent(
        testSchool.id, 'SMS_TEST_003', 'Bob', 'Johnson', testClass.id,
        { gender: 'MALE', dateOfBirth: '2012-05-10' }
      );

      // ── Parent contacts — school_id required to bypass stamp_school_id() ──
      await db.query(
        'DELETE FROM parent_contacts WHERE student_id = ANY($1::int[])',
        [[testStudent1.id, testStudent2.id, testStudent3.id]]
      );

      await db.query(
        `INSERT INTO parent_contacts
           (school_id, student_id, relationship, name, phone, is_primary)
         VALUES ($1, $2, 'FATHER', 'John Doe Sr.', '254712000001', TRUE)`,
        [testSchool.id, testStudent1.id]
      );
      await db.query(
        `INSERT INTO parent_contacts
           (school_id, student_id, relationship, name, phone, is_primary)
         VALUES ($1, $2, 'MOTHER', 'Jane Smith Sr.', '254712000002', TRUE)`,
        [testSchool.id, testStudent2.id]
      );
      await db.query(
        `INSERT INTO parent_contacts
           (school_id, student_id, relationship, name, phone, is_primary)
         VALUES ($1, $2, 'GUARDIAN', 'Bob Johnson Sr.', '254712000003', TRUE)`,
        [testSchool.id, testStudent3.id]
      );

      // ── school_config — global table, NO school_id column ──
      const configs = [
        ['sms_enabled',   'true'],
        ['sms_provider',  'mobiwave'],
        ['sms_api_key',   'test_api_key_sms'],
        ['sms_username',  'testuser'],
        ['sms_sender_id', 'TESTSCHOOL'],
      ];

      for (const [key, value] of configs) {
        await db.query(
          `INSERT INTO school_config (config_key, config_value)
           VALUES ($1, $2)
           ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
          [key, value]
        );
      }
    } catch (error) {
      console.error('SMS Flow — beforeAll error:', error);
      throw error;
    }
  });

  // ============================================================
  // TEARDOWN
  // ============================================================

  afterAll(async () => {
    try {
      await db.query(
        `DELETE FROM notification_queue
         WHERE recipient IN (
           '254712000001',  '254712000002',  '254712000003',
           '+254712000001', '+254712000002', '+254712000003'
         )`
      );
      await db.query(
        `DELETE FROM sms_logs
         WHERE recipient_phone IN (
           '254712000001',  '254712000002',  '254712000003',
           '+254712000001', '+254712000002', '+254712000003'
         )`
      );

      await destroyTestSchool('sms-test-school');
    } catch (error) {
      console.error('SMS Flow — afterAll cleanup error:', error.message);
    } finally {
      await db.pool.end();
    }
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // ============================================================
  // Complete SMS Notification Flow
  // ============================================================

  describe('Complete SMS Notification Flow', () => {
    test('should queue and retrieve a single-student SMS notification', async () => {
      const createRes = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:       'SMS',
          recipient:  '+254712000001',
          message:    'This is a test SMS notification for a single student',
          student_id: testStudent1.id,
          priority:   5,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data).toHaveProperty('id');
      expect(createRes.body.data.status).toBe('PENDING');
      expect(createRes.body.data.type).toBe('SMS');

      const notificationId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/v1/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(notificationId);
      expect(getRes.body.data.recipient).toBe('+254712000001');
    });

    test('should queue SMS notifications for multiple students', async () => {
      const phones     = ['+254712000001', '+254712000002', '+254712000003'];
      const studentIds = [testStudent1.id, testStudent2.id, testStudent3.id];
      const createdIds = [];

      for (let i = 0; i < phones.length; i++) {
        const res = await request(app)
          .post('/api/v1/notifications')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            type:       'SMS',
            recipient:  phones[i],
            message:    'Important class announcement via SMS',
            student_id: studentIds[i],
            priority:   3,
          });

        expect(res.status).toBe(201);
        createdIds.push(res.body.data.id);
      }

      const listRes = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ type: 'SMS', page: 1, limit: 50 });

      expect(listRes.status).toBe(200);

      for (const id of createdIds) {
        expect(listRes.body.data.some((n) => n.id === id)).toBe(true);
      }
    });

    test('should queue SMS to all three parent phones', async () => {
      const phones = ['+254712000001', '+254712000002', '+254712000003'];

      for (const phone of phones) {
        const res = await request(app)
          .post('/api/v1/notifications')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            type:      'SMS',
            recipient: phone,
            message:   'School-wide announcement to all parents',
            priority:  5,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.recipient).toBe(phone);
      }
    });
  });

  // ============================================================
  // SMS Delivery Status Tracking
  // ============================================================

  describe('SMS Delivery Status Tracking', () => {
    test('should record a SENT sms_log entry', async () => {
      const result = await db.query(
        `INSERT INTO sms_logs
           (school_id, recipient_phone, message, message_type, status, cost)
         VALUES ($1, '+254712000001', 'Delivery success test', 'PAYMENT_CONFIRMATION', 'SENT', 0.80)
         RETURNING *`,
        [testSchool.id]
      );
      const log = result.rows[0];

      expect(log).toBeDefined();
      expect(log.status).toBe('SENT');
      expect(log.recipient_phone).toBe('+254712000001');

      const res = await request(app)
        .get(`/api/v1/notifications/sms-logs/${log.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SENT');
    });

    test('should record a FAILED sms_log entry', async () => {
      const result = await db.query(
        `INSERT INTO sms_logs
           (school_id, recipient_phone, message, message_type, status)
         VALUES ($1, '+254712000002', 'Delivery failure test', 'INVOICE_REMINDER', 'FAILED')
         RETURNING *`,
        [testSchool.id]
      );
      const log = result.rows[0];

      expect(log).toBeDefined();
      expect(log.status).toBe('FAILED');

      const res = await request(app)
        .get(`/api/v1/notifications/sms-logs/${log.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('FAILED');
    });

    test('should record a mix of DELIVERED and FAILED logs', async () => {
      await db.query(
        `INSERT INTO sms_logs (school_id, recipient_phone, message, message_type, status, cost)
         VALUES ($1, '+254712000001', 'Partial test 1', 'PAYMENT_CONFIRMATION', 'DELIVERED', 0.80)`,
        [testSchool.id]
      );
      await db.query(
        `INSERT INTO sms_logs (school_id, recipient_phone, message, message_type, status)
         VALUES ($1, '+254712000002', 'Partial test 2', 'INVOICE_REMINDER', 'FAILED')`,
        [testSchool.id]
      );
      await db.query(
        `INSERT INTO sms_logs (school_id, recipient_phone, message, message_type, status, cost)
         VALUES ($1, '+254712000003', 'Partial test 3', 'PAYMENT_CONFIRMATION', 'DELIVERED', 0.80)`,
        [testSchool.id]
      );

      const deliveredRes = await request(app)
        .get('/api/v1/notifications/sms-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'DELIVERED', phone: '254712' });

      expect(deliveredRes.status).toBe(200);
      deliveredRes.body.data.forEach((row) => expect(row.status).toBe('DELIVERED'));

      const failedRes = await request(app)
        .get('/api/v1/notifications/sms-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'FAILED', phone: '254712' });

      expect(failedRes.status).toBe(200);
      failedRes.body.data.forEach((row) => expect(row.status).toBe('FAILED'));
    });

    test('should handle SMS API timeout gracefully by leaving status PENDING', async () => {
      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:      'SMS',
          recipient: '+254712000001',
          message:   'Timeout test message',
          priority:  5,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
    });
  });

  // ============================================================
  // SMS Cost and Statistics
  // ============================================================

  describe('SMS Cost and Statistics', () => {
    test('should track cost in sms_logs', async () => {
      const result = await db.query(
        `INSERT INTO sms_logs
           (school_id, recipient_phone, message, message_type, status, cost)
         VALUES ($1, '+254712000001', 'Cost tracking test', 'PAYMENT_CONFIRMATION', 'DELIVERED', 1.60)
         RETURNING *`,
        [testSchool.id]
      );
      const log = result.rows[0];

      expect(log.cost).toBeDefined();
      expect(parseFloat(log.cost)).toBe(1.6);

      const statsRes = await request(app)
        .get('/api/v1/notifications/sms-logs/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.data).toHaveProperty('totals');
      expect(parseFloat(statsRes.body.data.totals.total_cost)).toBeGreaterThan(0);
    });

    test('should return overall sms-logs statistics', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/sms-logs/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('by_status');
      expect(res.body.data).toHaveProperty('by_message_type');
      expect(res.body.data).toHaveProperty('totals');
      expect(res.body.data).toHaveProperty('delivery_rate_percent');
    });

    test('should filter sms-logs by date range', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/sms-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ from_date: '2025-01-01', to_date: '2030-12-31', page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ============================================================
  // SMS Scheduling and Queueing
  // ============================================================

  describe('SMS Scheduling and Queueing', () => {
    test('should queue an SMS with a future scheduled_for timestamp', async () => {
      const scheduledTime = new Date(Date.now() + 3_600_000).toISOString();

      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:          'SMS',
          recipient:     '+254712000001',
          message:       'This SMS is scheduled for later',
          student_id:    testStudent1.id,
          priority:      3,
          scheduled_for: scheduledTime,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      expect(res.body.data.scheduled_for).toBeTruthy();
    });

    test('should allow updating priority of a scheduled (PENDING) notification', async () => {
      const scheduledTime = new Date(Date.now() + 7_200_000).toISOString();

      const createRes = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:          'SMS',
          recipient:     '+254712000002',
          message:       'Update priority test',
          priority:      8,
          scheduled_for: scheduledTime,
        });

      expect(createRes.status).toBe(201);

      const updateRes = await request(app)
        .put(`/api/v1/notifications/${createRes.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ priority: 2 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.priority).toBe(2);
    });
  });

  // ============================================================
  // SMS Content and Formatting
  // ============================================================

  describe('SMS Content and Formatting', () => {
    test('should accept a long message (>160 chars)', async () => {
      const longMessage = 'A'.repeat(300);

      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:       'SMS',
          recipient:  '+254712000001',
          message:    longMessage,
          student_id: testStudent1.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.message).toBe(longMessage);
    });

    test('should reject an empty message', async () => {
      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:      'SMS',
          recipient: '+254712000001',
          message:   '',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/message is required/i);
    });

    test('should accept special characters in the message', async () => {
      const specialMessage = 'Hello! This costs KES 1,000. Visit: https://example.com & more…';

      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:       'SMS',
          recipient:  '+254712000001',
          message:    specialMessage,
          student_id: testStudent1.id,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.message).toBe(specialMessage);
    });
  });

  // ============================================================
  // Error Handling and Edge Cases
  // ============================================================

  describe('Error Handling and Edge Cases', () => {
    test('should handle a student that has no parent contacts', async () => {
      const orphan = await createTestStudent(
        testSchool.id, 'SMS_ORPHAN_001', 'Orphan', 'Student', testClass.id
      );

      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type:       'SMS',
          recipient:  '+254700000099',
          message:    'Message to orphan student parent',
          student_id: orphan.id,
        });

      expect(res.status).toBe(201);

      await db.query('DELETE FROM students WHERE id = $1', [orphan.id]);
    });

    test('should prevent unauthenticated access', async () => {
      const res = await request(app)
        .post('/api/v1/notifications')
        .send({ type: 'SMS', recipient: '+254712000001', message: 'Unauthorized attempt' });

      expect(res.status).toBe(401);
    });

    test('should reject a non-existent student_id', async () => {
      const res = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'SMS', recipient: '+254712000001', message: 'Bad student', student_id: 999999 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/student_id does not exist/i);
    });

    test('should return 404 when fetching a non-existent notification', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    test('should return 400 for an invalid notification ID', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/abc')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });
  });

  // ============================================================
  // SMS Retry and Resend
  // ============================================================

  describe('SMS Retry and Resend', () => {
    test('should cancel then retry a single notification', async () => {
      const createRes = await request(app)
        .post('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'SMS', recipient: '+254712000001', message: 'Retry flow test', priority: 5 });

      expect(createRes.status).toBe(201);
      const notifId = createRes.body.data.id;

      const cancelRes = await request(app)
        .put(`/api/v1/notifications/${notifId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'FAILED' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('FAILED');

      const retryRes = await request(app)
        .post(`/api/v1/notifications/retry/${notifId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.status).toBe('PENDING');
      expect(retryRes.body.data.attempts).toBeGreaterThan(0);
    });

    test('should retry-all and capture retried IDs', async () => {
      const ids = [];

      for (let i = 0; i < 2; i++) {
        const res = await request(app)
          .post('/api/v1/notifications')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ type: 'SMS', recipient: '+254712000001', message: `Retry-all test ${i}`, priority: 5 });

        expect(res.status).toBe(201);

        await request(app)
          .put(`/api/v1/notifications/${res.body.data.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'FAILED' });

        ids.push(res.body.data.id);
      }

      const retryAllRes = await request(app)
        .post('/api/v1/notifications/retry-all')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(retryAllRes.status).toBe(200);
      expect(retryAllRes.body.data.retried_count).toBeGreaterThanOrEqual(2);

      for (const id of ids) {
        expect(retryAllRes.body.data.retried_ids).toContain(id);
      }
    });
  });

  // ============================================================
  // SMS Reporting and Analytics
  // ============================================================

  describe('SMS Reporting and Analytics', () => {
    test('should return notification queue stats', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('by_status');
      expect(res.body.data).toHaveProperty('by_type');
      expect(res.body.data).toHaveProperty('today');
    });

    test('should return sms-logs stats with delivery rate', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/sms-logs/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('delivery_rate_percent');

      const rate = parseFloat(res.body.data.delivery_rate_percent);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(100);
    });

    test('should filter sms-logs by status', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/sms-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'DELIVERED' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((row) => expect(row.status).toBe('DELIVERED'));
    });
  });
});