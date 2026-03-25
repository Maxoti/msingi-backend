'use strict';

/**
 * Fees API Integration Tests
 * Tests all endpoints for fees, invoices, and payments.
 *
 * MULTI-TENANT NOTES
 * ──────────────────
 * One dedicated school is created in the outer beforeAll and destroyed in
 * afterAll (cascade removes everything beneath it).
 * fee_structures uses DELETE→INSERT instead of ON CONFLICT because the
 * unique constraint (school_id, class_id, term_id, fee_type) may not exist
 * in all environments. Add it with:
 *   CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_structures_school_class_term_type
 *   ON fee_structures(school_id, class_id, term_id, fee_type);
 */

const request = require('supertest');
const app     = require('../../src/app');
const db      = require('../../src/shared/database/client');

const {
  createFullTestSetup,
  createTestTerm,
  createTestStudent,
  getAuthToken,
  destroyTestSchool,
} = require('../helpers/test-helpers');

// ─── Suite-wide constants ─────────────────────────────────────────────────────

const SCHOOL_SLUG = 'fees-test-school';

// ─── Suite-wide shared state ──────────────────────────────────────────────────

let schoolId;
let authToken;
let testStudent;
let testClass;
let testTerm;
let testInvoice;

// ─── Global setup / teardown ──────────────────────────────────────────────────

beforeAll(async () => {
  const setup = await createFullTestSetup({
    schoolSlug:         SCHOOL_SLUG,
    schoolName:         'Fees Test School',
    userPrefix:         'feesadmin',
    userPassword:       'FeesAdmin123!',
    userRole:           'ADMIN',
    className:          'Fees Test Class',
    gradeLevel:         6,
    studentAdmissionNo: `FEE_TEST_${Date.now()}`,
    invoiceAmount:      15000,
    year:               2025,
    term:               1,
  });

  schoolId    = setup.school.id;
  testClass   = setup.class;
  testTerm    = setup.term;
  testStudent = setup.student;
  testInvoice = setup.invoice;

  authToken = await getAuthToken(app, 'feesadmin', 'FeesAdmin123!');

  // Seed fee structure — DELETE first so re-runs are idempotent and we
  // don't depend on an ON CONFLICT constraint existing.
  await db.query(
    `DELETE FROM fee_structures
     WHERE school_id = $1 AND class_id = $2 AND term_id = $3 AND fee_type = 'TUITION'`,
    [schoolId, testClass.id, testTerm.id]
  );
  await db.query(
    `INSERT INTO fee_structures (school_id, class_id, term_id, fee_type, amount)
     VALUES ($1, $2, $3, 'TUITION', 15000)`,
    [schoolId, testClass.id, testTerm.id]
  );
});

afterAll(async () => {
  await destroyTestSchool(SCHOOL_SLUG);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Fees API Tests', () => {

  // ══════════════════════════════════════════════════════════════════════════
  // INVOICES
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/v1/fees/invoices - Create Invoice', () => {
    // freshStudent has no invoice so we can test the happy-path creation
    let freshStudent;

    beforeAll(async () => {
      freshStudent = await createTestStudent(
        schoolId,
        `FEE_FRESH_${Date.now()}`,
        'Fresh', 'Student',
        testClass.id
      );
    });

    test('should create invoice for student', async () => {
      const response = await request(app)
        .post('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          student_id:   freshStudent.id,
          term_id:      testTerm.id,
          total_amount: 15000,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.total_amount).toBe('15000.00');
      expect(response.body.data.status).toBe('UNPAID');
    });

    test('should fail to create duplicate invoice for same student and term', async () => {
      // freshStudent already has an invoice from the previous test
      const response = await request(app)
        .post('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          student_id:   freshStudent.id,
          term_id:      testTerm.id,
          total_amount: 15000,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/already exists/i);
    });

    test('should fail with invalid student', async () => {
      const response = await request(app)
        .post('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          student_id:   99999999,
          term_id:      testTerm.id,
          total_amount: 15000,
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('should fail with negative amount', async () => {
      const response = await request(app)
        .post('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          student_id:   freshStudent.id,
          term_id:      testTerm.id,
          total_amount: -5000,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/fees/invoices')
        .send({
          student_id:   freshStudent.id,
          term_id:      testTerm.id,
          total_amount: 15000,
        });

      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fees/invoices - List Invoices', () => {
    test('should get all invoices with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.pagination).toBeDefined();
    });

    test('should filter invoices by student', async () => {
      const response = await request(app)
        .get('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ student_id: testStudent.id });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should filter invoices by term', async () => {
      const response = await request(app)
        .get('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ term_id: testTerm.id });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should filter invoices by status', async () => {
      const response = await request(app)
        .get('/api/v1/fees/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'UNPAID' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/fees/invoices');
      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fees/invoices/:id - Get Single Invoice', () => {
    test('should get invoice by id', async () => {
      const response = await request(app)
        .get(`/api/v1/fees/invoices/${testInvoice.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testInvoice.id);
      expect(response.body.data).toHaveProperty('student_name');
      expect(response.body.data).toHaveProperty('admission_no');
      expect(response.body.data.paid_amount).toBeDefined();
    });

    test('should return 404 for non-existent invoice', async () => {
      const response = await request(app)
        .get('/api/v1/fees/invoices/99999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fees/invoices/student/:studentId - Get Student Invoices', () => {
    test('should get all invoices for a student', async () => {
      const response = await request(app)
        .get(`/api/v1/fees/invoices/student/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should return empty array for student with no invoices', async () => {
      const noInvoiceStudent = await createTestStudent(
        schoolId,
        `NO_INV_${Date.now()}`,
        'No', 'Invoice',
        testClass.id
      );

      const response = await request(app)
        .get(`/api/v1/fees/invoices/student/${noInvoiceStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAYMENTS
  // Note: these tests run sequentially and build on each other.
  // Test 1 pays 5000 → status becomes PARTIAL
  // Test 2 pays 10000 → status becomes PAID (5000 + 10000 = 15000 total)
  // ══════════════════════════════════════════════════════════════════════════

  describe('POST /api/v1/fees/payments - Record Payment', () => {
    test('should record partial payment for invoice', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:       testInvoice.id,
          amount:           5000,
          payment_date:     '2025-01-25',
          payment_method:   'MPESA',
          reference_number: 'TEST_MPESA_123',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.amount).toBe('5000.00');
      expect(response.body.data.payment_method).toBe('MPESA');

      const updatedInvoice = await db.queryOne(
        'SELECT status FROM invoices WHERE id = $1',
        [testInvoice.id]
      );
      expect(updatedInvoice.status).toBe('PARTIAL');
    });

    test('should update invoice to PAID when fully paid', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:     testInvoice.id,
          amount:         10000,
          payment_date:   '2025-01-26',
          payment_method: 'CASH',
        });

      expect(response.status).toBe(201);

      const updatedInvoice = await db.queryOne(
        'SELECT status FROM invoices WHERE id = $1',
        [testInvoice.id]
      );
      expect(updatedInvoice.status).toBe('PAID');
    });

    test('should fail with invalid invoice id', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:     99999999,
          amount:         5000,
          payment_date:   '2025-01-25',
          payment_method: 'CASH',
        });

      expect(response.status).toBe(404);
    });

    test('should fail with zero amount', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:     testInvoice.id,
          amount:         0,
          payment_date:   '2025-01-25',
          payment_method: 'CASH',
        });

      expect(response.status).toBe(400);
    });

    test('should fail with negative amount', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:     testInvoice.id,
          amount:         -500,
          payment_date:   '2025-01-25',
          payment_method: 'CASH',
        });

      expect(response.status).toBe(400);
    });

    test('should fail with invalid payment method', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          invoice_id:     testInvoice.id,
          amount:         1000,
          payment_date:   '2025-01-25',
          payment_method: 'INVALID_METHOD',
        });

      expect(response.status).toBe(400);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/fees/payments')
        .send({
          invoice_id:     testInvoice.id,
          amount:         5000,
          payment_date:   '2025-01-25',
          payment_method: 'CASH',
        });

      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fees/payments - List Payments', () => {
    test('should get all payments with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should filter payments by invoice', async () => {
      const response = await request(app)
        .get('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ invoice_id: testInvoice.id });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      // 2 payments recorded in the payment tests above (5000 + 10000)
      expect(response.body.data.length).toBe(2);
    });

    test('should filter payments by method', async () => {
      const response = await request(app)
        .get('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ payment_method: 'MPESA' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should filter payments by date range', async () => {
      const response = await request(app)
        .get('/api/v1/fees/payments')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ from_date: '2025-01-01', to_date: '2025-01-31' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/fees/payments');
      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('GET /api/v1/fees/payments/:id - Get Single Payment', () => {
    // Fetched after the payment tests have run, so at least one row exists
    let testPayment;

    beforeAll(async () => {
      testPayment = await db.queryOne(
        'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY id LIMIT 1',
        [testInvoice.id]
      );
    });

    test('should get payment by id', async () => {
      // Guard: if no payment exists yet (test ordering issue) skip gracefully
      if (!testPayment) {
        console.warn('No payment found for testInvoice — skipping');
        return;
      }

      const response = await request(app)
        .get(`/api/v1/fees/payments/${testPayment.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testPayment.id);
    });

    test('should return 404 for non-existent payment', async () => {
      const response = await request(app)
        .get('/api/v1/fees/payments/99999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // BALANCE
  // By this point testInvoice has been fully paid (5000 + 10000 = 15000)
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/v1/fees/balance/:studentId - Get Student Fee Balance', () => {
    test('should get student fee balance summary', async () => {
      const response = await request(app)
        .get(`/api/v1/fees/balance/${testStudent.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_amount');
      expect(response.body.data).toHaveProperty('paid_amount');
      expect(response.body.data).toHaveProperty('balance');
      expect(response.body.data.total_amount).toBe('15000.00');
      expect(response.body.data.paid_amount).toBe('15000.00');
      expect(response.body.data.balance).toBe('0.00');
    });

    test('should return 404 for non-existent student', async () => {
      const response = await request(app)
        .get('/api/v1/fees/balance/99999999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // FEE STRUCTURES
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/v1/fees/fee-structures - Get Fee Structures', () => {
    test('should get all fee structures', async () => {
      const response = await request(app)
        .get('/api/v1/fees/fee-structures')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    test('should filter by class', async () => {
      const response = await request(app)
        .get('/api/v1/fees/fee-structures')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ class_id: testClass.id });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should filter by term', async () => {
      const response = await request(app)
        .get('/api/v1/fees/fee-structures')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ term_id: testTerm.id });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/fees/fee-structures');
      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────

  describe('POST /api/v1/fees/fee-structures - Create Fee Structure', () => {
    test('should create fee structure for a different term', async () => {
      // Term 2 — doesn't conflict with the Term 1 structure seeded in beforeAll
      const term2 = await createTestTerm(
        schoolId, 2025, 2, '2025-04-27', '2025-07-31'
      );

      const response = await request(app)
        .post('/api/v1/fees/fee-structures')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          class_id: testClass.id,
          term_id:  term2.id,
          fee_type: 'TUITION',
          amount:   18000,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.amount).toBe('18000.00');
      // term2 is under the test school — destroyTestSchool cascades it away
    });

    test('should fail with duplicate fee structure', async () => {
      // Term 1 TUITION already exists from beforeAll seed
      const response = await request(app)
        .post('/api/v1/fees/fee-structures')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          class_id: testClass.id,
          term_id:  testTerm.id,
          fee_type: 'TUITION',
          amount:   20000,
        });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/already exists/i);
    });

    test('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/fees/fee-structures')
        .send({
          class_id: testClass.id,
          term_id:  testTerm.id,
          fee_type: 'ACTIVITIES',
          amount:   2000,
        });

      expect(response.status).toBe(401);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ══════════════════════════════════════════════════════════════════════════

  describe('GET /api/v1/fees/reports/summary - Fee Summary Report', () => {
    test('should get fee collection summary', async () => {
      const response = await request(app)
        .get('/api/v1/fees/reports/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ term_id: testTerm.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_billed');
      expect(response.body.data).toHaveProperty('total_collected');
      expect(response.body.data).toHaveProperty('total_outstanding');
    });

    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/fees/reports/summary');
      expect(response.status).toBe(401);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  test('should get list of fee defaulters', async () => {
  // Create defaulter student
  const defaulter = await createTestStudent(
    schoolId,
    `DEFAULTER_${Date.now()}`,
    'Fee', 'Defaulter',
    testClass.id
  );

  console.log('[DEBUG] defaulter.id:', defaulter?.id, 'schoolId:', schoolId, 'testTerm.id:', testTerm?.id);

  // Use the API to create the invoice — avoids direct DB insert issues
  const invoiceRes = await request(app)
    .post('/api/v1/fees/invoices')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      student_id:   defaulter.id,
      term_id:      testTerm.id,
      total_amount: 20000,
      description:  'Test defaulter invoice',
    });

  console.log('[DEBUG] invoice create response:', JSON.stringify(invoiceRes.body));

  // Invoice must exist before we can test defaulters
  expect([200, 201]).toContain(invoiceRes.status);

  const response = await request(app)
    .get('/api/v1/fees/reports/defaulters')
    .set('Authorization', `Bearer ${authToken}`)
    .query({ term_id: testTerm.id });

  console.log('[DEBUG] defaulters response:', JSON.stringify(response.body, null, 2));

  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toBeInstanceOf(Array);
  expect(response.body.data.length).toBeGreaterThanOrEqual(1);

  const first = response.body.data[0];
  expect(first).toHaveProperty('student_id');
  expect(first).toHaveProperty('balance');
});


    test('should fail without authentication', async () => {
      const response = await request(app).get('/api/v1/fees/reports/defaulters');
      expect(response.status).toBe(401);
    });
  });

