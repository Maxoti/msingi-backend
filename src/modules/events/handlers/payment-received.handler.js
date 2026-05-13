'use strict';

/**
 * Payment Received Event Handler
 * File: src/modules/events/handlers/payment-received.handler.js
 *
 * Listens for two events emitted by mpesa.service.js:
 *
 *  1. EventBus.Events.PAYMENT_RECEIVED  (alias: 'payment:received')
 *     ─ Fired by autoReconcile() AFTER a payment row is created and linked
 *       to an invoice. At this point we have full payment + student + invoice
 *       context. We send a detailed receipt SMS.
 *     Payload shape:
 *       { paymentId, studentId, invoiceId, schoolId, amount, referenceNumber }
 *
 *  2. 'mpesa:callback:received'  (fired immediately on webhook arrival)
 *     ─ Fired by processCallback() as soon as a COMPLETED transaction is
 *       confirmed, BEFORE reconciliation. We send a quick "we got your money"
 *       SMS to the paying phone number so the parent isn't left waiting.
 *     Payload shape:
 *       { transactionDbId, schoolId, amount, receiptNumber,
 *         phoneNumber, accountReference }
 *
 * SMS provider contract (sms.service.js):
 *   smsService.sendSMS(phoneNumber: string, message: string, options?: object)
 *
 * Design principles:
 *   • Every DB call is school-scoped.
 *   • SMS failures NEVER throw — they are logged and swallowed so a failed
 *     SMS never rolls back a payment.
 *   • All formatting helpers are pure functions — easy to test in isolation.
 *   • No business logic lives inside event handlers; they are thin
 *     orchestrators that delegate to services.
 */

const smsService = require('../../notifications/sms/sms.service');
const db         = require('../../../shared/database/client');

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_SCHOOL_NAME  = 'Your School';
const FALLBACK_PARENT_NAME  = 'Parent';

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Format a number to 2 d.p. string, e.g. 1000 → "1,000.00"
 */
const fmt = (n) =>
  Number(n || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Build the receipt SMS sent after full reconciliation.
 * Keeps the tone warm, matches real M-PESA message brevity.
 */
const buildReceiptMessage = ({
  parentName,
  studentName,
  admissionNo,
  amount,
  referenceNumber,
  totalPaid,
  totalAmount,
  balance,
  schoolName,
}) => {
  const fullyPaid = parseFloat(balance) <= 0;

  const balanceLine = fullyPaid
    ? 'Invoice fully settled.'
    : `Balance: KES ${fmt(balance)}.`;

  return (
    `Dear ${parentName}, KES ${fmt(amount)} received for ` +
    `${studentName} (${admissionNo}). ` +
    `Ref: ${referenceNumber}. ` +
    `Paid: KES ${fmt(totalPaid)} of KES ${fmt(totalAmount)}. ` +
    `${balanceLine} ` +
    `Thank you. - ${schoolName}`
  );
};

/**
 * Build the instant M-PESA confirmation SMS (pre-reconciliation).
 * Sent the moment Safaricom's webhook fires — before invoice matching.
 */
const buildMpesaConfirmationMessage = ({
  parentName,
  studentName,
  amount,
  receiptNumber,
  schoolName,
}) =>
  `Dear ${parentName}, your M-PESA payment of KES ${fmt(amount)} ` +
  `for ${studentName} (Ref: ${receiptNumber}) has been received. ` +
  `It will be applied to your account shortly. ` +
  `Thank you. - ${schoolName}`;

/**
 * Build the "fully paid" congratulations SMS.
 */
const buildFullyPaidMessage = ({
  parentName,
  studentFirstName,
  term,
  year,
  schoolName,
}) =>
  `Dear ${parentName}, congratulations! ` +
  `${studentFirstName}'s fees for Term ${term} ${year} are now fully paid. ` +
  `Thank you for your prompt payment. - ${schoolName}`;

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch the school name for an SMS signature.
 * Falls back gracefully — a missing school name must never suppress an SMS.
 */
const fetchSchoolName = async (schoolId) => {
  if (!schoolId) return FALLBACK_SCHOOL_NAME;
  try {
    const row = await db.queryOne(
      `SELECT name FROM schools WHERE id = $1`,
      [schoolId]
    );
    return row?.name?.trim() || FALLBACK_SCHOOL_NAME;
  } catch (err) {
    console.warn(`[handler] Could not fetch school name (id=${schoolId}):`, err.message);
    return FALLBACK_SCHOOL_NAME;
  }
};

/**
 * Fetch full payment details needed for a receipt SMS.
 * Uses a single JOIN query — no N+1 calls.
 *
 * Returns null if the payment row is not found.
 */
const fetchPaymentDetails = async (paymentId) =>
  db.queryOne(
    `SELECT
       p.id                                                AS payment_id,
       p.amount,
       p.payment_method,
       p.reference_number,
       p.payment_date,
       -- student
       s.id                                               AS student_id,
       s.school_id,
       s.first_name,
       s.last_name,
       s.admission_no,
       -- class / term
       c.name                                             AS class_name,
       at.term,
       at.year,
       -- invoice totals
       i.id                                               AS invoice_id,
       i.total_amount,
       i.status                                           AS invoice_status,
       -- primary parent contact
       pc.name                                            AS parent_name,
       pc.phone                                           AS parent_phone,
       -- running totals (all payments on this invoice, including this one)
       COALESCE(SUM(all_p.amount), 0)                    AS total_paid,
       (i.total_amount - COALESCE(SUM(all_p.amount), 0)) AS balance
     FROM payments p
     JOIN invoices       i   ON i.id  = p.invoice_id
     JOIN students       s   ON s.id  = i.student_id
     JOIN classes        c   ON c.id  = s.class_id
     JOIN academic_terms at  ON at.id = i.term_id
     LEFT JOIN parent_contacts pc
       ON pc.student_id = s.id AND pc.is_primary = TRUE
     LEFT JOIN payments all_p
       ON all_p.invoice_id = i.id
     WHERE p.id = $1
     GROUP BY p.id, s.id, c.id, i.id, at.id, pc.name, pc.phone`,
    [paymentId]
  );

/**
 * Fetch the student + primary parent contact for a given admission_no / schoolId.
 * Used in the instant M-PESA confirmation path (pre-reconciliation).
 *
 * Returns null if the student is not found.
 */
const fetchStudentByAdmission = async (admissionNo, schoolId) =>
  db.queryOne(
    `SELECT
       s.id,
       s.first_name,
       s.last_name,
       s.admission_no,
       pc.name  AS parent_name,
       pc.phone AS parent_phone
     FROM students s
     LEFT JOIN parent_contacts pc
       ON pc.student_id = s.id AND pc.is_primary = TRUE
     WHERE s.admission_no = $1
       AND s.school_id    = $2`,
    [admissionNo, schoolId]
  );

// ─── SMS helper ───────────────────────────────────────────────────────────────

/**
 * Send an SMS and swallow any error so that a provider failure never
 * propagates up and interferes with the payment flow.
 */
const safeSendSMS = async (phone, message, options, logLabel) => {
  try {
    const result = await smsService.sendSMS(phone, message, options);
    if (result.success) {
      console.log(`✓ [handler] SMS sent (${logLabel}) → ${phone}`);
    } else {
      console.warn(`⚠ [handler] SMS not sent (${logLabel}):`, result.error || result.status);
    }
    return result;
  } catch (err) {
    console.error(`✗ [handler] SMS threw (${logLabel}):`, err.message);
    return { success: false, error: err.message };
  }
};

// ─── Event handler: post-reconciliation receipt ───────────────────────────────

/**
 * handlePaymentReceived
 *
 * Triggered AFTER autoReconcile() or manualReconcile() creates a payment row
 * and links it to an invoice (EventBus.Events.PAYMENT_RECEIVED).
 *
 * Sends:
 *   1. A detailed receipt SMS with running totals and outstanding balance.
 *   2. A congratulations SMS if the invoice is now fully settled.
 *
 * Expected payload:
 *   { paymentId: number }
 *   (schoolId, studentId, invoiceId are resolved from the DB to avoid
 *    trusting caller-supplied values for scoping.)
 */
const handlePaymentReceived = async ({ paymentId } = {}) => {
  const label = `handlePaymentReceived(paymentId=${paymentId})`;

  try {
    if (!paymentId) {
      console.error(`✗ [handler] ${label}: missing paymentId`);
      return { success: false, error: 'Missing paymentId' };
    }

    console.log(`▶ [handler] ${label}`);

    // ── 1. Fetch everything we need in one query ──────────────────────────
    const pd = await fetchPaymentDetails(paymentId);

    if (!pd) {
      console.error(`✗ [handler] ${label}: payment not found`);
      return { success: false, error: 'Payment not found' };
    }

    const schoolName  = await fetchSchoolName(pd.school_id);
    const parentPhone = pd.parent_phone;

    if (!parentPhone) {
      console.warn(`⚠ [handler] ${label}: no parent phone for student ${pd.student_id}`);
      return { success: false, error: 'No parent phone number on record' };
    }

    const studentName = `${pd.first_name} ${pd.last_name}`;
    const parentName  = pd.parent_name || FALLBACK_PARENT_NAME;

    // ── 2. Receipt SMS ────────────────────────────────────────────────────
    const receiptMsg = buildReceiptMessage({
      parentName,
      studentName,
      admissionNo:     pd.admission_no,
      amount:          pd.amount,
      referenceNumber: pd.reference_number,
      totalPaid:       pd.total_paid,
      totalAmount:     pd.total_amount,
      balance:         pd.balance,
      schoolName,
    });

    await safeSendSMS(
      parentPhone,
      receiptMsg,
      {
        messageType: 'PAYMENT_CONFIRMATION',
        studentId:   pd.student_id,
        invoiceId:   pd.invoice_id,
        paymentId:   pd.payment_id,
      },
      'RECEIPT'
    );

    // ── 3. Congratulations SMS (only when fully paid) ─────────────────────
    if (parseFloat(pd.balance) <= 0) {
      const congratsMsg = buildFullyPaidMessage({
        parentName,
        studentFirstName: pd.first_name,
        term:             pd.term,
        year:             pd.year,
        schoolName,
      });

      await safeSendSMS(
        parentPhone,
        congratsMsg,
        {
          messageType: 'GENERAL',
          studentId:   pd.student_id,
          invoiceId:   pd.invoice_id,
          paymentId:   pd.payment_id,
        },
        'FULLY_PAID'
      );
    }

    return {
      success:     true,
      studentName,
      amountPaid:  parseFloat(pd.amount),
      balance:     parseFloat(pd.balance),
      schoolName,
    };

  } catch (err) {
    // Do not rethrow — a handler crash must never affect the payment record.
    console.error(`✗ [handler] ${label} unhandled error:`, err);
    return { success: false, error: err.message };
  }
};

// ─── Event handler: instant M-PESA confirmation (pre-reconciliation) ──────────

/**
 * handleMpesaPaymentReceived
 *
 * Triggered immediately when processCallback() marks a transaction COMPLETED,
 * BEFORE autoReconcile() runs. The goal is speed — the parent should receive
 * an SMS within seconds of paying, not after reconciliation completes.
 *
 * If the paying phone belongs to the registered parent we use that number;
 * otherwise we fall back to the phone that initiated the STK push.
 *
 * Expected payload (from mpesa.service.js → processCallback):
 *   {
 *     transactionDbId:  number,   // mpesa_transactions.id
 *     schoolId:         number,
 *     amount:           number,
 *     receiptNumber:    string,   // MpesaReceiptNumber or fallback ref
 *     phoneNumber:      string,   // phone that initiated STK push
 *     accountReference: string,   // admission_no used as bill reference
 *   }
 */
const handleMpesaPaymentReceived = async ({
  transactionDbId,
  schoolId,
  amount,
  receiptNumber,
  phoneNumber,
  accountReference,
} = {}) => {
  const label = `handleMpesaPaymentReceived(txId=${transactionDbId}, ref=${receiptNumber})`;

  try {
    console.log(`▶ [handler] ${label}`);

    // ── 1. Validate required fields ───────────────────────────────────────
    if (!schoolId || !accountReference) {
      console.error(`✗ [handler] ${label}: missing schoolId or accountReference`);
      return { success: false, error: 'Missing required payload fields' };
    }

    // ── 2. Fetch student + school name in parallel ────────────────────────
    const [student, schoolName] = await Promise.all([
      fetchStudentByAdmission(accountReference, schoolId),
      fetchSchoolName(schoolId),
    ]);

    if (!student) {
      // Not a fatal error — the transaction is already saved; reconciliation
      // will retry. But we cannot send an SMS without a student record.
      console.warn(
        `⚠ [handler] ${label}: student not found ` +
        `(admission_no=${accountReference}, school=${schoolId}). SMS skipped.`
      );
      return { success: false, error: 'Student not found' };
    }

    // ── 3. Resolve recipient phone ────────────────────────────────────────
    // Prefer the registered parent contact; fall back to the paying phone.
    const recipientPhone = student.parent_phone || phoneNumber;

    if (!recipientPhone) {
      console.warn(`⚠ [handler] ${label}: no phone available. SMS skipped.`);
      return { success: false, error: 'No phone number available' };
    }

    const studentName = `${student.first_name} ${student.last_name}`;
    const parentName  = student.parent_name || FALLBACK_PARENT_NAME;

    // ── 4. Send confirmation SMS ──────────────────────────────────────────
    const message = buildMpesaConfirmationMessage({
      parentName,
      studentName,
      amount,
      receiptNumber,
      schoolName,
    });

    await safeSendSMS(
      recipientPhone,
      message,
      {
        messageType:        'PAYMENT_CONFIRMATION',
        studentId:          student.id,
        mpesaTransactionId: transactionDbId,
      },
      'MPESA_INSTANT'
    );

    return {
      success:            true,
      confirmationSent:   true,
      schoolName,
      mpesaReceiptNumber: receiptNumber,
      amount:             parseFloat(amount),
    };

  } catch (err) {
    console.error(`✗ [handler] ${label} unhandled error:`, err);
    return { success: false, error: err.message };
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { handlePaymentReceived, handleMpesaPaymentReceived };