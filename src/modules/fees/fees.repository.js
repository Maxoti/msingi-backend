/**
 * Fees Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
'use strict';
const db = require('../../shared/database/client');

const buildWhere = (conditions) => {
  const params = [], parts = [];
  for (const [col, val] of Object.entries(conditions)) {
    if (val === undefined || val === null) continue;
    params.push(val); parts.push(`${col} = $${params.length}`);
  }
  return { clause: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
};

const findInvoiceByStudentAndTerm = (schoolId, student_id, term_id) =>
  db.queryOne('SELECT * FROM invoices WHERE student_id=$1 AND term_id=$2 AND school_id=$3', [student_id, term_id, schoolId]);

const findInvoiceById = (schoolId, id) =>
  db.queryOne('SELECT * FROM invoices WHERE id=$1 AND school_id=$2', [id, schoolId]);

const findInvoiceByIdWithItems = (schoolId, id) =>
  db.queryOne(
    `SELECT i.*, s.admission_no, s.first_name||' '||s.last_name AS student_name,
     c.name AS class_name, t.year, t.term,
     COALESCE(json_agg(json_build_object('id',ii.id,'description',ii.description,'amount',ii.amount) ORDER BY ii.id) FILTER (WHERE ii.id IS NOT NULL),'[]') AS items,
     COALESCE(SUM(p.amount),0) AS paid_amount
     FROM invoices i
     JOIN students s ON i.student_id=s.id JOIN classes c ON s.class_id=c.id
     JOIN academic_terms t ON i.term_id=t.id
     LEFT JOIN invoice_items ii ON i.id=ii.invoice_id
     LEFT JOIN payments p ON i.id=p.invoice_id
     WHERE i.id=$1 AND i.school_id=$2
     GROUP BY i.id,s.admission_no,s.first_name,s.last_name,c.name,t.year,t.term`,
    [id, schoolId]
  );

const findInvoicesWithFilters = async (schoolId, filters) => {
  const { student_id, term_id, status, limit, offset } = filters;
  const { clause, params } = buildWhere({ 
    'i.student_id': student_id ? parseInt(student_id) : undefined, 
    'i.term_id':    term_id    ? parseInt(term_id)    : undefined, 
    'i.status':     status 
  });
  const allParams = [parseInt(schoolId), ...params, limit, offset];
  const li = allParams.length - 1, oi = allParams.length;
  return db.queryAll(
    `SELECT i.*, s.admission_no, s.first_name||' '||s.last_name AS student_name,
     c.name AS class_name, t.year, t.term, COALESCE(SUM(p.amount),0) AS paid_amount
     FROM invoices i JOIN students s ON i.student_id=s.id JOIN classes c ON s.class_id=c.id
     JOIN academic_terms t ON i.term_id=t.id LEFT JOIN payments p ON i.id=p.invoice_id
     WHERE i.school_id=$1${clause}
     GROUP BY i.id,s.admission_no,s.first_name,s.last_name,c.name,t.year,t.term
     ORDER BY i.created_at DESC LIMIT $${li} OFFSET $${oi}`,
    allParams
  );
};

const countInvoices = async (schoolId, filters) => {
  const { student_id, term_id, status } = filters;
  const { clause, params } = buildWhere({ 
    student_id: student_id ? parseInt(student_id) : undefined, 
    term_id:    term_id    ? parseInt(term_id)    : undefined, 
    status 
  });
  const r = await db.queryOne(
    `SELECT COUNT(*) AS count FROM invoices WHERE school_id=$1${clause}`, 
    [parseInt(schoolId), ...params]
  );
  return parseInt(r.count, 10);
};

const findInvoicesByStudent = (schoolId, studentId) =>
  db.queryAll(
    `SELECT i.*, t.year, t.term, COALESCE(SUM(p.amount),0) AS paid_amount, i.total_amount-COALESCE(SUM(p.amount),0) AS balance
     FROM invoices i JOIN academic_terms t ON i.term_id=t.id LEFT JOIN payments p ON i.id=p.invoice_id
     WHERE i.student_id=$1 AND i.school_id=$2 GROUP BY i.id,t.year,t.term ORDER BY i.created_at DESC`,
    [studentId, schoolId]
  );

const createInvoice = (schoolId, d) =>
  db.queryOne('INSERT INTO invoices (student_id,term_id,total_amount,due_date,school_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [d.student_id, d.term_id, d.total_amount, d.due_date??null, schoolId]);

const createInvoiceItem = (schoolId, d) =>
  db.queryOne('INSERT INTO invoice_items (invoice_id,description,amount,school_id) VALUES ($1,$2,$3,$4) RETURNING *',
    [d.invoice_id, d.description, d.amount, schoolId]);

const getTotalPaidAmount = async (schoolId, invoiceId) => {
  const r = await db.queryOne('SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id=$1 AND school_id=$2', [invoiceId, schoolId]);
  return parseFloat(r.total);
};

const findPaymentById = (schoolId, id) =>
  db.queryOne(
    `SELECT p.*, i.student_id, i.total_amount AS invoice_total, s.admission_no,
     s.first_name||' '||s.last_name AS student_name, u.username AS received_by_username
     FROM payments p JOIN invoices i ON p.invoice_id=i.id JOIN students s ON i.student_id=s.id
     LEFT JOIN users u ON p.received_by=u.id WHERE p.id=$1 AND p.school_id=$2`,
    [id, schoolId]
  );

const findPaymentsWithFilters = async (schoolId, filters) => {
  const { invoice_id, payment_method, start_date, end_date, limit, offset } = filters;
  const params = [schoolId]; let clause = '';
  if (invoice_id)     { params.push(invoice_id);     clause += ` AND p.invoice_id=$${params.length}`; }
  if (payment_method) { params.push(payment_method); clause += ` AND p.payment_method=$${params.length}`; }
  if (start_date)     { params.push(start_date);     clause += ` AND p.payment_date>=$${params.length}`; }
  if (end_date)       { params.push(end_date);       clause += ` AND p.payment_date<=$${params.length}`; }
  params.push(limit, offset);
  const li = params.length-1, oi = params.length;
  return db.queryAll(
    `SELECT p.*, i.student_id, s.admission_no, s.first_name||' '||s.last_name AS student_name, u.username AS received_by_username
     FROM payments p JOIN invoices i ON p.invoice_id=i.id JOIN students s ON i.student_id=s.id
     LEFT JOIN users u ON p.received_by=u.id
     WHERE p.school_id=$1${clause} ORDER BY p.payment_date DESC, p.created_at DESC LIMIT $${li} OFFSET $${oi}`,
    params
  );
};

const countPayments = async (schoolId, filters) => {
  const { invoice_id, payment_method, start_date, end_date } = filters;
  const params = [schoolId]; let clause = '';
  if (invoice_id)     { params.push(invoice_id);     clause += ` AND invoice_id=$${params.length}`; }
  if (payment_method) { params.push(payment_method); clause += ` AND payment_method=$${params.length}`; }
  if (start_date)     { params.push(start_date);     clause += ` AND payment_date>=$${params.length}`; }
  if (end_date)       { params.push(end_date);       clause += ` AND payment_date<=$${params.length}`; }
  const r = await db.queryOne(`SELECT COUNT(*) AS count FROM payments WHERE school_id=$1${clause}`, params);
  return parseInt(r.count, 10);
};

const createPayment = (schoolId, d) =>
  db.queryOne('INSERT INTO payments (invoice_id,amount,payment_method,reference_number,payment_date,received_by,school_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [d.invoice_id, d.amount, d.payment_method, d.reference_number??null, d.payment_date, d.received_by, schoolId]);

const getStudentBalanceSummary = (schoolId, studentId) =>
  db.queryAll(
    `SELECT i.id, i.total_amount, i.status, i.due_date, t.year, t.term,
     COALESCE(SUM(p.amount),0) AS paid_amount, i.total_amount-COALESCE(SUM(p.amount),0) AS balance
     FROM invoices i JOIN academic_terms t ON i.term_id=t.id LEFT JOIN payments p ON i.id=p.invoice_id
     WHERE i.student_id=$1 AND i.school_id=$2 GROUP BY i.id,t.year,t.term ORDER BY i.created_at DESC`,
    [studentId, schoolId]
  );

const findFeeStructures = (schoolId, filters) => {
  const { class_id, term_id } = filters;
  const { clause, params } = buildWhere({ 'fs.class_id': class_id, 'fs.term_id': term_id });
  return db.queryAll(
    `SELECT fs.*, c.name AS class_name, t.year, t.term
     FROM fee_structures fs JOIN classes c ON fs.class_id=c.id JOIN academic_terms t ON fs.term_id=t.id
     WHERE fs.school_id=$1${clause} ORDER BY c.name, fs.fee_type`,
    [schoolId, ...params]
  );
};

/**
 * findFeeStructureItems
 * Returns all fee line items for a given class + term.
 * Used by generateInvoice to populate invoice_items for each student.
 * Each row maps to one invoice_item: { description, amount }
 */
const findFeeStructureItems = (schoolId, class_id, term_id) =>
  db.queryAll(
    `SELECT fee_type AS description, amount
     FROM fee_structures
     WHERE school_id=$1 AND class_id=$2 AND term_id=$3
     ORDER BY fee_type`,
    [schoolId, class_id, term_id]
  );

const createFeeStructure = (schoolId, d) =>
  db.queryOne('INSERT INTO fee_structures (class_id,term_id,fee_type,amount,description,is_mandatory,school_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [d.class_id, d.term_id, d.fee_type, d.amount, d.description??null, d.is_mandatory, schoolId]);

const getFeeCollectionSummary = async (schoolId, filters) => {
  const { term_id, class_id, start_date, end_date } = filters;
  const params = [schoolId]; let clause = '';
  if (term_id)    { params.push(term_id);    clause += ` AND i.term_id=$${params.length}`; }
  if (class_id)   { params.push(class_id);   clause += ` AND s.class_id=$${params.length}`; }
  if (start_date) { params.push(start_date); clause += ` AND p.payment_date>=$${params.length}`; }
  if (end_date)   { params.push(end_date);   clause += ` AND p.payment_date<=$${params.length}`; }
  return db.queryOne(
    `SELECT COUNT(DISTINCT i.id) AS total_invoices, COUNT(DISTINCT i.student_id) AS total_students,
     COALESCE(SUM(i.total_amount),0) AS total_billed, COALESCE(SUM(p.amount),0) AS total_collected,
     COALESCE(SUM(i.total_amount)-SUM(COALESCE(p.amount,0)),0) AS total_outstanding,
     COUNT(DISTINCT CASE WHEN i.status='PAID' THEN i.id END) AS paid_invoices,
     COUNT(DISTINCT CASE WHEN i.status='PARTIAL' THEN i.id END) AS partial_invoices,
     COUNT(DISTINCT CASE WHEN i.status='UNPAID' THEN i.id END) AS unpaid_invoices
     FROM invoices i JOIN students s ON i.student_id=s.id LEFT JOIN payments p ON i.id=p.invoice_id
     WHERE i.school_id=$1${clause}`,
    params
  );
};

const getFeeDefaulters = (schoolId, filters) => {
  const { term_id, class_id, min_balance } = filters;
  const params = [min_balance, schoolId]; let clause = '';
  if (term_id)  { params.push(term_id);  clause += ` AND EXISTS (SELECT 1 FROM academic_terms t WHERE t.year=fb.year AND t.term=fb.term AND t.id=$${params.length})`; }
  if (class_id) { params.push(class_id); clause += ` AND EXISTS (SELECT 1 FROM classes c WHERE c.name=fb.class_name AND c.id=$${params.length})`; }
  return db.queryAll(
    `SELECT fb.student_id,fb.admission_no,fb.student_name,fb.class_name,fb.year,fb.term,
     fb.total_amount,fb.paid_amount,fb.balance,fb.parent_name,fb.parent_phone
     FROM fee_balances fb WHERE fb.balance>=$1 AND fb.school_id=$2${clause} ORDER BY fb.balance DESC`,
    params
  );
};

module.exports = {
  findInvoiceByStudentAndTerm, findInvoiceById, findInvoiceByIdWithItems,
  findInvoicesWithFilters, countInvoices, findInvoicesByStudent, createInvoice, createInvoiceItem,
  getTotalPaidAmount, findPaymentById, findPaymentsWithFilters, countPayments, createPayment,
  getStudentBalanceSummary, findFeeStructures, findFeeStructureItems, createFeeStructure,
  getFeeCollectionSummary, getFeeDefaulters,
};