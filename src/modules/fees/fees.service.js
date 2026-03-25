/**
 * Fees Service
 * schoolId threaded through every operation for multi-tenancy
 */

'use strict';

const feesRepository = require('./fees.repository');
const db = require('../../shared/database/client');

const createInvoice = async (studentIdentifier, term_id, items, created_by, schoolId) => {
  const isNumericId = Number.isInteger(studentIdentifier) ||
    (typeof studentIdentifier === 'string' && /^\d+$/.test(studentIdentifier));

  const studentRow = isNumericId
    ? await db.schoolQueryOne(schoolId, 'SELECT id FROM students WHERE id = $1', [studentIdentifier])
    : await db.schoolQueryOne(schoolId, 'SELECT id FROM students WHERE admission_no = $1', [studentIdentifier]);

  if (!studentRow) throw new Error('Student not found');
  const student_id = studentRow.id;

  const term = await db.schoolQueryOne(schoolId, 'SELECT id FROM academic_terms WHERE id = $1', [term_id]);
  if (!term) throw new Error('Term not found');

  const existing = await feesRepository.findInvoiceByStudentAndTerm(schoolId, student_id, term_id);
  if (existing) throw new Error('Invoice already exists for this student and term');

  const total_amount = items.reduce((sum, item) => sum + parseFloat(item.amount), 0);

  const invoice = await db.schoolTransaction(schoolId, async (client) => {
    const { rows: [newInvoice] } = await client.query(
      `INSERT INTO invoices (student_id, term_id, total_amount, status, school_id)
       VALUES ($1,$2,$3,'UNPAID',$4) RETURNING *`,
      [student_id, term_id, total_amount, schoolId]
    );

    if (items.length > 0) {
      const placeholders = items.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(', ');
      const itemParams   = items.flatMap(({ description, amount }) => [newInvoice.id, description, parseFloat(amount), schoolId]);
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, school_id) VALUES ${placeholders}`,
        itemParams
      );
    }
    return newInvoice;
  });

  return feesRepository.findInvoiceByIdWithItems(schoolId, invoice.id);
};

/**
 * generateInvoice
 * Bulk-generates invoices for all students in a class for a given term,
 * using the fee structure items defined for that class/term.
 *
 * Body: { class_id, term_id, created_by }
 *
 * - Skips students who already have an invoice for the term
 * - Returns a summary: how many created, how many skipped
 */
const generateInvoice = async (data, schoolId) => {
  const { class_id, term_id, created_by } = data;

  if (!class_id)  throw new Error('class_id is required');
  if (!term_id)   throw new Error('term_id is required');

  // Validate term exists
  const term = await db.schoolQueryOne(
    schoolId,
    'SELECT id FROM academic_terms WHERE id = $1',
    [term_id]
  );
  if (!term) throw new Error('Term not found');

  // Validate class exists
  const classRow = await db.schoolQueryOne(
    schoolId,
    'SELECT id FROM classes WHERE id = $1',
    [class_id]
  );
  if (!classRow) throw new Error('Class not found');

  // Get fee structure items for this class + term
  const feeItems = await feesRepository.findFeeStructureItems(schoolId, class_id, term_id);
  if (!feeItems || feeItems.length === 0)
    throw new Error('No fee structure found for this class and term. Set up a fee structure first.');

  const total_amount = feeItems.reduce((sum, item) => sum + parseFloat(item.amount), 0);

  // Get all active students in the class
  const students = await db.schoolQuery(
    schoolId,
    `SELECT id FROM students WHERE class_id = $1`,
    [class_id]
  );
  if (!students || students.length === 0)
    throw new Error('No active students found in this class');

  let created = 0;
  let skipped = 0;
  const createdInvoices = [];

  for (const student of students) {
    // Skip if invoice already exists for this student + term
    const existing = await feesRepository.findInvoiceByStudentAndTerm(schoolId, student.id, term_id);
    if (existing) { skipped++; continue; }

    const invoice = await db.schoolTransaction(schoolId, async (client) => {
      const { rows: [newInvoice] } = await client.query(
        `INSERT INTO invoices (student_id, term_id, total_amount, status, school_id)
         VALUES ($1,$2,$3,'UNPAID',$4) RETURNING *`,
        [student.id, term_id, total_amount, schoolId]
      );

      const placeholders = feeItems.map((_, i) => `($${i*4+1},$${i*4+2},$${i*4+3},$${i*4+4})`).join(', ');
      const itemParams   = feeItems.flatMap(({ description, amount }) => [
        newInvoice.id, description, parseFloat(amount), schoolId,
      ]);
      await client.query(
        `INSERT INTO invoice_items (invoice_id, description, amount, school_id) VALUES ${placeholders}`,
        itemParams
      );

      return newInvoice;
    });

    createdInvoices.push(invoice.id);
    created++;
  }

  return {
    summary: {
      total_students: students.length,
      created,
      skipped,
      total_amount: total_amount.toFixed(2),
    },
    invoice_ids: createdInvoices,
  };
};

const getInvoices = async (schoolId, filters) => {
  const { student_id, term_id, status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const [invoices, totalCount] = await Promise.all([
    feesRepository.findInvoicesWithFilters(schoolId, { student_id, term_id, status, limit, offset }),
    feesRepository.countInvoices(schoolId, { student_id, term_id, status }),
  ]);

  return {
    invoices,
    pagination: {
      page, limit, totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page * limit < totalCount,
      hasPrev: page > 1,
    },
  };
};

const getInvoiceById = async (schoolId, invoiceId) =>
  feesRepository.findInvoiceByIdWithItems(schoolId, invoiceId);

const getStudentInvoices = async (schoolId, studentId) =>
  feesRepository.findInvoicesByStudent(schoolId, studentId);

const recordPayment = async (paymentData, schoolId) => {
  const { invoice_id, amount, payment_method, reference_number, payment_date, received_by } = paymentData;

  const invoice = await feesRepository.findInvoiceById(schoolId, invoice_id);
  if (!invoice) throw new Error('Invoice not found');

  const paidSoFar = await feesRepository.getTotalPaidAmount(schoolId, invoice_id);
  const remaining = parseFloat(invoice.total_amount) - paidSoFar;

  if (parseFloat(amount) > remaining)
    throw new Error(`Payment amount exceeds remaining balance of ${remaining.toFixed(2)}`);

  const payment = await feesRepository.createPayment(schoolId,
    { invoice_id, amount, payment_method, reference_number, payment_date, received_by }
  );

  return feesRepository.findPaymentById(schoolId, payment.id);
};

const getPayments = async (schoolId, filters) => {
  const { invoice_id, payment_method, start_date, end_date, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const [payments, totalCount] = await Promise.all([
    feesRepository.findPaymentsWithFilters(schoolId, { invoice_id, payment_method, start_date, end_date, limit, offset }),
    feesRepository.countPayments(schoolId, { invoice_id, payment_method, start_date, end_date }),
  ]);

  return {
    payments,
    pagination: {
      page, limit, totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasNext: page * limit < totalCount,
      hasPrev: page > 1,
    },
  };
};

const getPaymentById = async (schoolId, paymentId) =>
  feesRepository.findPaymentById(schoolId, paymentId);

const getStudentBalance = async (schoolId, studentId) => {
  const student = await db.schoolQueryOne(schoolId,
    `SELECT id, admission_no, first_name, last_name FROM students WHERE id = $1`, [studentId]
  );
  if (!student) return null;

  const invoices    = await feesRepository.getStudentBalanceSummary(schoolId, studentId);
  const totalBilled = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount),     0);
  const totalPaid   = invoices.reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0);

  return {
    student: { id: student.id, admission_no: student.admission_no, name: `${student.first_name} ${student.last_name}` },
    summary: {
      total_billed:  totalBilled.toFixed(2),
      total_paid:    totalPaid.toFixed(2),
      total_balance: (totalBilled - totalPaid).toFixed(2),
    },
    invoices,
  };
};

const getFeeStructures = async (schoolId, filters) =>
  feesRepository.findFeeStructures(schoolId, filters);

const createFeeStructure = async (data, schoolId) =>
  feesRepository.createFeeStructure(schoolId, data);

const getFeeCollectionSummary = async (schoolId, filters) =>
  feesRepository.getFeeCollectionSummary(schoolId, filters);

const getFeeDefaulters = async (schoolId, filters) =>
  feesRepository.getFeeDefaulters(schoolId, filters);

module.exports = {
  createInvoice, generateInvoice, getInvoices, getInvoiceById, getStudentInvoices,
  recordPayment, getPayments, getPaymentById,
  getStudentBalance, getFeeStructures, createFeeStructure,
  getFeeCollectionSummary, getFeeDefaulters,
};