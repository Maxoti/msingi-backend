/**
 * fees.service.js
 *
 * Business logic for the fees module.
 * All operations are explicitly scoped to schoolId for multi-tenancy.
 *
 * Responsibilities:
 *  - Validate inputs and business rules before touching the DB.
 *  - Orchestrate multi-step operations inside transactions.
 *  - Never expose raw DB rows — shape responses for controllers.
 *  - Never catch errors: let them propagate to the controller error handler.
 */

'use strict';

const repo = require('./fees.repository');
const db   = require('../../shared/database/client');

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Create a single invoice for one student.
 * studentIdentifier may be a numeric DB id or an admission_no string.
 */
const createInvoice = async (studentIdentifier, termId, items, createdBy, schoolId) => {
  // Resolve student
  const isId     = Number.isInteger(studentIdentifier) ||
                   (typeof studentIdentifier === 'string' && /^\d+$/.test(studentIdentifier));
  const studentRow = isId
    ? await db.schoolQueryOne(schoolId, 'SELECT id FROM students WHERE id = $1',           [studentIdentifier])
    : await db.schoolQueryOne(schoolId, 'SELECT id FROM students WHERE admission_no = $1', [studentIdentifier]);

  if (!studentRow) throw new Error('Student not found');

  // Validate term
  const term = await db.schoolQueryOne(
    schoolId, 'SELECT id FROM academic_terms WHERE id = $1', [termId],
  );
  if (!term) throw new Error('Term not found');

  // Prevent duplicates
  const duplicate = await repo.findInvoiceByStudentAndTerm(schoolId, studentRow.id, termId);
  if (duplicate)  throw new Error('Invoice already exists for this student and term');

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one fee item is required');
  }

  const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.amount), 0);

  const invoice = await db.schoolTransaction(schoolId, async (client) => {
    const { rows: [newInvoice] } = await client.query(
      `INSERT INTO invoices (student_id, term_id, total_amount, status, school_id)
       VALUES ($1, $2, $3, 'UNPAID', $4)
       RETURNING *`,
      [studentRow.id, termId, totalAmount, schoolId],
    );

    // Bulk-insert line items in one query
    const placeholders = items.map((_, i) =>
      `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
    ).join(', ');

    const itemParams = items.flatMap(({ description, amount }) => [
      newInvoice.id, description, parseFloat(amount), schoolId,
    ]);

    await client.query(
      `INSERT INTO invoice_items (invoice_id, description, amount, school_id)
       VALUES ${placeholders}`,
      itemParams,
    );

    return newInvoice;
  });

  // Return full invoice with items and joins
  return repo.findInvoiceByIdWithItems(schoolId, invoice.id);
};

/**
 * Bulk-generate invoices for every student in a class for a given term.
 * Uses the fee structure defined for that class/term as line items.
 * Skips students who already have an invoice for the term.
 */
const generateInvoices = async ({ class_id, term_id }, schoolId) => {
  if (!class_id) throw new Error('class_id is required');
  if (!term_id)  throw new Error('term_id is required');

  const [term, classRow] = await Promise.all([
    db.schoolQueryOne(schoolId, 'SELECT id FROM academic_terms WHERE id = $1', [term_id]),
    db.schoolQueryOne(schoolId, 'SELECT id FROM classes WHERE id = $1',        [class_id]),
  ]);

  if (!term)     throw new Error('Term not found');
  if (!classRow) throw new Error('Class not found');

  const feeItems = await repo.findFeeStructureItems(schoolId, class_id, term_id);
  if (!feeItems?.length) {
    throw new Error(
      'No fee structure found for this class and term. Set up a fee structure first.',
    );
  }

  const students = await db.schoolQuery(
    schoolId, 'SELECT id FROM students WHERE class_id = $1 AND is_active = true', [class_id],
  );
  if (!students?.length) throw new Error('No active students found in this class');

  const totalAmount = feeItems.reduce((sum, item) => sum + parseFloat(item.amount), 0);

  let created = 0;
  let skipped = 0;
  const createdIds = [];

  for (const student of students) {
    const existing = await repo.findInvoiceByStudentAndTerm(schoolId, student.id, term_id);
    if (existing) { skipped++; continue; }

    const invoice = await db.schoolTransaction(schoolId, async (client) => {
      const { rows: [newInvoice] } = await client.query(
        `INSERT INTO invoices (student_id, term_id, total_amount, status, school_id)
         VALUES ($1, $2, $3, 'UNPAID', $4)
         RETURNING *`,
        [student.id, term_id, totalAmount, schoolId],
      );

      const placeholders = feeItems.map((_, i) =>
        `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
      ).join(', ');

      const itemParams = feeItems.flatMap(({ description, amount }) => [
        newInvoice.id, description, parseFloat(amount), schoolId,
      ]);

      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, school_id)
         VALUES ${placeholders}`,
        itemParams,
      );

      return newInvoice;
    });

    createdIds.push(invoice.id);
    created++;
  }

  return {
    summary: {
      total_students: students.length,
      created,
      skipped,
      total_amount: totalAmount.toFixed(2),
    },
    invoice_ids: createdIds,
  };
};

/**
 * Paginated invoice list with optional filters.
 */
const getInvoices = async (schoolId, filters) => {
  const { student_id, term_id, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const [invoices, totalCount] = await Promise.all([
    repo.findInvoicesWithFilters(schoolId, { student_id, term_id, status, limit, offset }),
    repo.countInvoices(schoolId,           { student_id, term_id, status }),
  ]);

  return {
    invoices,
    pagination: {
      page:       Number(page),
      limit:      Number(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext:    page * limit < totalCount,
      hasPrev:    page > 1,
    },
  };
};

const getInvoiceById = (schoolId, invoiceId) =>
  repo.findInvoiceByIdWithItems(schoolId, invoiceId);

const getStudentInvoices = (schoolId, studentId) =>
  repo.findInvoicesByStudent(schoolId, studentId);

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Record a payment against an invoice.
 * Validates that the payment does not exceed the remaining balance.
 */
const recordPayment = async (paymentData, schoolId) => {
  const {
    invoice_id, amount, payment_method,
    reference_number, payment_date, received_by,
  } = paymentData;

  const invoice = await repo.findInvoiceById(schoolId, invoice_id);
  if (!invoice) throw new Error('Invoice not found');

  if (invoice.status === 'PAID') {
    throw new Error('Invoice is already fully paid');
  }

  const paidSoFar = await repo.getTotalPaidAmount(schoolId, invoice_id);
  const remaining = parseFloat(invoice.total_amount) - paidSoFar;

  if (parseFloat(amount) <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }
  if (parseFloat(amount) > remaining) {
    throw new Error(
      `Payment amount exceeds remaining balance of ${remaining.toFixed(2)}`,
    );
  }

  const payment = await repo.createPayment(schoolId, {
    invoice_id, amount, payment_method,
    reference_number, payment_date, received_by,
  });

  return repo.findPaymentById(schoolId, payment.id);
};

/**
 * Paginated payment list with optional filters.
 */
const getPayments = async (schoolId, filters) => {
  const {
    invoice_id, payment_method, start_date, end_date,
    page = 1, limit = 20,
  } = filters;
  const offset = (page - 1) * limit;

  const [payments, totalCount] = await Promise.all([
    repo.findPaymentsWithFilters(schoolId, {
      invoice_id, payment_method, start_date, end_date, limit, offset,
    }),
    repo.countPayments(schoolId, {
      invoice_id, payment_method, start_date, end_date,
    }),
  ]);

  return {
    payments,
    pagination: {
      page:       Number(page),
      limit:      Number(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext:    page * limit < totalCount,
      hasPrev:    page > 1,
    },
  };
};

const getPaymentById = (schoolId, paymentId) =>
  repo.findPaymentById(schoolId, paymentId);

// ─── Student balance ──────────────────────────────────────────────────────────

const getStudentBalance = async (schoolId, studentId) => {
  const student = await db.schoolQueryOne(
    schoolId,
    'SELECT id, admission_no, first_name, last_name FROM students WHERE id = $1',
    [studentId],
  );
  if (!student) return null;

  const invoices    = await repo.getStudentBalanceSummary(schoolId, studentId);
  const totalBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount),     0);
  const totalPaid   = invoices.reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0);

  return {
    student: {
      id:           student.id,
      admission_no: student.admission_no,
      name:         `${student.first_name} ${student.last_name}`,
    },
    summary: {
      total_billed:  totalBilled.toFixed(2),
      total_paid:    totalPaid.toFixed(2),
      total_balance: (totalBilled - totalPaid).toFixed(2),
    },
    invoices,
  };
};

// ─── Fee structures ───────────────────────────────────────────────────────────

const getFeeStructures  = (schoolId, filters) => repo.findFeeStructures(schoolId, filters);
const createFeeStructure = (data, schoolId)   => repo.createFeeStructure(schoolId, data);

// ─── Reports ─────────────────────────────────────────────────────────────────

const getFeeCollectionSummary = (schoolId, filters) =>
  repo.getFeeCollectionSummary(schoolId, filters);

const getFeeDefaulters = (schoolId, filters) =>
  repo.getFeeDefaulters(schoolId, filters);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Invoices
  createInvoice,
  generateInvoices,   // renamed from generateInvoice — plural is accurate
  getInvoices,
  getInvoiceById,
  getStudentInvoices,

  // Payments
  recordPayment,
  getPayments,
  getPaymentById,

  // Balance
  getStudentBalance,

  // Fee structures
  getFeeStructures,
  createFeeStructure,

  // Reports
  getFeeCollectionSummary,
  getFeeDefaulters,
};