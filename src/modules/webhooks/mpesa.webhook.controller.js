/**
 * M-Pesa Webhook Controller
 * Handles incoming M-Pesa STK Push callbacks from Safaricom
 *
 * Exports: handleCallback, handleValidation, handleConfirmation
 * These are called by webhook.routes.js
 *
 * ⚠️  CRITICAL RULE: Always return HTTP 200 to Safaricom.
 *     If we return anything else, Safaricom retries indefinitely.
 */

'use strict';

const db = require('../../shared/database/client');

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

/** Extract a value from M-Pesa CallbackMetadata items array */
const getMeta = (items = [], name) =>
  items.find(i => i.Name === name)?.Value ?? null;

/**
 * Parse M-Pesa transaction date (format: YYYYMMDDHHmmss → Date)
 * e.g. 20250127120000
 */
const parseMpesaDate = (raw) => {
  const s = String(raw ?? '');
  if (s.length !== 14) return new Date();
  return new Date(
    `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` +
    `T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`
  );
};

/**
 * Resolve school_id using multiple strategies, in priority order:
 *
 *  1. AccountReference contains "SCH{id}"  → parse directly
 *  2. AccountReference is a numeric string → treat as school_id
 *  3. Phone number matches a parent_contact → use that student's school_id
 *  4. Phone number matches a staff member   → use that staff member's school_id
 *  5. Fall back to null (transaction stored without school — FK will fail,
 *     but we catch and log rather than crashing Safaricom's callback)
 *
 * @param {string|null} accountRef  - AccountReference from callback metadata
 * @param {string|null} phoneNumber - PhoneNumber from callback metadata
 * @returns {Promise<number|null>}
 */
const resolveSchoolId = async (accountRef, phoneNumber) => {
  // Strategy 1 — explicit "SCH{id}" prefix in AccountReference
  if (accountRef) {
    const schMatch = String(accountRef).match(/SCH(\d+)/i);
    if (schMatch) return parseInt(schMatch[1], 10);

    // Strategy 2 — AccountReference is purely numeric (school_id itself)
    const numericRef = String(accountRef).trim();
    if (/^\d+$/.test(numericRef)) return parseInt(numericRef, 10);
  }

  // Strategy 3 — look up phone in parent_contacts
  if (phoneNumber) {
    const phone = String(phoneNumber).trim();

    try {
      const parentRow = await db.queryOne(
        `SELECT s.school_id
         FROM parent_contacts pc
         JOIN students s ON s.id = pc.student_id
         WHERE pc.phone = $1
         LIMIT 1`,
        [phone]
      );
      if (parentRow?.school_id) return parentRow.school_id;
    } catch {
      // table may not exist in all environments — continue
    }

    // Strategy 4 — look up phone in staff / users table
    try {
      const staffRow = await db.queryOne(
        `SELECT school_id FROM staff WHERE phone = $1 LIMIT 1`,
        [phone]
      );
      if (staffRow?.school_id) return staffRow.school_id;
    } catch {
      // ignore
    }
  }

  return null;
};

/* -------------------------------------------------------------------------- */
/*  HANDLER: STK Push Callback                                                 */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/v1/webhooks/mpesa/callback
 * Safaricom sends this after an STK Push completes (success or failure).
 */
const handleCallback = async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;

    // Malformed payload — ack and exit
    if (!callback) {
      console.warn('⚠️  [WEBHOOK] Invalid M-Pesa callback payload');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = callback;

    console.log(`ℹ️  [WEBHOOK] STK callback - ResultCode: ${ResultCode}`);

    // ── Failed payment ──────────────────────────────────────────────────────
    // Must still return 200 — never leave Safaricom hanging.
    if (ResultCode !== 0) {
      console.log(`ℹ️  [WEBHOOK] Payment failed: ${ResultDesc} (code ${ResultCode})`);

      try {
        const failId = `FAILED_${
          (CheckoutRequestID ?? MerchantRequestID ?? Date.now())
            .toString()
            .replace(/\W/g, '_')
        }`;

        await db.query(
          `INSERT INTO mpesa_transactions
             (transaction_id, phone_number, amount, transaction_date,
              status, callback_data)
           VALUES ($1, 'UNKNOWN', 0, NOW(), 'FAILED', $2)
           ON CONFLICT (transaction_id) DO NOTHING`,
          [failId, JSON.stringify(req.body)]
        );
      } catch (err) {
        console.error('❌ [WEBHOOK] Error storing failed transaction:', err.message);
      }

      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // ── Successful payment ──────────────────────────────────────────────────
    const items        = CallbackMetadata?.Item ?? [];
    const amount       = getMeta(items, 'Amount');
    const receiptNo    = getMeta(items, 'MpesaReceiptNumber');
    const txDateRaw    = getMeta(items, 'TransactionDate');
    const phoneNumber  = getMeta(items, 'PhoneNumber');
    const accountRef   = getMeta(items, 'AccountReference');

    if (!receiptNo || amount === null) {
      console.warn('⚠️  [WEBHOOK] Missing receipt number or amount');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Idempotency — ignore duplicate receipts regardless of school
    const existing = await db.queryOne(
      'SELECT id FROM mpesa_transactions WHERE mpesa_receipt_number = $1',
      [receiptNo]
    );
    if (existing) {
      console.log(`ℹ️  [WEBHOOK] Duplicate receipt ignored: ${receiptNo}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Resolve school_id
    const phoneStr = String(phoneNumber ?? '').trim();
    const schoolId = await resolveSchoolId(accountRef, phoneStr);

    if (!schoolId) {
      console.warn(
        `⚠️  [WEBHOOK] Could not resolve school_id for receipt ${receiptNo} ` +
        `(phone=${phoneStr}, ref=${accountRef}). Transaction NOT stored.`
      );
      // Still ack Safaricom — nothing they can do about our data issue
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const transactionId = `MPESA_${
      (CheckoutRequestID ?? receiptNo).toString().replace(/\W/g, '_')
    }_${Date.now()}`;
    const txDate = parseMpesaDate(txDateRaw);

    await db.query(
      `INSERT INTO mpesa_transactions
         (school_id, transaction_id, phone_number, amount,
          mpesa_receipt_number, transaction_date, status, callback_data)
       VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', $7)`,
      [
        schoolId,
        transactionId,
        phoneStr,
        parseFloat(amount),
        receiptNo,
        txDate,
        JSON.stringify(req.body),
      ]
    );

    console.log(
      `✅ [WEBHOOK] Transaction stored: ${receiptNo} - KES ${amount} (school ${schoolId})`
    );

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (error) {
    // Log but STILL return 200 to Safaricom
    console.error('❌ [WEBHOOK] handleCallback error:', error.message);
    console.error(error.stack);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

/* -------------------------------------------------------------------------- */
/*  HANDLER: C2B Validation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/v1/webhooks/mpesa/validation
 * Safaricom calls this BEFORE a C2B payment to ask us to validate it.
 * Return ResultCode 0 to accept, non-zero to reject.
 */
const handleValidation = async (req, res) => {
  try {
    console.log('ℹ️  [WEBHOOK] C2B validation request received');
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('❌ [WEBHOOK] handleValidation error:', error.message);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

/* -------------------------------------------------------------------------- */
/*  HANDLER: C2B Confirmation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * POST /api/v1/webhooks/mpesa/confirmation
 * Safaricom calls this AFTER a C2B payment completes.
 */
const handleConfirmation = async (req, res) => {
  try {
    console.log('ℹ️  [WEBHOOK] C2B confirmation received');

    const {
      TransID,
      TransAmount,
      MSISDN,
      BillRefNumber,
      FirstName,
      MiddleName,
      LastName,
      TransTime,
    } = req.body ?? {};

    if (!TransID || !TransAmount) {
      console.warn('⚠️  [WEBHOOK] Missing TransID or TransAmount');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    // Idempotency check
    const existing = await db.queryOne(
      'SELECT id FROM mpesa_transactions WHERE transaction_id = $1',
      [TransID]
    );
    if (existing) {
      console.log(`ℹ️  [WEBHOOK] Duplicate C2B transaction ignored: ${TransID}`);
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const phoneStr = String(MSISDN ?? '').trim();
    const schoolId = await resolveSchoolId(BillRefNumber, phoneStr);
    const txDate   = TransTime ? parseMpesaDate(TransTime) : new Date();

    await db.query(
      `INSERT INTO mpesa_transactions
         (school_id, transaction_id, phone_number, amount,
          mpesa_receipt_number, account_reference, transaction_date,
          first_name, middle_name, last_name, status, callback_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'COMPLETED', $11)`,
      [
        schoolId,
        TransID,
        phoneStr,
        parseFloat(TransAmount),
        TransID,
        String(BillRefNumber ?? ''),
        txDate,
        String(FirstName  ?? ''),
        String(MiddleName ?? ''),
        String(LastName   ?? ''),
        JSON.stringify(req.body),
      ]
    );

    console.log(
      `✅ [WEBHOOK] C2B transaction stored: ${TransID} - KES ${TransAmount} (school ${schoolId})`
    );

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (error) {
    console.error('❌ [WEBHOOK] handleConfirmation error:', error.message);
    console.error(error.stack);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
};

/* -------------------------------------------------------------------------- */
/*  EXPORTS                                                                    */
/* -------------------------------------------------------------------------- */

module.exports = {
  handleCallback,
  handleValidation,
  handleConfirmation,
};