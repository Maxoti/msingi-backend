

/**
 * M-Pesa Service — Lipana Edition
 * File: src/shared/integrations/mpesa/mpesa.service.js
 *
 * Architecture notes:
 * ─────────────────────────────────────────────────────────────────────────────
 * • Multi-tenant: every read/write is scoped to a schoolId.
 * • processCallback uses an unscoped db.queryOne ONLY to discover the schoolId
 *   from the transaction record, then immediately switches to school-scoped
 *   operations for all subsequent writes.
 * • RLS on mpesa_transactions is a defence-in-depth layer. We never rely on it
 *   exclusively — every query that can carry an explicit school_id filter does.
 * • Reference number resolution order:
 *     1. MpesaReceiptNumber  — real Safaricom receipt (production)
 *     2. callbackData.reference — Lipana sends "STK-TXNxxx" here
 *     3. callbackData.transaction_id — Lipana internal ID (sandbox fallback)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const lipana = require('./mpesa-client');
const db     = require('../../database/client');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the best available payment reference from a callback payload.
 * Lipana sandbox never sends MpesaReceiptNumber, so we cascade through
 * available fields to ensure reference_number is never stored as empty.
 */
const resolveReceiptFromCallback = (callbackData) =>
  String(
    callbackData.mpesa_receipt_number ||
    callbackData.MpesaReceiptNumber   ||
    callbackData.reference            ||
    callbackData.transaction_id       ||
    ''
  ).substring(0, 50);

/**
 * Resolve the best available reference from a persisted transaction row.
 * Used during reconciliation when the callback has already been processed.
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

  // ─── INITIATE STK PUSH ───────────────────────────────────────────────────

  async initiatePayment(studentAdmissionNo, phoneNumber, amount, schoolId) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');
    if (!schoolId)        throw new Error('schoolId is required');

    // Verify student exists within this school
    const student = await db.withSchoolContext(schoolId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, admission_no, first_name, last_name
           FROM students
          WHERE admission_no = $1
            AND school_id   = $2
            AND is_active   = TRUE`,
        [studentAdmissionNo, schoolId]
      );
      return rows[0] || null;
    });

    if (!student) throw new Error('Student not found');

    if (!lipana.isValidPhoneNumber(phoneNumber))
      throw new Error('Invalid phone number. Use 07XXXXXXXX or 254XXXXXXXXX');

    const numAmount = parseFloat(amount);
    if (numAmount < 10 || numAmount > 300_000)
      throw new Error('Amount must be between KES 10 and 300,000');

    // Initiate STK push via Lipana
    let response;
    try {
      response = await lipana.initiateSTKPush(
        phoneNumber,
        numAmount,
        studentAdmissionNo,
        `School fees — ${student.first_name} ${student.last_name}`
      );
    } catch (error) {
      // Record the failed attempt for audit trail
      await db.schoolTransaction(schoolId, async (client) => {
        await client.query(
          `INSERT INTO mpesa_transactions
             (transaction_id, phone_number, amount, account_reference,
              transaction_date, status, school_id, callback_data)
           VALUES ($1, $2, $3, $4, NOW(), 'FAILED', $5, $6)`,
          [
            `FAILED_${Date.now()}`,
            lipana.formatPhoneNumber(phoneNumber),
            numAmount,
            studentAdmissionNo,
            schoolId,
            JSON.stringify({ error: error.message }),
          ]
        );
      });
      throw error;
    }

    // Persist pending transaction scoped to this school
    const transaction = await db.schoolTransaction(schoolId, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO mpesa_transactions
           (transaction_id, phone_number, amount, account_reference,
            transaction_date, status, school_id, callback_data)
         VALUES ($1, $2, $3, $4, NOW(), 'PENDING', $5, $6)
         RETURNING *`,
        [
          response.checkoutRequestID,
          lipana.formatPhoneNumber(phoneNumber),
          numAmount,
          studentAdmissionNo,
          schoolId,
          JSON.stringify(response),
        ]
      );
      return rows[0];
    });

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
    // Resolve transaction identifier — Lipana uses transaction_id field
    const checkoutRequestID =
      callbackData.checkout_request_id ||
      callbackData.CheckoutRequestID   ||
      callbackData.transaction_id;

    const resultCode =
      callbackData.result_code  ??
      callbackData.ResultCode   ??
      1;

    const resultDesc =
      callbackData.result_desc ||
      callbackData.ResultDesc  ||
      '';

    console.log(`[SERVICE] processCallback — txId: ${checkoutRequestID}, code: ${resultCode}`);

    // ── 1. Fetch transaction (unscoped — no schoolId in webhook context) ─────
    //    This is the only legitimate use of an unscoped query in this service.
    //    All subsequent operations are scoped to the discovered schoolId.
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

    // ── 2. Idempotency guard — status-level ───────────────────────────────────
    if (transaction.status === 'COMPLETED' || transaction.status === 'RECONCILED') {
      console.log(`[SERVICE] Already processed — skipping (${transaction.status})`);
      return { success: true, message: 'Already processed' };
    }

    // ── 3. Handle failed / cancelled payment ──────────────────────────────────
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

    // ── 4. Resolve receipt reference ──────────────────────────────────────────
    const mpesaReceiptNumber = resolveReceiptFromCallback(callbackData);
    console.log(`[SERVICE] Receipt resolved to: "${mpesaReceiptNumber}"`);

    const amount          = parseFloat(callbackData.amount || transaction.amount || 0);
    const phoneNumber     = String(callbackData.phone_number || transaction.phone_number || '').trim();
    const txDateRaw       = callbackData.transaction_date || callbackData.TransactionDate;
    const transactionDate = txDateRaw ? this.parseTransactionDate(txDateRaw) : new Date();

    // ── 5. Idempotency guard — receipt-level ──────────────────────────────────
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

    // ── 6. Mark transaction COMPLETED (school-scoped) ─────────────────────────
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

    // ── 7. Auto-reconcile to invoice ──────────────────────────────────────────
    await this.autoReconcile(transaction.id, schoolId);

    return {
      success: true,
      message: 'Payment processed successfully',
      mpesaReceiptNumber,
    };
  }

  // ─── AUTO RECONCILIATION ─────────────────────────────────────────────────

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

      // Fetch the COMPLETED transaction — scoped to school
      const { rows: [transaction] } = await client.query(
        `SELECT * FROM mpesa_transactions
          WHERE id        = $1
            AND school_id = $2
            AND status    = 'COMPLETED'`,
        [transactionId, schoolId]
      );

      if (!transaction) {
        console.warn(`[autoReconcile] Transaction ${transactionId} not found or not COMPLETED`);
        return null;
      }

      if (transaction.reconciled_at) {
        console.log(`[autoReconcile] Transaction ${transactionId} already reconciled`);
        return null;
      }

      // Find student — explicitly scoped to school
      const { rows: [student] } = await client.query(
        `SELECT id FROM students
          WHERE admission_no = $1
            AND school_id   = $2`,
        [transaction.account_reference, schoolId]
      );

      if (!student) {
        console.warn(`[autoReconcile] Student not found: ${transaction.account_reference} (school ${schoolId})`);
        return null;
      }

      // Find oldest unpaid invoice — explicitly scoped to school
      const { rows: [invoice] } = await client.query(
        `SELECT i.*,
                COALESCE(SUM(p.amount), 0) AS paid_amount
           FROM invoices i
           LEFT JOIN payments p ON p.invoice_id = i.id
          WHERE i.student_id = $1
            AND i.school_id  = $2
            AND i.status IN ('UNPAID', 'PARTIAL')
          GROUP BY i.id
          ORDER BY i.created_at ASC
          LIMIT 1`,
        [student.id, schoolId]
      );

      if (!invoice) {
        console.warn(`[autoReconcile] No open invoice for student ${student.id} (school ${schoolId})`);
        return null;
      }

      // Resolve reference — never store empty
      const referenceNumber = resolveReceiptFromRow(transaction);

      // Create payment record — scoped to school
      const { rows: [payment] } = await client.query(
        `INSERT INTO payments
           (invoice_id, amount, payment_method, reference_number,
            payment_date, received_by, school_id)
         VALUES ($1, $2, 'MPESA', $3, $4, NULL, $5)
         RETURNING *`,
        [
          invoice.id,
          transaction.amount,
          referenceNumber,
          transaction.transaction_date,
          schoolId,
        ]
      );

      // Mark transaction RECONCILED
      await client.query(
        `UPDATE mpesa_transactions
            SET status        = 'RECONCILED',
                reconciled_at = NOW(),
                payment_id    = $1
          WHERE id        = $2
            AND school_id = $3`,
        [payment.id, transaction.id, schoolId]
      );

      console.log(`✅ [autoReconcile] payment ${payment.id} → invoice ${invoice.id} (ref: ${referenceNumber})`);
      return { reconciled: true, payment, invoice };
    });
  }

  // ─── MANUAL RECONCILIATION ───────────────────────────────────────────────

  async manualReconcile(transactionId, invoiceId, reconciledBy, schoolId) {
    if (!schoolId) throw new Error('schoolId is required for manualReconcile');

    return db.schoolTransaction(schoolId, async (client) => {

      // Lock transaction row — scoped to school
      const { rows: [transaction] } = await client.query(
        `SELECT * FROM mpesa_transactions
          WHERE id        = $1
            AND school_id = $2
            AND status    = 'COMPLETED'
          FOR UPDATE`,
        [transactionId, schoolId]
      );

      if (!transaction)            throw new Error('Transaction not found or not COMPLETED');
      if (transaction.reconciled_at) throw new Error('Transaction already reconciled');

      // Lock invoice row — scoped to school
      const { rows: [invoice] } = await client.query(
        `SELECT * FROM invoices
          WHERE id        = $1
            AND school_id = $2
          FOR UPDATE`,
        [invoiceId, schoolId]
      );

      if (!invoice) throw new Error('Invoice not found');

      const referenceNumber = resolveReceiptFromRow(transaction);

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments
           (invoice_id, amount, payment_method, reference_number,
            payment_date, received_by, school_id)
         VALUES ($1, $2, 'MPESA', $3, $4, $5, $6)
         RETURNING *`,
        [
          invoiceId,
          transaction.amount,
          referenceNumber,
          transaction.transaction_date,
          reconciledBy,
          schoolId,
        ]
      );

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

      console.log(`✅ [manualReconcile] payment ${payment.id} → invoice ${invoiceId} (ref: ${referenceNumber})`);
      return { success: true, payment, transaction };
    });
  }

  // ─── TRANSACTION STATUS QUERY ─────────────────────────────────────────────

  async queryTransaction(checkoutRequestID) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');

    const tx = await db.queryOne(
      `SELECT status, amount, mpesa_receipt_number, transaction_id
         FROM mpesa_transactions
        WHERE transaction_id = $1`,
      [checkoutRequestID]
    );

    const isSettled = tx?.status === 'COMPLETED' || tx?.status === 'RECONCILED';

    return {
      status:        tx?.status?.toLowerCase() || 'pending',
      resultCode:    isSettled ? 0 : -1,
      resultDesc:    tx?.status || 'pending',
      amount:        parseFloat(tx?.amount || 0),
      receiptNumber: tx?.mpesa_receipt_number || tx?.transaction_id || null,
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
    // Safaricom format: YYYYMMDDHHmmss (14 digits)
    if (s.length === 14) {
      return new Date(
        `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` +
        `T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}+03:00`
      );
    }
    return new Date(dateValue);
  }
}

module.exports = new MpesaService();
