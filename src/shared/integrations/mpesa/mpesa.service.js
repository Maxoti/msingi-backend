/**
 * M-Pesa Service
 * Business logic for M-Pesa payment processing
 */

const MpesaClient = require('./mpesa-client');
const getMpesaConfig = require('./mpesa.config');
const db = require('../../database/client');

class MpesaService {
  constructor() {
    const config = getMpesaConfig();

    if (!config.isConfigured) {
      console.warn('⚠️  M-Pesa is not configured. Set MPESA_* environment variables.');
      this.client = null;
      this.isEnabled = false;
    } else {
      this.client = new MpesaClient(config);
      this.isEnabled = true;
    }
  }

  // ─── WHY NO _setSchoolContext ─────────────────────────────────────────────
  // The old implementation called db.query() which grabbed a random pool
  // connection, set app.current_school_id on it, then released it. Every
  // subsequent db.queryOne/queryAll call got a DIFFERENT connection with no
  // context set — so the stamp_school_id trigger always fired with null.
  //
  // Fix: use db.schoolTransaction(schoolId, fn) or db.withSchoolContext(schoolId, fn).
  // Both check out a dedicated client, set the context on it, run your queries,
  // then release — guaranteeing all queries share the same connection and context.

  // ─── INITIATING PAYMENT ──────────────────────────────────────────────────

  /**
   * Initiate STK Push for student fee payment.
   *
   * @param {string}        studentAdmissionNo
   * @param {string}        phoneNumber
   * @param {number}        amount
   * @param {string|number} schoolId  – required; passed from route for RLS
   */
  async initiatePayment(studentAdmissionNo, phoneNumber, amount, schoolId) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');
    if (!schoolId)        throw new Error('schoolId is required to initiate payment');

    // Validate student — pinned client so the school context is set for RLS
    const student = await db.withSchoolContext(schoolId, async (client) => {
      const res = await client.query(
        `SELECT id, admission_no, first_name, last_name
         FROM students
         WHERE admission_no = $1 AND is_active = TRUE`,
        [studentAdmissionNo]
      );
      return res.rows[0] || null;
    });

    if (!student) throw new Error('Student not found');

    if (!this.client.isValidPhoneNumber(phoneNumber)) {
      throw new Error('Invalid phone number format. Use 07XXXXXXXX or 254XXXXXXXXX');
    }

    const numAmount = parseFloat(amount);
    if (numAmount < 1 || numAmount > 300000) {
      throw new Error('Amount must be between 1 and 300,000 KES');
    }

    // External API call — intentionally outside any DB transaction so a
    // Safaricom timeout doesn't hold an open DB connection.
    let response;
    try {
      response = await this.client.initiateSTKPush(
        phoneNumber,
        numAmount,
        studentAdmissionNo,
        `School fees for ${student.first_name} ${student.last_name}`
      );
    } catch (error) {
      // Record the failed attempt for auditability
      await db.schoolTransaction(schoolId, async (client) => {
        await client.query(
          `INSERT INTO mpesa_transactions (
            transaction_id, phone_number, amount, account_reference,
            transaction_date, status, school_id, callback_data
          ) VALUES ($1, $2, $3, $4, NOW(), 'FAILED', $5, $6)`,
          [
            `FAILED_${Date.now()}`,
            this.client.formatPhoneNumber(phoneNumber),
            numAmount,
            studentAdmissionNo,
            schoolId,
            JSON.stringify({ error: error.message }),
          ]
        );
      });
      throw error;
    }

    // Persist the pending transaction.
    // school_id is stored here so processCallback can recover it later
    // without a session token (Safaricom callbacks have no auth).
    const transaction = await db.schoolTransaction(schoolId, async (client) => {
      const res = await client.query(
        `INSERT INTO mpesa_transactions (
          transaction_id, phone_number, amount, account_reference,
          transaction_date, status, school_id, callback_data
        ) VALUES ($1, $2, $3, $4, NOW(), 'PENDING', $5, $6)
        RETURNING *`,
        [
          response.checkoutRequestID,
          this.client.formatPhoneNumber(phoneNumber),
          numAmount,
          studentAdmissionNo,
          schoolId,
          JSON.stringify(response),
        ]
      );
      return res.rows[0];
    });

    return {
      success: true,
      message: response.customerMessage || 'STK push sent successfully',
      checkoutRequestID: response.checkoutRequestID,
      merchantRequestID: response.merchantRequestID,
      transaction,
    };
  }

  // ─── CALLBACK PROCESSING ─────────────────────────────────────────────────

  /**
   * Process M-Pesa callback from Safaricom.
   *
   * Safaricom callbacks carry no auth token so schoolId is not in the request.
   * We recover it by reading the pending transaction row written during
   * initiatePayment. The postgres role has Bypass RLS so the plain SELECT works
   * without context. All subsequent writes use schoolTransaction so the
   * stamp_school_id trigger is satisfied.
   */
  async processCallback(callbackData) {
    const stkCallback       = callbackData.Body.stkCallback;
    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode        = stkCallback.ResultCode;
    const resultDesc        = stkCallback.ResultDesc;

    // postgres role has Bypass RLS — safe to query without school context
    let transaction = await db.queryOne(
      'SELECT * FROM mpesa_transactions WHERE transaction_id = $1',
      [checkoutRequestID]
    );

    const schoolId = transaction?.school_id ?? null;

    if (!transaction) {
      // Edge case: callback arrived with no matching STK push row.
      // school_id is NULL — allowed after the stamp_school_id trigger fix
      // (trigger now skips stamping when NEW.school_id IS NOT NULL, and
      // allows NULL through for these orphan placeholder rows).
      transaction = await db.transaction(async (client) => {
        const res = await client.query(
          `INSERT INTO mpesa_transactions (
            transaction_id, phone_number, amount,
            transaction_date, status, school_id, callback_data
          ) VALUES ($1, '', 0, NOW(), 'PENDING', NULL, $2)
          RETURNING *`,
          [checkoutRequestID, JSON.stringify(callbackData)]
        );
        return res.rows[0];
      });
    }

    if (resultCode === 0) {
      // Successful payment — extract metadata items into a plain object
      const metadata = {};
      stkCallback.CallbackMetadata.Item.forEach((item) => {
        metadata[item.Name] = item.Value;
      });

      const mpesaReceiptNumber = metadata.MpesaReceiptNumber?.toString().substring(0, 50);
      const transactionDate    = this.parseTransactionDate(metadata.TransactionDate);
      const phoneNumber        = metadata.PhoneNumber?.toString();
      const amount             = metadata.Amount;

      const updateFn = async (client) => {
        await client.query(
          `UPDATE mpesa_transactions SET
            status               = 'COMPLETED',
            amount               = $1,
            mpesa_receipt_number = $2,
            transaction_date     = $3,
            phone_number         = COALESCE($4, phone_number),
            callback_data        = $5
          WHERE id = $6`,
          [amount, mpesaReceiptNumber, transactionDate, phoneNumber, JSON.stringify(callbackData), transaction.id]
        );
      };

      schoolId
        ? await db.schoolTransaction(schoolId, updateFn)
        : await db.transaction(updateFn);

      await this.autoReconcile(transaction.id, schoolId);

      return { success: true, message: 'Payment processed successfully', mpesaReceiptNumber };

    } else {
      // Failed or cancelled payment
      const updateFn = async (client) => {
        await client.query(
          `UPDATE mpesa_transactions SET status = 'FAILED', callback_data = $1 WHERE id = $2`,
          [JSON.stringify(callbackData), transaction.id]
        );
      };

      schoolId
        ? await db.schoolTransaction(schoolId, updateFn)
        : await db.transaction(updateFn);

      return { success: false, message: resultDesc || 'Payment failed' };
    }
  }

  // ─── AUTO RECONCILIATION ─────────────────────────────────────────────────

  /**
   * Auto-reconcile a completed transaction to the student's oldest outstanding
   * invoice. All reads and writes share a single pinned client inside
   * schoolTransaction so RLS is consistently satisfied throughout.
   *
   * @param {number}        transactionId  – internal PK of mpesa_transactions
   * @param {string|number} [schoolId]     – passed through from processCallback
   */
  async autoReconcile(transactionId, schoolId) {
    // Fall back to a DB lookup if schoolId wasn't passed through
    if (!schoolId) {
      const row = await db.queryOne(
        'SELECT school_id FROM mpesa_transactions WHERE id = $1',
        [transactionId]
      );
      schoolId = row?.school_id ?? null;
    }

    const reconcile = async (client) => {
      const { rows: [transaction] } = await client.query(
        `SELECT * FROM mpesa_transactions WHERE id = $1 AND status = 'COMPLETED'`,
        [transactionId]
      );

      if (!transaction || transaction.reconciled_at) return null;

      const { rows: [student] } = await client.query(
        `SELECT id FROM students WHERE admission_no = $1`,
        [transaction.account_reference]
      );

      if (!student) return null;

      const { rows: [invoice] } = await client.query(
        `SELECT i.*, COALESCE(SUM(p.amount), 0) AS paid_amount
         FROM invoices i
         LEFT JOIN payments p ON i.id = p.invoice_id
         WHERE i.student_id = $1 AND i.status IN ('UNPAID', 'PARTIAL')
         GROUP BY i.id
         ORDER BY i.created_at ASC
         LIMIT 1`,
        [student.id]
      );

      if (!invoice) return null;

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments (
          invoice_id, amount, payment_method, reference_number, payment_date, received_by
        ) VALUES ($1, $2, 'MPESA', $3, $4, NULL)
        RETURNING *`,
        [invoice.id, transaction.amount, transaction.mpesa_receipt_number, transaction.transaction_date]
      );

      await client.query(
        `UPDATE mpesa_transactions SET
          status        = 'RECONCILED',
          reconciled_at = NOW(),
          payment_id    = $1
        WHERE id = $2`,
        [payment.id, transaction.id]
      );

      return { reconciled: true, payment, invoice };
    };

    if (schoolId) {
      return db.schoolTransaction(schoolId, reconcile);
    } else {
      console.warn('⚠️  [autoReconcile] No schoolId — using unscoped transaction');
      return db.transaction(reconcile);
    }
  }

  // ─── MANUAL RECONCILIATION ───────────────────────────────────────────────

  /**
   * Admin-triggered reconciliation of a specific transaction to a specific invoice.
   *
   * @param {number}        transactionId
   * @param {number}        invoiceId
   * @param {number}        reconciledBy  – user ID of the admin
   * @param {string|number} schoolId      – required for RLS
   */
  async manualReconcile(transactionId, invoiceId, reconciledBy, schoolId) {
    if (!schoolId) throw new Error('schoolId is required for manualReconcile');

    return db.schoolTransaction(schoolId, async (client) => {
      const { rows: txRows } = await client.query(
        `SELECT * FROM mpesa_transactions WHERE id = $1 AND status = 'COMPLETED' FOR UPDATE`,
        [transactionId]
      );

      if (txRows.length === 0)     throw new Error('Transaction not found or not completed');
      if (txRows[0].reconciled_at) throw new Error('Transaction already reconciled');

      const { rows: invRows } = await client.query(
        `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );

      if (invRows.length === 0) throw new Error('Invoice not found');

      const { rows: [payment] } = await client.query(
        `INSERT INTO payments (
          invoice_id, amount, payment_method, reference_number, payment_date, received_by
        ) VALUES ($1, $2, 'MPESA', $3, $4, $5)
        RETURNING *`,
        [invoiceId, txRows[0].amount, txRows[0].mpesa_receipt_number, txRows[0].transaction_date, reconciledBy]
      );

      await client.query(
        `UPDATE mpesa_transactions SET
          status        = 'RECONCILED',
          reconciled_at = NOW(),
          reconciled_by = $1,
          payment_id    = $2
        WHERE id = $3`,
        [reconciledBy, payment.id, transactionId]
      );

      return { success: true, payment, transaction: txRows[0] };
    });
  }

  // ─── TRANSACTION QUERY ───────────────────────────────────────────────────

  /**
   * Query STK Push status directly from Safaricom.
   * Updates the local record if Safaricom confirms completion.
   */
  async queryTransaction(checkoutRequestID) {
    if (!this.isEnabled) throw new Error('M-Pesa is not configured');

    const result = await this.client.querySTKPush(checkoutRequestID);

    // Update by transaction_id PK — postgres role bypasses RLS so no context needed
    if (result.resultCode === '0') {
      await db.query(
        `UPDATE mpesa_transactions SET status = 'COMPLETED'
         WHERE transaction_id = $1 AND status = 'PENDING'`,
        [checkoutRequestID]
      );
    }

    return result;
  }

  // ─── PENDING TRANSACTIONS ────────────────────────────────────────────────

  /**
   * Get unreconciled transactions for a school.
   *
   * @param {string|number} schoolId
   * @param {object}        [filters]
   */
  async getPendingTransactions(schoolId, filters = {}) {
    const { limit = 50, offset = 0 } = filters;

    return db.schoolQuery(
      schoolId,
      `SELECT
        mt.*,
        s.admission_no,
        s.first_name || ' ' || s.last_name AS student_name
       FROM mpesa_transactions mt
       LEFT JOIN students s ON mt.account_reference = s.admission_no
       WHERE mt.status IN ('PENDING', 'COMPLETED')
         AND mt.reconciled_at IS NULL
       ORDER BY mt.transaction_date DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  /**
   * Parse M-Pesa transaction date from YYYYMMDDHHMMSS integer format.
   */
  parseTransactionDate(dateNumber) {
    const s = dateNumber.toString();
    return new Date(
      `${s.substring(0, 4)}-${s.substring(4, 6)}-${s.substring(6, 8)}` +
      `T${s.substring(8, 10)}:${s.substring(10, 12)}:${s.substring(12, 14)}Z`
    );
  }
}

module.exports = new MpesaService();