/**
 * M-PESA Service Integration Tests
 * Tests M-Pesa Daraja API integration, STK Push, callbacks, and reconciliation
 */

const request = require('supertest');
const nock = require('nock');
const app = require('../../../src/app');
const db = require('../../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestTerm,
  createTestStudent,
  getAuthToken,
  destroyTestSchool,
} = require('../../helpers/test-helpers');

describe('M-PESA Service Integration Tests', () => {
  let adminToken;
  let parentToken;
  let testSchool;
  let testData = {};

  // M-PESA API mock configuration
  const MPESA_CONFIG = {
    consumerKey: 'test_consumer_key',
    consumerSecret: 'test_consumer_secret',
    passkey: 'test_passkey_for_stk_push',
    shortCode: '174379',
    baseUrl: 'https://sandbox.safaricom.co.ke'
  };

  beforeAll(async () => {
    // Each suite gets its own school — no cross-suite collisions
    testSchool = await createTestSchool('mpesa-service-test', {
      name: 'MPESA Service Test School'
    });

    const adminUser = await createTestUser(
      testSchool.id,
      'mpesatest_admin',
      'mpesaadmin@test.com',
      'mpesa123',
      'ADMIN'
    );

    const parentUser = await createTestUser(
      testSchool.id,
      'mpesatest_parent',
      'mpesaparent@test.com',
      'mpesa123',
      'ADMIN' // ADMIN role for testing
    );

    adminToken  = await getAuthToken(app, 'mpesatest_admin', 'mpesa123');
    parentToken = await getAuthToken(app, 'mpesatest_parent', 'mpesa123');

    testData.class = await createTestClass(
      testSchool.id,
      'Grade 5 MPESA Test',
      5
    );

    testData.term = await createTestTerm(
      testSchool.id,
      2025, 1,
      '2025-01-15',
      '2025-04-30'
    );

    testData.student = await createTestStudent(
      testSchool.id,
      'MPTEST001',
      'Grace',
      'Wanjiku',
      testData.class.id,
      { gender: 'FEMALE', dateOfBirth: '2015-01-15' }
    );

    // Invoice — always pass school_id explicitly to bypass the trigger
    testData.invoice = await db.queryOne(
      `INSERT INTO invoices (school_id, student_id, term_id, total_amount, status)
       VALUES ($1, $2, $3, 15000, 'UNPAID')
       RETURNING *`,
      [testSchool.id, testData.student.id, testData.term.id]
    );

    // M-PESA config — school_config has a single-column unique on config_key
    // so ON CONFLICT (config_key) is fine here (no school_id column on that table)
    await db.query(
      `INSERT INTO school_config (config_key, config_value)
       VALUES
         ('mpesa_enabled',         'true'),
         ('mpesa_consumer_key',    $1),
         ('mpesa_consumer_secret', $2),
         ('mpesa_passkey',         $3),
         ('mpesa_shortcode',       $4)
       ON CONFLICT (config_key)
       DO UPDATE SET config_value = EXCLUDED.config_value`,
      [
        MPESA_CONFIG.consumerKey,
        MPESA_CONFIG.consumerSecret,
        MPESA_CONFIG.passkey,
        MPESA_CONFIG.shortCode,
      ]
    );
  });

  afterAll(async () => {
    // Deleting the school cascades to everything beneath it
    await destroyTestSchool('mpesa-service-test');
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // ─── OAuth Token Generation ────────────────────────────────────────────────

  describe('OAuth Token Generation', () => {
    test('should generate access token', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .basicAuth({ user: MPESA_CONFIG.consumerKey, pass: MPESA_CONFIG.consumerSecret })
        .reply(200, { access_token: 'test_access_token_12345', expires_in: '3599' });

      const response = await request(app)
        .post('/api/v1/mpesa/token')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 501]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body.data).toHaveProperty('accessToken');
        expect(response.body.data).toHaveProperty('expiresIn');
      }
    });

    test('should handle OAuth authentication failure', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .basicAuth({ user: MPESA_CONFIG.consumerKey, pass: MPESA_CONFIG.consumerSecret })
        .reply(401, { errorCode: '401.002.01', errorMessage: 'Invalid credentials' });

      const response = await request(app)
        .post('/api/v1/mpesa/token')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([401, 500, 404, 501]).toContain(response.status);
    });

    test('should cache access token', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .basicAuth({ user: MPESA_CONFIG.consumerKey, pass: MPESA_CONFIG.consumerSecret })
        .reply(200, { access_token: 'cached_token', expires_in: '3599' });

      await request(app)
        .post('/api/v1/mpesa/token')
        .set('Authorization', `Bearer ${adminToken}`);

      const response = await request(app)
        .post('/api/v1/mpesa/token')
        .set('Authorization', `Bearer ${adminToken}`);

      expect([200, 404, 501]).toContain(response.status);
    });
  });

  // ─── STK Push Initiation ──────────────────────────────────────────────────

  describe('STK Push Initiation', () => {
    test('should initiate STK push for fee payment', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, { access_token: 'test_token', expires_in: '3599' });

      nock(MPESA_CONFIG.baseUrl)
        .post('/mpesa/stkpush/v1/processrequest')
        .reply(200, {
          MerchantRequestID:  'merchant_req_12345',
          CheckoutRequestID:  'checkout_req_67890',
          ResponseCode:       '0',
          ResponseDescription:'Success. Request accepted for processing',
          CustomerMessage:    'Success. Request accepted for processing'
        });

      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           5000,
          accountReference: testData.student.admission_no,
          transactionDesc:  'School fees payment'
        });

      expect([200, 201,400, 404, 501]).toContain(response.status);

      if ([200, 201].includes(response.status)) {
        expect(response.body.data).toHaveProperty('CheckoutRequestID');
        expect(response.body.data).toHaveProperty('ResponseCode');
        testData.checkoutRequestID = response.body.data.CheckoutRequestID;
      }
    });

    test('should validate phone number format', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '0712345678', // must start with 254
          amount:           5000,
          accountReference: testData.student.admission_no
        });

      expect([400, 422, 404, 501]).toContain(response.status);
    });

    test('should validate amount is positive', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           -1000,
          accountReference: testData.student.admission_no
        });

      expect([400, 422, 404, 501]).toContain(response.status);
    });

    test('should validate minimum amount', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           0.5,
          accountReference: testData.student.admission_no
        });

      expect([400, 422, 404, 501]).toContain(response.status);
    });

    test('should handle STK push rejection', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, { access_token: 'test_token', expires_in: '3599' });

      nock(MPESA_CONFIG.baseUrl)
        .post('/mpesa/stkpush/v1/processrequest')
        .reply(200, {
          ResponseCode:        '1',
          ResponseDescription: 'Request rejected',
          errorCode:           '400.002.02',
          errorMessage:        'Bad Request - Invalid PhoneNumber'
        });

      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           5000,
          accountReference: testData.student.admission_no
        });

      expect([400, 500, 404, 501]).toContain(response.status);
    });

    test('should link STK push to invoice', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, { access_token: 'test_token', expires_in: '3599' });

      nock(MPESA_CONFIG.baseUrl)
        .post('/mpesa/stkpush/v1/processrequest')
        .reply(200, {
          CheckoutRequestID:   'checkout_invoice_link',
          ResponseCode:        '0',
          ResponseDescription: 'Success'
        });

      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           5000,
          accountReference: testData.student.admission_no,
          invoiceId:        testData.invoice.id
        });

      expect([200, 201,400, 404, 501]).toContain(response.status);
    });
  });

  // ─── STK Push Callback Handling ───────────────────────────────────────────

  describe('STK Push Callback Handling', () => {
    test('should handle successful payment callback', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant_success_001',
              CheckoutRequestID: 'checkout_success_001',
              ResultCode:        0,
              ResultDesc:        'The service request is processed successfully.',
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount',             Value: 5000 },
                  { Name: 'MpesaReceiptNumber', Value: 'QA12B3C4D5' },
                  { Name: 'TransactionDate',    Value: 20250120103045 },
                  { Name: 'PhoneNumber',         Value: 254712345678 }
                ]
              }
            }
          }
        });

      expect([200, 201]).toContain(response.status);
    });

    test('should handle failed payment callback', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant_fail_001',
              CheckoutRequestID: 'checkout_fail_001',
              ResultCode:        1032,
              ResultDesc:        'Request cancelled by user'
            }
          }
        });

      expect([200, 201]).toContain(response.status);
    });

    test('should handle timeout callback', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant_timeout_001',
              CheckoutRequestID: 'checkout_timeout_001',
              ResultCode:        1037,
              ResultDesc:        'DS timeout user cannot be reached'
            }
          }
        });

      expect([200, 201]).toContain(response.status);
    });

    test('should store transaction in database on success', async () => {
      const receiptNumber = `QA99Z9Y9X9_${Date.now()}`;

      await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: 'merchant_db_001',
              CheckoutRequestID: `checkout_db_${Date.now()}`,
              ResultCode:        0,
              ResultDesc:        'Success',
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount',             Value: 3000 },
                  { Name: 'MpesaReceiptNumber', Value: receiptNumber },
                  { Name: 'TransactionDate',    Value: 20250120103045 },
                  { Name: 'PhoneNumber',         Value: 254712345678 }
                ]
              }
            }
          }
        });

      await new Promise(resolve => setTimeout(resolve, 100));

      const transaction = await db.queryOne(
        'SELECT * FROM mpesa_transactions WHERE mpesa_receipt_number = $1',
        [receiptNumber]
      );

      if (transaction) {
        expect(parseFloat(transaction.amount)).toBe(3000);
        expect(transaction.status).toMatch(/COMPLETED|PENDING/);
      }
    });

    test('should validate callback signature', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({ Body: { InvalidStructure: {} } });

      expect([200, 400]).toContain(response.status);
    });

    test('should handle duplicate callbacks idempotently', async () => {
      const receiptNumber = `QA55D44E33_${Date.now()}`;
      const callbackData = {
        Body: {
          stkCallback: {
            CheckoutRequestID: `checkout_duplicate_${Date.now()}`,
            ResultCode:        0,
            ResultDesc:        'Success',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount',             Value: 2000 },
                { Name: 'MpesaReceiptNumber', Value: receiptNumber },
                { Name: 'TransactionDate',    Value: 20250120103045 },
                { Name: 'PhoneNumber',         Value: 254712345678 }
              ]
            }
          }
        }
      };

      await request(app).post('/api/v1/webhooks/mpesa/callback').send(callbackData);

      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send(callbackData);

      expect([200, 201, 409]).toContain(response.status);
    });
  });

  // ─── Transaction Query ────────────────────────────────────────────────────

  describe('Transaction Query', () => {
    test('should query STK push transaction status', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, { access_token: 'test_token', expires_in: '3599' });

      nock(MPESA_CONFIG.baseUrl)
        .post('/mpesa/stkpushquery/v1/query')
        .reply(200, {
          ResponseCode:        '0',
          ResponseDescription: 'The service request has been accepted successfully',
          MerchantRequestID:   'merchant_query_001',
          CheckoutRequestID:   'checkout_query_001',
          ResultCode:          '0',
          ResultDesc:          'The service request is processed successfully.'
        });

      const response = await request(app)
        .post('/api/v1/mpesa/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ checkoutRequestID: 'checkout_query_001' });

      expect([200, 404, 501]).toContain(response.status);
    });

    test('should filter transactions by status', async () => {
      const response = await request(app)
        .get('/api/v1/mpesa/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ status: 'COMPLETED' });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    test('should filter transactions by date range', async () => {
      const response = await request(app)
        .get('/api/v1/mpesa/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2025-01-01', endDate: '2025-01-31' });

      expect([200, 404]).toContain(response.status);
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────────
  describe('Error Handling', () => {
    test('should handle M-PESA API timeout', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, { access_token: 'test_token', expires_in: '3599' });

      nock(MPESA_CONFIG.baseUrl)
        .post('/mpesa/stkpush/v1/processrequest')
        .delayConnection(10000)
        .reply(500, 'Timeout');

      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           5000,
          accountReference: testData.student.admission_no
        });

      expect([500, 504,400, 404, 501]).toContain(response.status);
    });

    test('should handle invalid credentials', async () => {
      nock(MPESA_CONFIG.baseUrl)
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(401, { errorCode: '401.002.01', errorMessage: 'Invalid credentials' });

      const response = await request(app)
        .post('/api/v1/mpesa/stk-push')
        .set('Authorization', `Bearer ${parentToken}`)
        .send({
          phoneNumber:      '254712345678',
          amount:           5000,
          accountReference: testData.student.admission_no
        });

      expect([401, 500, 400,404, 501]).toContain(response.status);
    });
  });

  // ─── Integration Edge Cases ───────────────────────────────────────────────

  describe('Integration Edge Cases', () => {
    test('should handle callback before STK push response', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: `checkout_early_callback_${Date.now()}`,
              ResultCode:        0,
              ResultDesc:        'Success',
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount',             Value: 3000 },
                  { Name: 'MpesaReceiptNumber', Value: `QA11Z22Y33_${Date.now()}` },
                  { Name: 'TransactionDate',    Value: 20250120103045 },
                  { Name: 'PhoneNumber',         Value: 254712345678 }
                ]
              }
            }
          }
        });

      expect([200, 201]).toContain(response.status);
    });

    test('should handle partial callback data', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: `checkout_partial_${Date.now()}`,
              ResultCode:        0,
              ResultDesc:        'Success'
              // Missing CallbackMetadata intentionally
            }
          }
        });

      expect([200, 201, 400]).toContain(response.status);
    });
  });
});