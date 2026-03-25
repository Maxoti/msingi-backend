/**
 * M-Pesa Routes
 * Mounted at /api/v1/mpesa
 *
 * Routes
 * ──────────────────────────────────────────────────────────────────────────
 * GET  /transactions             – paginated transaction list  (ADMIN | ACCOUNTANT)
 * GET  /transactions/pending     – unreconciled transactions   (ADMIN | ACCOUNTANT)
 * GET  /query/:checkoutRequestId – STK push status query       (authenticated)
 * POST /initiate                 – initiate STK push by admissionNo (authenticated)
 * POST /stk-push                 – initiate STK push by invoice_id  (authenticated)
 * POST /callback                 – Safaricom webhook           (public)
 * POST /reconcile                – reconcile by receipt_number (ADMIN)
 * POST /reconcile/:transactionId – reconcile by tx id          (ADMIN | ACCOUNTANT)
 */

'use strict';

const express      = require('express');
const router       = express.Router();
const mpesaService = require('../../shared/integrations/mpesa/mpesa.service');
const { authenticate, authorize } = require('../../shared/middleware/auth');
const db           = require('../../shared/database/client');

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /transactions                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */
router.get(
  '/transactions',
  authenticate,
  authorize('ADMIN', 'ACCOUNTANT'),
  async (req, res, next) => {
    try {
      const {
        status,
        phone_number,
        from_date,
        to_date,
        page  = 1,
        limit = 20,
      } = req.query;

      const schoolId = req.user.school_id;
      const offset   = (parseInt(page) - 1) * parseInt(limit);

      const params     = [schoolId];
      let   paramCount = 2;

      let query = `
        SELECT
          mt.*,
          s.admission_no,
          s.first_name || ' ' || s.last_name AS student_name,
          p.id AS payment_id
        FROM mpesa_transactions mt
        LEFT JOIN students s ON mt.account_reference = s.admission_no
        LEFT JOIN payments p ON mt.payment_id = p.id
        WHERE mt.school_id = $1
      `;

      if (status)       { query += ` AND mt.status = $${paramCount++}`;            params.push(status); }
      if (phone_number) { query += ` AND mt.phone_number = $${paramCount++}`;      params.push(phone_number); }
      if (from_date)    { query += ` AND mt.transaction_date >= $${paramCount++}`; params.push(from_date); }
      if (to_date)      { query += ` AND mt.transaction_date <= $${paramCount++}`; params.push(to_date); }

      query += ` ORDER BY mt.transaction_date DESC`;
      query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
      params.push(parseInt(limit), offset);

      const transactions = await db.schoolQuery(schoolId, query, params);

      const countParams     = [schoolId];
      let   countParamCount = 2;
      let   countQuery      = `SELECT COUNT(*) AS count FROM mpesa_transactions WHERE school_id = $1`;

      if (status)       { countQuery += ` AND status = $${countParamCount++}`;            countParams.push(status); }
      if (phone_number) { countQuery += ` AND phone_number = $${countParamCount++}`;      countParams.push(phone_number); }
      if (from_date)    { countQuery += ` AND transaction_date >= $${countParamCount++}`; countParams.push(from_date); }
      if (to_date)      { countQuery += ` AND transaction_date <= $${countParamCount++}`; countParams.push(to_date); }

      const countResult = await db.schoolQueryOne(schoolId, countQuery, countParams);
      const totalCount  = parseInt(countResult.count);

      return res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          page:       parseInt(page),
          limit:      parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit)),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /transactions/pending                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */
router.get(
  '/transactions/pending',
  authenticate,
  authorize('ADMIN', 'ACCOUNTANT'),
  async (req, res, next) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const transactions = await mpesaService.getPendingTransactions(
        req.user.school_id,
        { limit: parseInt(limit), offset: parseInt(offset) }
      );

      return res.status(200).json({ success: true, data: transactions });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  GET /query/:checkoutRequestId                                              */
/* ─────────────────────────────────────────────────────────────────────────── */
router.get(
  '/query/:checkoutRequestId',
  authenticate,
  async (req, res, next) => {
    try {
      const result = await mpesaService.queryTransaction(req.params.checkoutRequestId);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /initiate                                                             */
/*  Body: { admissionNo, phoneNumber, amount }                                */
/*  Interface used by the frontend and test suite.                            */
/* ─────────────────────────────────────────────────────────────────────────── */
router.post(
  '/initiate',
  authenticate,
  async (req, res, next) => {
    try {
      const { admissionNo, phoneNumber, amount } = req.body;

      if (!admissionNo || !phoneNumber || !amount) {
        return res.status(400).json({
          success: false,
          error: 'admissionNo, phoneNumber, and amount are required',
        });
      }

      // Validate phone number — must be a valid Kenyan number (10–13 digits)
      const phone = String(phoneNumber).replace(/\D/g, '');
      if (phone.length < 10 || phone.length > 13 || !/^(254|0)\d{9}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number. Use format 254XXXXXXXXX',
        });
      }

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 1 || numAmount > 300000) {
        return res.status(400).json({
          success: false,
          error: 'Amount must be between 1 and 300,000 KES',
        });
      }

      const schoolId = req.user.school_id;

      // Resolve student by admission number, scoped to school
      const student = await db.schoolQueryOne(
        schoolId,
        `SELECT id, admission_no FROM students WHERE admission_no = $1 AND school_id = $2`,
        [admissionNo, schoolId]
      );

      if (!student) {
        return res.status(404).json({
          success: false,
          error: 'Student not found',
        });
      }

      const result = await mpesaService.initiatePayment(
        student.admission_no,
        phone,
        numAmount,
        schoolId
      );

      return res.status(200).json({
        success: true,
        message: 'STK push initiated. Please enter M-Pesa PIN to complete payment.',
        data: {
          checkoutRequestId: result.checkoutRequestID,
          merchantRequestId: result.merchantRequestID,
        },
      });
    } catch (err) {
      if (err.message?.includes('not configured')) {
        return res.status(503).json({ success: false, error: 'M-Pesa service is not configured' });
      }
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /stk-push                                                             */
/*  Body: { invoice_id, phone_number, amount }                                */
/* ─────────────────────────────────────────────────────────────────────────── */
router.post(
  '/stk-push',
  authenticate,
  async (req, res, next) => {
    try {
      const { invoice_id, phone_number, amount } = req.body;

      if (!invoice_id || !phone_number || !amount) {
        return res.status(400).json({
          success: false,
          error: 'invoice_id, phone_number, and amount are required',
        });
      }

      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount < 1 || numAmount > 300000) {
        return res.status(400).json({
          success: false,
          error: 'Amount must be between 1 and 300,000 KES',
        });
      }

      const schoolId = req.user.school_id;

      const invoice = await db.schoolQueryOne(
        schoolId,
        `SELECT i.id, s.admission_no
         FROM invoices i
         JOIN students s ON i.student_id = s.id
         WHERE i.id = $1`,
        [invoice_id]
      );

      if (!invoice) {
        return res.status(404).json({ success: false, error: 'Invoice not found' });
      }

      const result = await mpesaService.initiatePayment(
        invoice.admission_no,
        String(phone_number),
        numAmount,
        schoolId
      );

      return res.status(200).json({
        success: true,
        message: 'STK push initiated. Enter your M-Pesa PIN to complete payment.',
        data: {
          checkoutRequestId: result.checkoutRequestID,
          merchantRequestId: result.merchantRequestID,
        },
      });
    } catch (err) {
      if (err.message?.includes('not configured')) {
        return res.status(503).json({ success: false, error: 'M-Pesa service is not configured' });
      }
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /callback  (Safaricom webhook — public, no auth)                     */
/* ─────────────────────────────────────────────────────────────────────────── */
router.post('/callback', async (req, res) => {
  try {
    await mpesaService.processCallback(req.body);
  } catch (err) {
    console.error('[mpesa] callback processing error:', err.message);
  }

  return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /reconcile                                                            */
/*  Body: { receipt_number }  –  ADMIN only                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
router.post(
  '/reconcile',
  authenticate,
  authorize('ADMIN'),
  async (req, res, next) => {
    try {
      const { receipt_number } = req.body;
      const schoolId           = req.user.school_id;

      if (!receipt_number) {
        return res.status(400).json({ success: false, error: 'receipt_number is required' });
      }

      const transaction = await db.schoolQueryOne(
        schoolId,
        'SELECT * FROM mpesa_transactions WHERE mpesa_receipt_number = $1',
        [receipt_number]
      );

      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      if (transaction.reconciled_at || transaction.payment_id) {
        return res.status(400).json({ success: false, error: 'Transaction already reconciled' });
      }

      const student = await db.schoolQueryOne(
        schoolId,
        'SELECT id FROM students WHERE admission_no = $1',
        [transaction.account_reference]
      );

      if (!student) {
        return res.status(422).json({
          success: false,
          error: 'Cannot resolve student from transaction — use /reconcile/:id instead',
        });
      }

      const invoice = await db.schoolQueryOne(
        schoolId,
        `SELECT id FROM invoices
         WHERE student_id = $1 AND status IN ('UNPAID', 'PARTIAL')
         ORDER BY created_at ASC LIMIT 1`,
        [student.id]
      );

      if (!invoice) {
        return res.status(422).json({ success: false, error: 'No unpaid invoice found for student' });
      }

      const result = await mpesaService.manualReconcile(
        transaction.id,
        invoice.id,
        req.user.userId,
        schoolId
      );

      return res.status(200).json({
        success: true,
        message: 'Transaction reconciled successfully',
        data: result,
      });
    } catch (err) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      next(err);
    }
  }
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  POST /reconcile/:transactionId                                             */
/*  Body: { student_id, invoice_id }  –  ADMIN | ACCOUNTANT                  */
/* ─────────────────────────────────────────────────────────────────────────── */
router.post(
  '/reconcile/:transactionId',
  authenticate,
  authorize('ADMIN', 'ACCOUNTANT'),
  async (req, res, next) => {
    try {
      const transactionId              = parseInt(req.params.transactionId);
      const { student_id, invoice_id } = req.body;
      const schoolId                   = req.user.school_id;

      if (!student_id || !invoice_id) {
        return res.status(400).json({ success: false, error: 'student_id and invoice_id are required' });
      }

      const transaction = await db.schoolQueryOne(
        schoolId,
        'SELECT * FROM mpesa_transactions WHERE id = $1',
        [transactionId]
      );

      if (!transaction) {
        return res.status(404).json({ success: false, error: 'Transaction not found' });
      }

      if (transaction.reconciled_at || transaction.payment_id) {
        return res.status(400).json({ success: false, error: 'Transaction already reconciled' });
      }

      const result = await mpesaService.manualReconcile(
        transactionId,
        parseInt(invoice_id),
        req.user.userId,
        schoolId
      );

      return res.status(200).json({
        success: true,
        message: 'Transaction reconciled successfully',
        data: {
          payment_id:     result.payment.id,
          transaction_id: transactionId,
        },
      });
    } catch (err) {
      if (err.message?.includes('not found')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      next(err);
    }
  }
);

module.exports = router;