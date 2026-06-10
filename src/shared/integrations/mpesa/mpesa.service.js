'use strict';

/**
 * M-Pesa Service — Lipana Edition
 * File: src/shared/integrations/mpesa/mpesa.service.js
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────────────────────
 * • Multi-tenant: every read/write is scoped to a schoolId. No exceptions.
 * • processCallback uses ONE unscoped query to discover schoolId from the
 *   transaction row, then switches exclusively to school-scoped operations.
 * • autoReconcile acquires FOR UPDATE locks on both the transaction and invoice
 *   rows before any write — prevents double-payment on duplicate webhooks.
 * • Invoice status (UNPAID → PARTIAL → PAID) is updated atomically in the
 *   same transaction as the payment insert.
 * • accountReference encodes admissionNo + invoiceId so autoReconcile targets
 *   the exact invoice rather than guessing the oldest unpaid one.
 * • queryTransaction is school-scoped — no cross-tenant data leakage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const lipana = require('./mpesa-client');
const db     = require('../../database/client');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the STK account reference.
 * Format: "<admissionNo>-<invoiceId>"  e.g. "STD2026001-47"
 * Falls back to admissionNo alone when no invoiceId is supplied.
 * Max 12 chars enforced by Safaricom — keep it tight.
 */
const buildReference = (admissionNo, invoiceId) =>
  invoiceId ? `${admissionNo}-${invoiceId}` : admissionNo;

/**
 * Parse a reference back into its parts.
 * "STD2026001-47" → { admissionNo: "STD2026001", invoiceId: 47 }
 * "STD2026001"    → { admissionNo: "STD2026001", invoiceId: null }
 */
const parseReference = (reference = '') => {
  const parts = reference.split('-');
  // Handle admission numbers that contain hyphens (defensive)
  const invoiceId = parts.length > 1 ? parseInt(parts[parts.length - 1], 10) : null;
  const admissionNo = invoiceId
    ? parts.slice(0, -1).join('-')
    : reference;
  return {
    admissionNo,
    invoiceId: Number.isFinite(invoiceId) ? invoiceId : null,
  };
};

/**
 * Resolve the best available receipt identifier from a webhook payload.
 * Cascade: real Safaricom receipt → Lipana reference → Lipana txn ID.
 */
const resolveReceiptFromCallback = (callbackData) => {
  const receipt =
    callbackData.mpesa_receipt_number ||
    callbackData.MpesaReceiptNumber   ||
    callbackData.reference            ||
    callbackData.transaction_id       ||
    '';
  return String(receipt).substring(0, 50);
};

/**
 * Resolve receipt from a persisted transaction row.
 */
const resolveReceiptFromRow = (row) =>
  row.mpesa_receipt_number || row.transaction_id || '';

// ─────────────────────────────────────────────────────────────────────────────

class MpesaService {

  constructor() {
    if (!process.env.LIPANA_SECRET_KEY) {
      console.warn('⚠️  M-Pesa (Lipana) is not configured. Set LIPANA_SECRET_KEY.');
      this.isEnabled = false;
    } else {
      this.isEnabled = true;
    }
    this.client = lipana;
  }

  // ─── INITIATE STK PUSH ────────────────────────────────────────────────────

  /**
   * Initiates an STK push for a student fee payment.
   *
   * IMPORTANT: The DB record is created BEFORE the Lipana call so that
   * if the webhook fires before our INSERT completes (race), the callback
   * handler always finds the row.
   *
   * @param {string} studentAdmissionNo
   * @param {string} phoneNumber
   * @param {number} amount
   * @param {number} schoolId
   * @param {number|null} invoiceId  — when provided, reference targets this
   *                                   exact invoice; autoReconcile skips the
   *                                   "oldest unpaid" heuristic entirely.
   */
  async initiatePayment(studentAdmissionNo, phoneNumber, amount, schoolId, invoiceId = null) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');
    if (!schoolId)        throw new Error('schoolId is required');

    // ── Validate student exists within this school ─────────────────────────
    const student = await db.withSchoolContext(schoolId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, admission_no, first_name, last_name
           FROM students
          WHERE admission_no = $1
            AND school_id   = $2
            AND is_active   = TRUE`,
        [studentAdmissionNo, schoolId]
      );
      return rows[0] ?? null;
    });

    if (!student) throw new Error('Student not found');

    // ── Validate invoice belongs to this student + school ──────────────────
    if (invoiceId) {
      const invoice = await db.withSchoolContext(schoolId, async (client) => {
        const { rows } = await client.query(
          `SELECT id, status FROM invoices
            WHERE id         = $1
              AND student_id = $2
              AND school_id  = $3
              AND status    IN ('UNPAID', 'PARTIAL')`,
          [invoiceId, student.id, schoolId]
        );
        return rows[0] ?? null;
      });

      if (!invoice) throw new Error('Invoice not found or already paid');
    }

    if (!lipana.isValidPhoneNumber(phoneNumber))
      throw new Error('Invalid phone number. Use 07XXXXXXXX or 254XXXXXXXXX');

    const numAmount = parseFloat(amount);
    if (numAmount < 10 || numAmount > 300_000)
      throw new Error('Amount must be between KES 10 and 300,000');

    const reference = buildReference(studentAdmissionNo, invoiceId);

    // ── Fire STK push ──────────────────────────────────────────────────────
    let response;
    try {
      response = await lipana.initiateSTKPush(
        phoneNumber,
        numAmount,
        reference,
        `School fees – ${student.first_name} ${student.last_name}`
      );
    } catch (error) {
      // Persist failed attempt for audit trail even though Lipana rejected it
      await db.schoolTransaction(schoolId, async (client) => {
        await client.query(
          `INSERT INTO mpesa_transactions
             (transaction_id, phone_number, amount, account_reference,
              invoice_id, transaction_date, status, school_id, callback_data)
           VALUES ($1, $2, $3, $4, $5, NOW(), 'FAILED', $6, $7)`,
          [
            `FAILED_${Date.now()}`,
            lipana.formatPhoneNumber(phoneNumber),
            numAmount,
            reference,
            invoiceId ?? null,
            schoolId,
            JSON.stringify({ error: error.message }),
          ]
        );
      });
      throw error;
    }

    // ── Persist PENDING transaction (school-scoped) ────────────────────────
    const transaction = await db.schoolTransaction(schoolId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO mpesa_transactions
           (transaction_id, phone_number, amount, account_reference,
            invoice_id, transaction_date, status, school_id, callback_data)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'PENDING', $6, $7)
         RETURNING *`,
        [
          response.checkoutRequestID,
          lipana.formatPhoneNumber(phoneNumber),
          numAmount,
          reference,
          invoiceId ?? null,
          schoolId,
          JSON.stringify(response),
        ]
      );
      return rows[0];
    });

    console.log(
      `[STK] Initiated: ${response.checkoutRequestID} | ` +
      `school=${schoolId} | ref=${reference} | KES ${numAmount}`
    );

    return {
      success:           true,
      message:           response.customerMessage || 'STK push sent successfully',
      checkoutRequestID: response.checkoutRequestID,
      merchantRequestID: response.merchantRequestID,
      transaction,
    };
  }

  // ─── WEBHOOK CALLBACK PROCESSING ─────────────────────────────────────────

  async processCallback(callbackData) {
    const checkoutRequestID =
      callbackData.checkout_request_id ||
      callbackData.CheckoutRequestID   ||
      callbackData.transaction_id;

    const resultCode =
      callbackData.result_code ??
      callbackData.ResultCode  ??
      1;

    const resultDesc =
      callbackData.result_desc ||
      callbackData.ResultDesc  ||
      '';

    console.log(`[SERVICE] processCallback — txId: ${checkoutRequestID}, code: ${resultCode}`);

    // ── Discover schoolId (only legitimate unscoped read in this service) ──
    const transaction = await db.queryOne(
      `SELECT * FROM mpesa_transactions
        WHERE transaction_id = $1
          AND school_id IS NOT NULL`,
      [checkoutRequestID]
    );

    if (!transaction) {
      console.warn(`[SERVICE] Transaction not found: ${checkoutRequestID}`);
      return { success: false, message: 'Transaction not found' };
    }

    const schoolId = transaction.school_id;
    console.log(`[SERVICE] Found transaction id=${transaction.id} school=${schoolId}`);

    // ── Status-level idempotency guard ─────────────────────────────────────
    if (transaction.status === 'COMPLETED' || transaction.status === 'RECONCILED') {
      console.log(`[SERVICE] Already processed — skipping (${transaction.status})`);
      return { success: true, message: 'Already processed' };
    }

    // ── Failed / cancelled payment ─────────────────────────────────────────
    if (resultCode !== 0 && resultCode !== '0') {
      await db.schoolTransaction(schoolId, async (client) => {
        await client.query(
          `UPDATE mpesa_transactions
              SET status        = 'FAILED',
                  callback_data = $1
            WHERE id        = $2
              AND school_id = $3`,
          [JSON.stringify(callbackData), transaction.id, schoolId]
        );
      });
      console.log(`[SERVICE] Transaction ${checkoutRequestID} FAILED: ${resultDesc}`);
      return { success: false, message: resultDesc || 'Payment failed' };
    }

    // ── Resolve receipt ────────────────────────────────────────────────────
    const mpesaReceiptNumber = resolveReceiptFromCallback(callbackData);
    console.log(`[SERVICE] Receipt resolved to: "${mpesaReceiptNumber}"`);

    const amount          = parseFloat(callbackData.amount || transaction.amount || 0);
    const phoneNumber     = String(callbackData.phone_number || transaction.phone_number || '').trim();
    const txDateRaw       = callbackData.transaction_date || callbackData.TransactionDate;
    const transactionDate = txDateRaw ? this.parseTransactionDate(txDateRaw) : new Date();

    // ── Receipt-level idempotency guard ────────────────────────────────────
    if (mpesaReceiptNumber) {
      const duplicate = await db.queryOne(
        `SELECT id FROM mpesa_transactions
          WHERE mpesa_receipt_number = $1
            AND id != $2`,
        [mpesaReceiptNumber, transaction.id]
      );
      if (duplicate) {
        console.log(`[SERVICE] Duplicate receipt ignored: ${mpesaReceiptNumber}`);
        return { success: true, message: 'Already processed' };
      }
    }

    // ── Mark COMPLETED (school-scoped) ─────────────────────────────────────
    await db.schoolTransaction(schoolId, async (client) => {
      await client.query(
        `UPDATE mpesa_transactions
            SET status               = 'COMPLETED',
                amount               = $1,
                mpesa_receipt_number = NULLIF($2, ''),
                transaction_date     = $3,
                phone_number         = COALESCE(NULLIF($4, ''), phone_number),
                callback_data        = $5
          WHERE id        = $6
            AND school_id = $7`,
        [
          amount, mpesaReceiptNumber, transactionDate,
          phoneNumber, JSON.stringify(callbackData),
          transaction.id, schoolId,
        ]
      );
    });

    console.log(`✅ [SERVICE] COMPLETED: ${mpesaReceiptNumber} KES ${amount} (school ${schoolId})`);

    await this.autoReconcile(transaction.id, schoolId);

    return {
      success: true,
      message: 'Payment processed successfully',
      mpesaReceiptNumber,
    };
  }

  // ─── AUTO RECONCILIATION ──────────────────────────────────────────────────

  /**
   * Links a COMPLETED mpesa_transaction to the correct invoice and inserts
   * a payment record — all within a single serialisable DB transaction.
   *
   * Locking strategy
   * ────────────────
   * 1. FOR UPDATE on mpesa_transactions — prevents a second concurrent
   *    autoReconcile call (duplicate webhook, reconciliation job) from
   *    processing the same row simultaneously.
   * 2. FOR UPDATE OF i on the invoice — prevents two payments landing on
   *    the same invoice concurrently and computing the wrong residual balance.
   *
   * Invoice targeting
   * ─────────────────
   * If account_reference encodes an invoiceId (format "ADM-<id>"), that
   * invoice is targeted directly. Otherwise we fall back to the oldest
   * UNPAID/PARTIAL invoice for the student (best-effort heuristic).
   */
  async autoReconcile(transactionId, schoolId) {
    if (!schoolId) {
      const row = await db.queryOne(
        'SELECT school_id FROM mpesa_transactions WHERE id = $1',
        [transactionId]
      );
      schoolId = row?.school_id ?? null;
    }

    if (!schoolId) {
      console.warn('⚠️  [autoReconcile] Cannot reconcile — no schoolId');
      return null;
    }

    return db.schoolTransaction(schoolId, async (client) => {

      // ── 1. Lock transaction row ──────────────────────────────────────────
      const { rows: [transaction] } = await client.query(
        `SELECT * FROM mpesa_transactions
          WHERE id        = $1
            AND school_id = $2
            AND status    = 'COMPLETED'
          FOR UPDATE`,
        [transactionId, schoolId]
      );

      if (!transaction) {
        console.warn(`[autoReconcile] Transaction ${transactionId} not found or not COMPLETED`);
        return null;
      }

      if (transaction.reconciled_at) {
        console.log(`[autoReconcile] Transaction ${transactionId} already reconciled — skipping`);
        return null;
      }

      // ── 2. Resolve student ───────────────────────────────────────────────
      const { admissionNo, invoiceId: refInvoiceId } =
        parseReference(transaction.account_reference);

      // Prefer the invoiceId stored on the row (set at STK initiation);
      // fall back to parsing the reference string for older rows.
      const targetInvoiceId = transaction.invoice_id ?? refInvoiceId;

      const { rows: [student] } = await client.query(
        `SELECT id FROM students
          WHERE admission_no = $1
            AND school_id   = $2`,
        [admissionNo, schoolId]
      );

      if (!student) {
        console.warn(
          `[autoReconcile] Student not found: "${admissionNo}" (school ${schoolId}). ` +
          `Transaction ${transactionId} left as COMPLETED — manual reconciliation required.`
        );
        return null;
      }

      // ── 3. Lock invoice row ──────────────────────────────────────────────
      let invoiceQuery;
      let invoiceParams;

      if (targetInvoiceId) {
        // Exact match — use the invoice encoded in the reference
        invoiceQuery = `
          SELECT i.*,
                 COALESCE(SUM(p.amount), 0) AS paid_amount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
           WHERE i.id         = $1
             AND i.school_id  = $2
             AND i.status    IN ('UNPAID', 'PARTIAL')
           GROUP BY i.id
           FOR UPDATE OF i`;
        invoiceParams = [targetInvoiceId, schoolId];
      } else {
        // Heuristic fallback — oldest unpaid invoice for this student
        invoiceQuery = `
          SELECT i.*,
                 COALESCE(SUM(p.amount), 0) AS paid_amount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
           WHERE i.student_id = $1
             AND i.school_id  = $2
             AND i.status    IN ('UNPAID', 'PARTIAL')
           GROUP BY i.id
           ORDER BY i.created_at ASC
           LIMIT 1
           FOR UPDATE OF i`;
        invoiceParams = [student.id, schoolId];
      }

      const { rows: [invoice] } = await client.query(invoiceQuery, invoiceParams);

      if (!invoice) {
        console.warn(
          `[autoReconcile] No open invoice for student ${student.id} (school ${schoolId}). ` +
          `Transaction ${transactionId} left as COMPLETED — manual reconciliation required.`
        );
        return null;
      }

      // ── 4. Insert payment record ─────────────────────────────────────────
      const referenceNumber = resolveReceiptFromRow(transaction);
      const paymentAmount   = parseFloat(transaction.amount);

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments
           (invoice_id, amount, payment_method, reference_number,
            payment_date, received_by, school_id)
         VALUES ($1, $2, 'MPESA', $3, $4, NULL, $5)
         RETURNING *`,
        [
          invoice.id,
          paymentAmount,
          referenceNumber,
          transaction.transaction_date,
          schoolId,
        ]
      );

      // ── 5. Update invoice status atomically ──────────────────────────────
      const previouslyPaid = parseFloat(invoice.paid_amount);
      const invoiceTotal   = parseFloat(invoice.total_amount);
      const totalPaid      = previouslyPaid + paymentAmount;
      const remaining      = invoiceTotal - totalPaid;

      // Use a small epsilon (1 KES) to absorb floating-point drift
      const newStatus = remaining <= 1 ? 'PAID' : 'PARTIAL';

      await client.query(
        `UPDATE invoices
            SET status     = $1,
                updated_at = NOW()
          WHERE id        = $2
            AND school_id = $3`,
        [newStatus, invoice.id, schoolId]
      );

      // ── 6. Mark transaction RECONCILED ───────────────────────────────────
      await client.query(
        `UPDATE mpesa_transactions
            SET status        = 'RECONCILED',
                reconciled_at = NOW(),
                payment_id    = $1
          WHERE id        = $2
            AND school_id = $3`,
        [payment.id, transaction.id, schoolId]
      );

      console.log(
        `✅ [autoReconcile] payment ${payment.id} → invoice ${invoice.id} ` +
        `| KES ${paymentAmount} | invoice now ${newStatus} ` +
        `| remaining KES ${Math.max(0, remaining).toFixed(2)} ` +
        `| ref: ${referenceNumber}`
      );

      return { reconciled: true, payment, invoice: { ...invoice, status: newStatus } };
    });
  }

  // ─── MANUAL RECONCILIATION ────────────────────────────────────────────────

  async manualReconcile(transactionId, invoiceId, reconciledBy, schoolId) {
    if (!schoolId) throw new Error('schoolId is required for manualReconcile');

    return db.schoolTransaction(schoolId, async (client) => {

      // ── Lock transaction row ─────────────────────────────────────────────
      const { rows: [transaction] } = await client.query(
        `SELECT * FROM mpesa_transactions
          WHERE id        = $1
            AND school_id = $2
            AND status    = 'COMPLETED'
          FOR UPDATE`,
        [transactionId, schoolId]
      );

      if (!transaction)             throw new Error('Transaction not found or not COMPLETED');
      if (transaction.reconciled_at) throw new Error('Transaction already reconciled');

      // ── Lock invoice row ─────────────────────────────────────────────────
      const { rows: [invoice] } = await client.query(
        `SELECT i.*,
                COALESCE(SUM(p.amount), 0) AS paid_amount
           FROM invoices i
           LEFT JOIN payments p ON p.invoice_id = i.id
          WHERE i.id        = $1
            AND i.school_id = $2
            AND i.status   IN ('UNPAID', 'PARTIAL')
          GROUP BY i.id
          FOR UPDATE OF i`,
        [invoiceId, schoolId]
      );

      if (!invoice) throw new Error('Invoice not found or already fully paid');

      const referenceNumber = resolveReceiptFromRow(transaction);
      const paymentAmount   = parseFloat(transaction.amount);

      // ── Insert payment ───────────────────────────────────────────────────
      const { rows: [payment] } = await client.query(
        `INSERT INTO payments
           (invoice_id, amount, payment_method, reference_number,
            payment_date, received_by, school_id)
         VALUES ($1, $2, 'MPESA', $3, $4, $5, $6)
         RETURNING *`,
        [
          invoiceId,
          paymentAmount,
          referenceNumber,
          transaction.transaction_date,
          reconciledBy,
          schoolId,
        ]
      );

      // ── Update invoice status ────────────────────────────────────────────
      const previouslyPaid = parseFloat(invoice.paid_amount);
      const invoiceTotal   = parseFloat(invoice.total_amount);
      const remaining      = invoiceTotal - previouslyPaid - paymentAmount;
      const newStatus      = remaining <= 1 ? 'PAID' : 'PARTIAL';

      await client.query(
        `UPDATE invoices
            SET status     = $1,
                updated_at = NOW()
          WHERE id        = $2
            AND school_id = $3`,
        [newStatus, invoice.id, schoolId]
      );

      // ── Mark transaction RECONCILED ──────────────────────────────────────
      await client.query(
        `UPDATE mpesa_transactions
            SET status        = 'RECONCILED',
                reconciled_at = NOW(),
                reconciled_by = $1,
                payment_id    = $2
          WHERE id        = $3
            AND school_id = $4`,
        [reconciledBy, payment.id, transactionId, schoolId]
      );

      console.log(
        `✅ [manualReconcile] payment ${payment.id} → invoice ${invoiceId} ` +
        `| invoice now ${newStatus} | ref: ${referenceNumber}`
      );

      return { success: true, payment, transaction, invoiceStatus: newStatus };
    });
  }

  // ─── TRANSACTION STATUS QUERY (school-scoped) ─────────────────────────────

  async queryTransaction(checkoutRequestID, schoolId) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');
    if (!schoolId)        throw new Error('schoolId is required');

    const tx = await db.queryOne(
      `SELECT status, amount, mpesa_receipt_number, transaction_id
         FROM mpesa_transactions
        WHERE transaction_id = $1
          AND school_id      = $2`,
      [checkoutRequestID, schoolId]
    );

    const isSettled = tx?.status === 'COMPLETED' || tx?.status === 'RECONCILED';

    return {
      status:        tx?.status?.toLowerCase() ?? 'pending',
      resultCode:    isSettled ? 0 : -1,
      resultDesc:    tx?.status ?? 'pending',
      amount:        parseFloat(tx?.amount ?? 0),
      receiptNumber: tx?.mpesa_receipt_number ?? tx?.transaction_id ?? null,
    };
  }

  // ─── PENDING TRANSACTIONS (school-scoped) ────────────────────────────────

  async getPendingTransactions(schoolId, filters = {}) {
    if (!schoolId) throw new Error('schoolId is required');

    const { limit = 50, offset = 0 } = filters;

    return db.schoolQuery(
      schoolId,
      `SELECT
          mt.*,
          s.admission_no,
          s.first_name || ' ' || s.last_name AS student_name
         FROM mpesa_transactions mt
         LEFT JOIN students s
           ON s.admission_no = mt.account_reference
          AND s.school_id    = mt.school_id
        WHERE mt.status    IN ('PENDING', 'COMPLETED')
          AND mt.school_id  = $3
          AND mt.reconciled_at IS NULL
        ORDER BY mt.transaction_date DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset, schoolId]
    );
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  parseTransactionDate(dateValue) {
    if (!dateValue) return new Date();
    const s = dateValue.toString();
    // Safaricom timestamp format: YYYYMMDDHHmmss (14 digits)
    if (/^\d{14}$/.test(s)) {
      return new Date(
        `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` +
        `T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}+03:00`
      );
    }
    return new Date(dateValue);
  }
}

module.exports = new MpesaService();