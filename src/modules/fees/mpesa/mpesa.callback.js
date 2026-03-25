/**
 * M-Pesa Callback Handler (Fees Module)
 * Additional M-Pesa endpoints specific to fees
 */

const express = require('express');
const router = express.Router();
const mpesaService = require('../../../shared/integrations/mpesa/mpesa.service');
const { authenticate, authorize } = require('../../../shared/middleware/auth');

/**
 * Initiate STK Push for student payment
 * POST /api/v1/fees/mpesa/stk-push
 */
router.post('/stk-push', authenticate, async (req, res, next) => {
  try {
    const { admission_no, phone_number, amount } = req.body;

    // Validation
    if (!admission_no || !phone_number || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Please provide admission_no, phone_number, and amount'
      });
    }

    const result = await mpesaService.initiatePayment(
      admission_no,
      phone_number,
      amount
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        checkoutRequestID: result.checkoutRequestID,
        merchantRequestID: result.merchantRequestID
      }
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

/**
 * Query STK Push status
 * GET /api/v1/fees/mpesa/query/:checkoutRequestId
 */
router.get('/query/:checkoutRequestId', authenticate, async (req, res, next) => {
  try {
    const { checkoutRequestId } = req.params;

    const result = await mpesaService.queryTransaction(checkoutRequestId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get pending M-Pesa transactions
 * GET /api/v1/fees/mpesa/pending
 */
router.get('/pending', authenticate, authorize('ADMIN', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const transactions = await mpesaService.getPendingTransactions({
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      success: true,
      data: transactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Manually reconcile M-Pesa transaction
 * POST /api/v1/fees/mpesa/reconcile/:transactionId
 */
router.post('/reconcile/:transactionId', authenticate, authorize('ADMIN', 'ACCOUNTANT'), async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { invoice_id } = req.body;

    if (!invoice_id) {
      return res.status(400).json({
        success: false,
        message: 'Please provide invoice_id'
      });
    }

    const result = await mpesaService.manualReconcile(
      parseInt(transactionId),
      parseInt(invoice_id),
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Transaction reconciled successfully',
      data: result
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('already reconciled')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

module.exports = router;