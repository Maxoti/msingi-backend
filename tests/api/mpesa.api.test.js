/**
 * M-Pesa API – Integration Tests
 * Scope:
 * - STK Push initiation
 * - Callbacks
 * - Transaction listing
 * - Manual reconciliation
 */

const request = require('supertest');
const nock    = require('nock');

const app = require('../../src/app');
const db  = require('../../src/shared/database/client');
const {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestTerm,
  createTestStudent,
  createTestInvoice,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const SCHOOL_SLUG = 'mpesa-test-school';

// Fake OAuth token returned by the intercepted Safaricom auth endpoint
const FAKE_OAUTH_TOKEN = 'fake-oauth-access-token';

// ─── Shared nock helper ───────────────────────────────────────────────────────

/**
 * Intercept BOTH Safaricom calls that MpesaClient makes for every STK push:
 *   1. GET  /oauth/v1/generate          → returns an access token
 *   2. POST /mpesa/stkpush/v1/processrequest → returns the STK push response
 *
 * Call this once per test that triggers initiatePayment.
 */
function mockStkPush(overrides = {}) {
  // 1 — OAuth token endpoint
  nock('https://sandbox.safaricom.co.ke')
    .get('/oauth/v1/generate')
    .query({ grant_type: 'client_credentials' })
    .reply(200, {
      access_token: FAKE_OAUTH_TOKEN,
      expires_in:   '3599',
    });

  // 2 — STK Push endpoint
  nock('https://sandbox.safaricom.co.ke')
    .post('/mpesa/stkpush/v1/processrequest')
    .reply(200, {
      MerchantRequestID:   overrides.MerchantRequestID  ?? 'test-merchant-id',
      CheckoutRequestID:   overrides.CheckoutRequestID  ?? 'test-checkout-id',
      ResponseCode:        overrides.ResponseCode        ?? '0',
      ResponseDescription: overrides.ResponseDescription ?? 'Success. Request accepted for processing',
      CustomerMessage:     overrides.CustomerMessage     ?? 'Success. Request accepted for processing',
    });
}

// ─── Module-scope state ───────────────────────────────────────────────────────

let school;
let authToken;
let testClass;
let testTerm;
let testStudent;
let testInvoice;

/* -------------------------------------------------------------------------- */
/*                               GLOBAL SETUP                                 */
/* -------------------------------------------------------------------------- */

beforeAll(async () => {
  // Root tenant — cascade-deletes everything on teardown
  school = await createTestSchool(SCHOOL_SLUG, { name: 'M-Pesa Test School' });

  // Admin user
  await createTestUser(
    school.id,
    'mpesaadmin',
    'mpesa@test.com',
    'mpesa123',
    'ADMIN'
  );

  authToken = await getAuthToken(app, 'mpesaadmin', 'mpesa123');

  testClass = await createTestClass(school.id, 'MPESA_CLASS', 6);

  testTerm = await createTestTerm(
    school.id,
    2025,
    1,
    '2025-01-01',
    '2025-04-30'
  );

  testStudent = await createTestStudent(
    school.id,
    'MPESA_STUDENT_001',
    'Mpesa',
    'Student',
    testClass.id
  );

  // Parent contact — scoped via student_id which is already school-scoped
  await db.query(
    `DELETE FROM parent_contacts
     WHERE student_id = $1 AND phone = $2`,
    [testStudent.id, '254712345678']
  );
  await db.query(
    `INSERT INTO parent_contacts
       (school_id, student_id, relationship, name, phone, is_primary)
     VALUES ($1, $2, 'FATHER', 'Test Parent', '254712345678', TRUE)`,
    [school.id, testStudent.id]
  );

  testInvoice = await createTestInvoice(
    school.id,
    testStudent.id,
    testTerm.id,
    15000,
    [
      { description: 'Tuition Fee', amount: 15000 },
    ]
  );
});

/* -------------------------------------------------------------------------- */
/*                             TRANSACTION LIST                                */
/* -------------------------------------------------------------------------- */

describe('GET /api/v1/mpesa/transactions', () => {
  test('returns paginated transactions', async () => {
    const res = await request(app)
      .get('/api/v1/mpesa/transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .get('/api/v1/mpesa/transactions');

    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                           STK PUSH INITIATION                              */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/mpesa/stk-push', () => {
  test('should initiate STK push for a valid invoice', async () => {
    // FIX: mock BOTH the OAuth token call AND the STK push call.
    // Previously only the STK push endpoint was intercepted, causing nock to
    // throw "No match for request" when MpesaClient fetched the OAuth token.
    mockStkPush();

    const res = await request(app)
      .post('/api/v1/mpesa/stk-push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        invoice_id:   testInvoice.id,
        phone_number: '254712345678',
        amount:       15000,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should fail without required fields', async () => {
    const res = await request(app)
      .post('/api/v1/mpesa/stk-push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({}); // missing all required fields

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('should fail with non-existent invoice', async () => {
    const res = await request(app)
      .post('/api/v1/mpesa/stk-push')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        invoice_id:   999999,
        phone_number: '254712345678',
        amount:       15000,
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/mpesa/stk-push')
      .send({
        invoice_id:   testInvoice.id,
        phone_number: '254712345678',
        amount:       15000,
      });

    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                              STK CALLBACK                                  */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/mpesa/callback', () => {
  // Insert a real pending transaction first so processCallback can recover the
  // school_id from it (Safaricom callbacks carry no auth token).
  beforeAll(async () => {
    await db.schoolTransaction(school.id, async (client) => {
      // Clean up any prior row with this checkout ID
      await client.query(
        'DELETE FROM mpesa_transactions WHERE transaction_id = $1',
        ['test-checkout-id']
      );
      await client.query(
        `INSERT INTO mpesa_transactions
           (transaction_id, phone_number, amount, account_reference,
            transaction_date, status, school_id, callback_data)
         VALUES ($1, '254712345678', 15000, $2, NOW(), 'PENDING', $3, '{}')`,
        ['test-checkout-id', testStudent.admission_no, school.id]
      );
    });
  });

  test('should handle a successful STK callback', async () => {
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test-merchant-id',
          CheckoutRequestID: 'test-checkout-id',
          ResultCode:        0,
          ResultDesc:        'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount',             Value: 15000 },
              { Name: 'MpesaReceiptNumber', Value: 'LGR7IRYF3K' },
              { Name: 'TransactionDate',    Value: 20250115120000 },
              { Name: 'PhoneNumber',        Value: 254712345678 },
            ],
          },
        },
      },
    };

    const res = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(callbackPayload);

    // Callbacks are unauthenticated (called by Safaricom)
    expect(res.status).toBe(200);
  });

  test('should handle a failed STK callback gracefully', async () => {
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: 'test-merchant-id-failed',
          CheckoutRequestID: 'test-checkout-id-failed',
          ResultCode:        1032,
          ResultDesc:        'Request cancelled by user.',
        },
      },
    };

    const res = await request(app)
      .post('/api/v1/mpesa/callback')
      .send(callbackPayload);

    expect(res.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/*                         MANUAL RECONCILIATION                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/v1/mpesa/reconcile', () => {
  test('should fail without admin authorization', async () => {
    await createTestUser(
      school.id,
      'mpesateacher',
      'mpesateacher@test.com',
      'teacher123',
      'TEACHER'
    );
    const teacherToken = await getAuthToken(app, 'mpesateacher', 'teacher123');

    const res = await request(app)
      .post('/api/v1/mpesa/reconcile')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ receipt_number: 'LGR7IRYF3K' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('should fail without authentication', async () => {
    const res = await request(app)
      .post('/api/v1/mpesa/reconcile')
      .send({ receipt_number: 'LGR7IRYF3K' });

    expect(res.status).toBe(401);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 CLEANUP                                    */
/* -------------------------------------------------------------------------- */

afterAll(async () => {
  nock.cleanAll();

  // Deleting the school cascades to all child records automatically
  await destroyTestSchool(SCHOOL_SLUG);
});