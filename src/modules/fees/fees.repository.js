/**
 * fees.repository.js
 *
 * All database access for the fees module.
 *
 * Design principles:
 *  - Every query is explicitly scoped to school_id — no RLS dependency.
 *  - No generic buildWhere helper: each query builds its own WHERE clause
 *    with typed parameters to prevent operator mismatch errors.
 *  - SQL is formatted for readability and diff-friendliness.
 *  - No silent swallowing of null results — callers decide what null means.
 *  - Parameter indices are computed once at the end of each clause-builder,
 *    not inline, so adding/removing conditions never breaks numbering.
 */

'use strict';

const db = require('../../shared/database/client');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lightweight clause builder — avoids the typed-parameter bugs of a generic
 * buildWhere while still removing repetition.
 *
 * Usage:
 *   const w = where();
 *   w.and('i.term_id = $', parseInt(term_id, 10));
 *   w.and('i.status  = $', String(status));
 *   const { clause, params } = w.build(baseParams);
 */
const where = () => {
  const conditions = [];
  return {
    and(template, value) {
      if (value === undefined || value === null || value === '') return this;
      conditions.push({ template, value });
      return this;
    },
    /**
     * @param {any[]} base  — params that come before the WHERE conditions
     * @returns {{ clause: string, params: any[] }}
     */
    build(base = []) {
      const params = [...base];
      const parts  = conditions.map(({ template, value }) => {
        params.push(value);
        return template.replace('$', `$${params.length}`);
      });
      return {
        clause: parts.length ? ' AND ' + parts.join(' AND ') : '',
        params,
      };
    },
  };
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Find a single invoice by student + term (used to detect duplicates).
 */
const findInvoiceByStudentAndTerm = (schoolId, studentId, termId) =>
  db.queryOne(
    `SELECT *
       FROM invoices
      WHERE student_id = $1
        AND term_id    = $2
        AND school_id  = $3`,
    [studentId, termId, schoolId],
  );

/**
 * Find a raw invoice row by id (no joins).
 */
const findInvoiceById = (schoolId, invoiceId) =>
  db.queryOne(
    `SELECT *
       FROM invoices
      WHERE id        = $1
        AND school_id = $2`,
    [invoiceId, schoolId],
  );

/**
 * Find an invoice with its line items, student info, class, term, and total paid.
 */
const findInvoiceByIdWithItems = (schoolId, invoiceId) =>
  db.queryOne(
    `SELECT
         i.*,
         s.admission_no,
         s.first_name || ' ' || s.last_name              AS student_name,
         c.name                                           AS class_name,
         t.year,
         t.term,
         COALESCE(
           json_agg(
             json_build_object(
               'id',          ii.id,
               'description', ii.description,
               'amount',      ii.amount
             ) ORDER BY ii.id
           ) FILTER (WHERE ii.id IS NOT NULL),
           '[]'
         )                                                AS items,
         COALESCE(SUM(p.amount), 0)                       AS paid_amount
       FROM invoices       i
       JOIN students       s  ON s.id        = i.student_id
       JOIN classes        c  ON c.id        = s.class_id
       JOIN academic_terms t  ON t.id        = i.term_id
       LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
       LEFT JOIN payments      p  ON p.invoice_id  = i.id
      WHERE i.id        = $1
        AND i.school_id = $2
      GROUP BY
         i.id,
         s.admission_no, s.first_name, s.last_name,
         c.name,
         t.year, t.term`,
    [invoiceId, schoolId],
  );

/**
 * Paginated invoice list with optional filters.
 * status is always cast as text to prevent operator mismatch.
 */
const findInvoicesWithFilters = (schoolId, filters) => {
  const {
    student_id,
    term_id,
    status,
    limit  = 20,
    offset = 0,
  } = filters;

  const w = where();
  if (student_id) w.and('i.student_id = $', parseInt(student_id, 10));
  if (term_id)    w.and('i.term_id    = $', parseInt(term_id,    10));
  if (status)     w.and('i.status     = $', String(status));

  const { clause, params } = w.build([schoolId]);
  params.push(parseInt(limit, 10), parseInt(offset, 10));
  const limitIdx  = params.length - 1;
  const offsetIdx = params.length;

  return db.queryAll(
    `SELECT
         i.*,
         s.admission_no,
         s.first_name || ' ' || s.last_name AS student_name,
         c.name                             AS class_name,
         t.year,
         t.term,
         COALESCE(SUM(p.amount), 0)         AS paid_amount
       FROM invoices       i
       JOIN students       s  ON s.id       = i.student_id
       JOIN classes        c  ON c.id       = s.class_id
       JOIN academic_terms t  ON t.id       = i.term_id
       LEFT JOIN payments  p  ON p.invoice_id = i.id
      WHERE i.school_id = $1${clause}
      GROUP BY
         i.id,
         s.admission_no, s.first_name, s.last_name,
         c.name,
         t.year, t.term
      ORDER BY i.created_at DESC
      LIMIT  $${limitIdx}
      OFFSET $${offsetIdx}`,
    params,
  );
};

/**
 * Count invoices matching the same filters (for pagination metadata).
 */
const countInvoices = async (schoolId, filters) => {
  const { student_id, term_id, status } = filters;

  const w = where();
  if (student_id) w.and('student_id = $', parseInt(student_id, 10));
  if (term_id)    w.and('term_id    = $', parseInt(term_id,    10));
  if (status)     w.and('status     = $', String(status));

  const { clause, params } = w.build([schoolId]);

  const row = await db.queryOne(
    `SELECT COUNT(*) AS count
       FROM invoices
      WHERE school_id = $1${clause}`,
    params,
  );
  return parseInt(row.count, 10);
};

/**
 * All invoices for a single student, newest first.
 */
const findInvoicesByStudent = (schoolId, studentId) =>
  db.queryAll(
    `SELECT
         i.*,
         t.year,
         t.term,
         COALESCE(SUM(p.amount), 0)                              AS paid_amount,
         i.total_amount - COALESCE(SUM(p.amount), 0)            AS balance
       FROM invoices       i
       JOIN academic_terms t ON t.id        = i.term_id
       LEFT JOIN payments  p ON p.invoice_id = i.id
      WHERE i.student_id = $1
        AND i.school_id  = $2
      GROUP BY i.id, t.year, t.term
      ORDER BY i.created_at DESC`,
    [studentId, schoolId],
  );

const createInvoice = (schoolId, d) =>
  db.queryOne(
    `INSERT INTO invoices
         (student_id, term_id, total_amount, due_date, school_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
    [d.student_id, d.term_id, d.total_amount, d.due_date ?? null, schoolId],
  );

const createInvoiceItem = (schoolId, d) =>
  db.queryOne(
    `INSERT INTO invoice_items
         (invoice_id, description, amount, school_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
    [d.invoice_id, d.description, d.amount, schoolId],
  );

// ─── Payments ─────────────────────────────────────────────────────────────────

const getTotalPaidAmount = async (schoolId, invoiceId) => {
  const row = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
      WHERE invoice_id = $1
        AND school_id  = $2`,
    [invoiceId, schoolId],
  );
  return parseFloat(row.total);
};

const findPaymentById = (schoolId, paymentId) =>
  db.queryOne(
    `SELECT
         p.*,
         i.student_id,
         i.total_amount                             AS invoice_total,
         s.admission_no,
         s.first_name || ' ' || s.last_name        AS student_name,
         u.username                                 AS received_by_username
       FROM payments p
       JOIN invoices  i ON i.id = p.invoice_id
       JOIN students  s ON s.id = i.student_id
       LEFT JOIN users u ON u.id = p.received_by
      WHERE p.id        = $1
        AND p.school_id = $2`,
    [paymentId, schoolId],
  );

const findPaymentsWithFilters = (schoolId, filters) => {
  const {
    invoice_id,
    payment_method,
    start_date,
    end_date,
    limit  = 20,
    offset = 0,
  } = filters;

  const w = where();
  if (invoice_id)     w.and('p.invoice_id     = $', parseInt(invoice_id, 10));
  if (payment_method) w.and('p.payment_method = $', String(payment_method));
  if (start_date)     w.and('p.payment_date  >= $', start_date);
  if (end_date)       w.and('p.payment_date  <= $', end_date);

  const { clause, params } = w.build([schoolId]);
  params.push(parseInt(limit, 10), parseInt(offset, 10));
  const limitIdx  = params.length - 1;
  const offsetIdx = params.length;

  return db.queryAll(
    `SELECT
         p.*,
         i.student_id,
         s.admission_no,
         s.first_name || ' ' || s.last_name AS student_name,
         u.username                          AS received_by_username
       FROM payments p
       JOIN invoices  i ON i.id = p.invoice_id
       JOIN students  s ON s.id = i.student_id
       LEFT JOIN users u ON u.id = p.received_by
      WHERE p.school_id = $1${clause}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT  $${limitIdx}
      OFFSET $${offsetIdx}`,
    params,
  );
};

const countPayments = async (schoolId, filters) => {
  const { invoice_id, payment_method, start_date, end_date } = filters;

  const w = where();
  if (invoice_id)     w.and('invoice_id     = $', parseInt(invoice_id, 10));
  if (payment_method) w.and('payment_method = $', String(payment_method));
  if (start_date)     w.and('payment_date  >= $', start_date);
  if (end_date)       w.and('payment_date  <= $', end_date);

  const { clause, params } = w.build([schoolId]);
  const row = await db.queryOne(
    `SELECT COUNT(*) AS count
       FROM payments
      WHERE school_id = $1${clause}`,
    params,
  );
  return parseInt(row.count, 10);
};

const createPayment = (schoolId, d) =>
  db.queryOne(
    `INSERT INTO payments
         (invoice_id, amount, payment_method, reference_number,
          payment_date, received_by, school_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
    [
      d.invoice_id,
      d.amount,
      d.payment_method,
      d.reference_number ?? null,
      d.payment_date,
      d.received_by,
      schoolId,
    ],
  );

// ─── Student balance ──────────────────────────────────────────────────────────

const getStudentBalanceSummary = (schoolId, studentId) =>
  db.queryAll(
    `SELECT
         i.id,
         i.total_amount,
         i.status,
         i.due_date,
         t.year,
         t.term,
         COALESCE(SUM(p.amount), 0)                   AS paid_amount,
         i.total_amount - COALESCE(SUM(p.amount), 0)  AS balance
       FROM invoices       i
       JOIN academic_terms t ON t.id        = i.term_id
       LEFT JOIN payments  p ON p.invoice_id = i.id
      WHERE i.student_id = $1
        AND i.school_id  = $2
      GROUP BY i.id, t.year, t.term
      ORDER BY i.created_at DESC`,
    [studentId, schoolId],
  );

// ─── Fee structures ───────────────────────────────────────────────────────────

const findFeeStructures = (schoolId, filters = {}) => {
  const { class_id, term_id } = filters;

  const w = where();
  if (class_id) w.and('fs.class_id = $', parseInt(class_id, 10));
  if (term_id)  w.and('fs.term_id  = $', parseInt(term_id,  10));

  const { clause, params } = w.build([schoolId]);

  return db.queryAll(
    `SELECT
         fs.*,
         c.name AS class_name,
         t.year,
         t.term
       FROM fee_structures fs
       JOIN classes        c ON c.id = fs.class_id
       JOIN academic_terms t ON t.id = fs.term_id
      WHERE fs.school_id = $1${clause}
      ORDER BY c.name, fs.fee_type`,
    params,
  );
};

/**
 * Fee line items for a specific class + term.
 * Used by generateInvoice to bulk-create invoice_items.
 */
const findFeeStructureItems = (schoolId, classId, termId) =>
  db.queryAll(
    `SELECT fee_type AS description, amount
       FROM fee_structures
      WHERE school_id = $1
        AND class_id  = $2
        AND term_id   = $3
      ORDER BY fee_type`,
    [schoolId, classId, termId],
  );

const createFeeStructure = (schoolId, d) =>
  db.queryOne(
    `INSERT INTO fee_structures
         (class_id, term_id, fee_type, amount, description, is_mandatory, school_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
    [
      d.class_id,
      d.term_id,
      d.fee_type,
      d.amount,
      d.description  ?? null,
      d.is_mandatory ?? true,
      schoolId,
    ],
  );

// ─── Reports ──────────────────────────────────────────────────────────────────

const getFeeCollectionSummary = (schoolId, filters = {}) => {
  const { term_id, class_id, start_date, end_date } = filters;

  const w = where();
  if (term_id)    w.and('i.term_id      = $', parseInt(term_id,  10));
  if (class_id)   w.and('s.class_id     = $', parseInt(class_id, 10));
  if (start_date) w.and('p.payment_date >= $', start_date);
  if (end_date)   w.and('p.payment_date <= $', end_date);

  const { clause, params } = w.build([schoolId]);

  return db.queryOne(
    `SELECT
         COUNT(DISTINCT i.id)                                        AS total_invoices,
         COUNT(DISTINCT i.student_id)                               AS total_students,
         COALESCE(SUM(i.total_amount), 0)                           AS total_billed,
         COALESCE(SUM(p.amount),       0)                           AS total_collected,
         COALESCE(SUM(i.total_amount), 0)
           - COALESCE(SUM(p.amount),   0)                           AS total_outstanding,
         COUNT(DISTINCT CASE WHEN i.status = 'PAID'    THEN i.id END) AS paid_invoices,
         COUNT(DISTINCT CASE WHEN i.status = 'PARTIAL' THEN i.id END) AS partial_invoices,
         COUNT(DISTINCT CASE WHEN i.status = 'UNPAID'  THEN i.id END) AS unpaid_invoices
       FROM invoices  i
       JOIN students  s ON s.id        = i.student_id
       LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.school_id = $1${clause}`,
    params,
  );
};

const getFeeDefaulters = (schoolId, filters = {}) => {
  const { term_id, class_id, min_balance = 0 } = filters;

  const w = where();
  if (term_id)  w.and('EXISTS (SELECT 1 FROM academic_terms t WHERE t.year = fb.year AND t.term = fb.term AND t.id = $)', parseInt(term_id,  10));
  if (class_id) w.and('EXISTS (SELECT 1 FROM classes        c WHERE c.name = fb.class_name              AND c.id = $)', parseInt(class_id, 10));

  const { clause, params } = w.build([parseFloat(min_balance), schoolId]);

  return db.queryAll(
    `SELECT
         fb.student_id,
         fb.admission_no,
         fb.student_name,
         fb.class_name,
         fb.year,
         fb.term,
         fb.total_amount,
         fb.paid_amount,
         fb.balance,
         fb.parent_name,
         fb.parent_phone
       FROM fee_balances fb
      WHERE fb.balance    >= $1
        AND fb.school_id   = $2${clause}
      ORDER BY fb.balance DESC`,
    params,
  );
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Invoices
  findInvoiceByStudentAndTerm,
  findInvoiceById,
  findInvoiceByIdWithItems,
  findInvoicesWithFilters,
  countInvoices,
  findInvoicesByStudent,
  createInvoice,
  createInvoiceItem,

  // Payments
  getTotalPaidAmount,
  findPaymentById,
  findPaymentsWithFilters,
  countPayments,
  createPayment,

  // Balance
  getStudentBalanceSummary,

  // Fee structures
  findFeeStructures,
  findFeeStructureItems,
  createFeeStructure,

  // Reports
  getFeeCollectionSummary,
  getFeeDefaulters,
};