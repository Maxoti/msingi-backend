/**
 * M-Pesa Payment Flow Integration Test
 * Tests the complete payment flow from initiation to reconciliation
 *
 * CHANGES FROM ORIGINAL
 * ─────────────────────
 * • Replaced broken ON CONFLICT (username) upsert with createTestUser() from
 *   test-helpers. The users table only has a composite unique index on
 *   (school_id, username), so single-column ON CONFLICT always throws.
 * • All fixtures now belong to a dedicated test school (created in beforeAll,
 *   cascade-deleted in afterAll via destroyTestSchool).
 * • school_id is passed explicitly on every direct INSERT so the
 *   stamp_school_id trigger — which reads from JWT, absent in tests — is
 *   never invoked.
 * • All test logic, nock mocks, service calls, and assertions are preserved
 *   exactly as in the original file.
 */

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
} = require('../helpers/test-helpers');

// ─── Shared fixtures ──────────────────────────────────────────────────────────

// Use a timestamp-suffixed slug so parallel runs don't collide.
const SCHOOL_SLUG = `mpesa-flow-${Date.now()}`;

let school;
let adminUser;
let testClass;
let testStudent;
let testParentContact;
let testInvoice;
let activeTerm;
let authToken;

describe('M-Pesa Payment Flow Integration Tests', () => {

  beforeAll(async () => {
    // 1. Root tenant
    school = await createTestSchool(SCHOOL_SLUG, { name: 'M-Pesa Flow Test School' });

    // 2. Admin user — DELETE → INSERT scoped by school_id (no ON CONFLICT needed)
    adminUser = await createTestUser(
      school.id,
      'flowadmin',
      'flowadmin@test.com',
      'adminpass',
      'ADMIN'
    );

    // 3. Auth token
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'flowadmin', password: 'adminpass' });

    authToken = login.body.data?.token;
    console.log('🔐 Auth token obtained:', authToken ? 'Yes' : 'No');
    console.log('👤 Admin user ID:', adminUser.id);

    // 4. Academic term
    activeTerm = await createTestTerm(
      school.id, 2025, 1, '2025-01-01', '2025-04-30'
    );

    // 5. Class
    const uniqueClassName = `FLOW_TEST_CLASS_${Date.now()}`;
    testClass = await createTestClass(school.id, uniqueClassName, 6);

    // 6. Student
    const uniqueAdmissionNo = `FLOW_TEST_${Date.now()}`;
    testStudent = await createTestStudent(
      school.id,
      uniqueAdmissionNo,
      'Flow',
      'Test',
      testClass.id,
      { gender: 'MALE', dateOfBirth: '2010-01-01' }
    );

    // 7. Parent contact (idempotent)
    const existingParent = await db.queryOne(
      `SELECT * FROM parent_contacts WHERE student_id = $1 AND phone = $2`,
      [testStudent.id, '254712345678']
    );

    if (!existingParent) {
      testParentContact = await db.queryOne(
        `INSERT INTO parent_contacts (school_id, student_id, relationship, name, phone, is_primary)
         VALUES ($1, $2, 'FATHER', 'Test Parent', '254712345678', TRUE)
         RETURNING *`,
        [school.id, testStudent.id]
      );
    } else {
      testParentContact = existingParent;
    }

    // 8. Invoice
    testInvoice = await db.queryOne(
      `INSERT INTO invoices (school_id, student_id, term_id, total_amount, status)
       VALUES ($1, $2, $3, 20000, 'UNPAID')
       RETURNING *`,
      [school.id, testStudent.id, activeTerm.id]
    );

    // 9. Remove any stale test-prefixed transactions from a prior run
    await db.query(
      `DELETE FROM mpesa_transactions WHERE school_id = $1 AND transaction_id LIKE 'test-%'`,
      [school.id]
    );

    console.log('✅ Test setup complete');
  });

  afterAll(async () => {
    // Cascade-delete the entire school — all child rows go with it automatically.
    await destroyTestSchool(SCHOOL_SLUG);
    if (db.close) await db.close();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  // ── 1. STK Push Initiation ──────────────────────────────────────────────────

  describe('1. STK Push Initiation', () => {
    test('should successfully initiate STK push for valid student', async () => {
      const uniqueCheckoutId = `test-checkout-${Date.now()}`;
      const uniqueMerchantId = `test-merchant-${Date.now()}`;

      nock('https://sandbox.safaricom.co.ke')
        .get('/oauth/v1/generate?grant_type=client_credentials')
        .reply(200, {
          access_token: 'test_access_token_12345',
          expires_in:   '3599',
        });

      nock('https://sandbox.safaricom.co.ke')
        .post('/mpesa/stkpush/v1/processrequest')
        .reply(200, {
          MerchantRequestID:   uniqueMerchantId,
          CheckoutRequestID:   uniqueCheckoutId,
          ResponseCode:        '0',
          ResponseDescription: 'Success. Request accepted for processing',
          CustomerMessage:     'Success. Request accepted for processing',
        });

      const response = await request(app)
        .post('/api/v1/mpesa/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          admissionNo: testStudent.admission_no,
          phoneNumber: '254712345678',
          amount:      5000,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.checkoutRequestId).toBe(uniqueCheckoutId);
      expect(response.body.message).toContain('Please enter M-Pesa PIN');
    });

    test('should reject invalid admission number', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          admissionNo: 'INVALID999',
          phoneNumber: '254712345678',
          amount:      5000,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Student not found');
    });

    test('should reject invalid phone number', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          admissionNo: testStudent.admission_no,
          phoneNumber: '123',
          amount:      5000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid phone number');
    });

    test('should reject amount below 1 KES', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          admissionNo: testStudent.admission_no,
          phoneNumber: '254712345678',
          amount:      0.5,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(
        response.body.error.includes('Amount must be between') ||
        response.body.error.includes('admissionNo')
      ).toBe(true);
    });

    test('should reject amount above 300,000 KES', async () => {
      const response = await request(app)
        .post('/api/v1/mpesa/initiate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          admissionNo: testStudent.admission_no,
          phoneNumber: '254712345678',
          amount:      350000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ── 2. Callback Processing ──────────────────────────────────────────────────

  describe('2. M-Pesa Callback Processing', () => {
    test('should process successful payment callback', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: `test-merchant-${Date.now()}`,
              CheckoutRequestID: `test-checkout-${Date.now()}`,
              ResultCode:        0,
              ResultDesc:        'The service request is processed successfully.',
              CallbackMetadata:  {
                Item: [
                  { Name: 'Amount',             Value: 5000               },
                  { Name: 'MpesaReceiptNumber', Value: `QGH${Date.now()}` },
                  { Name: 'TransactionDate',    Value: 20250125143045     },
                  { Name: 'PhoneNumber',        Value: 254712345678       },
                ],
              },
            },
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.ResultCode).toBe(0);
    });

    test('should handle failed payment callback', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/mpesa/callback')
        .send({
          Body: {
            stkCallback: {
              MerchantRequestID: `test-merchant-${Date.now()}`,
              CheckoutRequestID: `test-checkout-${Date.now()}`,
              ResultCode:        1032,
              ResultDesc:        'Request cancelled by user',
            },
          },
        });

      expect(response.status).toBe(200);
    });
  });

  // ── 3. Auto-Reconciliation ──────────────────────────────────────────────────

  describe('3. Auto-Reconciliation', () => {
    test('should auto-reconcile payment to student invoice', async () => {
      const transaction = await db.queryOne(
        `INSERT INTO mpesa_transactions (
           school_id, transaction_id, phone_number, amount, mpesa_receipt_number,
           transaction_date, status, account_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          school.id,
          `AUTO_TEST_${Date.now()}`,
          testParentContact.phone,
          5000,
          `AUTO_QGH_${Date.now()}`,
          new Date(),
          'COMPLETED',
          testStudent.admission_no,
        ]
      );

      const mpesaService = require('../../src/shared/integrations/mpesa/mpesa.service');
      const result = await mpesaService.autoReconcile(transaction.id);

      expect(result).toBeTruthy();
      expect(result.payment).toBeTruthy();
      expect(parseFloat(result.payment.amount)).toBe(5000);
      expect(result.payment.invoice_id).toBe(testInvoice.id);

      await db.query('DELETE FROM payments           WHERE id = $1', [result.payment.id]);
      await db.query('DELETE FROM mpesa_transactions WHERE id = $1', [transaction.id]);
    });

    test('should not auto-reconcile if student not found', async () => {
      const transaction = await db.queryOne(
        `INSERT INTO mpesa_transactions (
           school_id, transaction_id, phone_number, amount, mpesa_receipt_number,
           transaction_date, status, account_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          school.id,
          `UNKNOWN_${Date.now()}`,
          '254799999999',
          5000,
          `UNKNOWN_QGH_${Date.now()}`,
          new Date(),
          'COMPLETED',
          'UNKNOWN_STUDENT',
        ]
      );

      const mpesaService = require('../../src/shared/integrations/mpesa/mpesa.service');
      const payment = await mpesaService.autoReconcile(transaction.id);

      expect(payment).toBeNull();

      await db.query('DELETE FROM mpesa_transactions WHERE id = $1', [transaction.id]);
    });
  });

  // ── 4. Invoice Status Updates ───────────────────────────────────────────────

  describe('4. Invoice Status Updates', () => {
    test('should update invoice to PARTIAL after partial payment', async () => {
      const payment = await db.queryOne(
        `INSERT INTO payments (school_id, invoice_id, amount, payment_date, payment_method, received_by)
         VALUES ($1, $2, 5000, NOW(), 'MPESA', $3)
         RETURNING *`,
        [school.id, testInvoice.id, adminUser.id]
      );

      const invoice = await db.queryOne(
        'SELECT * FROM invoices WHERE id = $1',
        [testInvoice.id]
      );

      expect(invoice.status).toBe('PARTIAL');

      await db.query('DELETE FROM payments WHERE id = $1', [payment.id]);
    });

    test('should update invoice to PAID after full payment', async () => {
      const payment = await db.queryOne(
        `INSERT INTO payments (school_id, invoice_id, amount, payment_date, payment_method, received_by)
         VALUES ($1, $2, 20000, NOW(), 'MPESA', $3)
         RETURNING *`,
        [school.id, testInvoice.id, adminUser.id]
      );

      const invoice = await db.queryOne(
        'SELECT * FROM invoices WHERE id = $1',
        [testInvoice.id]
      );

      expect(invoice.status).toBe('PAID');

      await db.query('DELETE FROM payments WHERE id = $1', [payment.id]);
    });
  });

 // ── 5. Manual Reconciliation ────────────────────────────────────────────────

  describe('5. Manual Reconciliation', () => {
    test('should manually reconcile pending transaction', async () => {
      const transaction = await db.queryOne(
        `INSERT INTO mpesa_transactions (
           school_id, transaction_id, phone_number, amount, mpesa_receipt_number,
           transaction_date, status, account_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          school.id,
          `MANUAL_${Date.now()}`,
          '254700000000',
          3000,
          `MANUAL_QGH_${Date.now()}`,
          new Date(),
          'COMPLETED',
          testStudent.admission_no,
        ]
      );

      const mpesaService = require('../../src/shared/integrations/mpesa/mpesa.service');
      const result = await mpesaService.manualReconcile(
        transaction.id,
        testInvoice.id,
        adminUser.id,
        school.id   // ← was missing
      );

      expect(result.payment).toBeTruthy();
      expect(parseFloat(result.payment.amount)).toBe(3000);

      await db.query('DELETE FROM payments           WHERE id = $1', [result.payment.id]);
      await db.query('DELETE FROM mpesa_transactions WHERE id = $1', [transaction.id]);
    });
  });

  // ── 6. Get Pending Transactions ─────────────────────────────────────────────

  describe('6. Get Pending Transactions', () => {
    test('should retrieve all pending transactions', async () => {
      const transaction = await db.queryOne(
        `INSERT INTO mpesa_transactions (
           school_id, transaction_id, phone_number, amount, mpesa_receipt_number,
           transaction_date, status, account_reference
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          school.id,
          `PENDING_${Date.now()}`,
          '254711111111',
          2000,
          `PENDING_QGH_${Date.now()}`,
          new Date(),
          'COMPLETED',
          'PENDING_STUDENT',
        ]
      );

      const mpesaService = require('../../src/shared/integrations/mpesa/mpesa.service');
      const pending = await mpesaService.getPendingTransactions(
        school.id   // ← was missing
      );

      expect(pending.length).toBeGreaterThan(0);
      const found = pending.find(t => t.id === transaction.id);
      expect(found).toBeTruthy();

      await db.query('DELETE FROM mpesa_transactions WHERE id = $1', [transaction.id]);
    });
  });
  });

