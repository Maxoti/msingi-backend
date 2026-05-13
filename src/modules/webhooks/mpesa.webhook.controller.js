/**
 * M-Pesa Webhook Controller — Lipana Edition (Fixed)
 * File: src/modules/webhooks/mpesa.webhook.controller.js
 *
 * FIXES:
 * 1. Lipana sends ALL events to one webhook URL — filter by event type
 *    so payout.initiated, payout.completed etc. are safely ignored
 * 2. Payment data is nested under body.data — extracted correctly
 * 3. processCallback receives normalised flat payload
 *
 * Lipana event types we handle:
 *   payment.received   → STK Push completed successfully
 *   payment.failed     → STK Push failed/cancelled
 *
 * Events we ignore:
 *   payout.initiated, payout.completed, payout.failed, etc.
 */

'use strict';

const mpesaService = require('../../shared/integrations/mpesa/mpesa.service');

const handleCallback = async (req, res) => {
  // ACK immediately — Lipana must not time out
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      console.warn('  [WEBHOOK] Empty or non-JSON payload received');
      return;
    }

    const eventType = body.event || body.type || '';
    console.log(` [WEBHOOK] Lipana event: "${eventType}"`);

    // ── Ignore payout and other non-payment events ──────────────────────────
    if (eventType && !eventType.startsWith('payment.') && !eventType.startsWith('stk.') && !eventType.startsWith('transaction.')) {
      console.log(`  [WEBHOOK] Skipping non-payment event: ${eventType}`);
      return;
    }

    // ── Extract data — Lipana nests payload under body.data ─────────────────
    const data = body.data || body;

    // Infer result code from event name if not explicitly set
    const isFailed = eventType.includes('failed') || eventType.includes('cancelled');
    const resultCode = data.result_code ?? data.ResultCode ?? data.resultCode ?? (isFailed ? 1 : 0);

    console.log(`ℹ️  [WEBHOOK] ResultCode: ${resultCode}`);
    console.log('[WEBHOOK] Data:', JSON.stringify(data, null, 2));

    // ── Normalise payload for mpesaService.processCallback() ────────────────
    const normalised = {
  checkout_request_id:  data.transaction_id        // ← Lipana's actual field
                     || data.transactionId
                     || data.checkout_request_id
                     || data.CheckoutRequestID,

  result_code:          resultCode,
  result_desc:          data.resultDesc            || data.result_desc   || data.ResultDesc || '',

  mpesa_receipt_number: data.mpesaReceiptNumber    || data.mpesa_receipt_number
                     || data.receiptNumber         || data.receipt_number,

  amount:               data.amount,

  phone_number:         data.phone                 // ← Lipana sends "phone", not "phoneNumber"
                     || data.phoneNumber
                     || data.phone_number
                     || data.recipientPhone,

  reference:            data.reference             || data.accountReference || data.account_reference,

  transaction_date:     data.transactionDate       || data.transaction_date
                     || data.timestamp             || new Date().toISOString(),
};

    await mpesaService.processCallback(normalised);

  } catch (error) {
    console.error('‼️  [WEBHOOK] Error:', error.message);
    console.error(error.stack);
  }
};

const handleValidation   = (req, res) => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
const handleConfirmation = (req, res) => res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

module.exports = { handleCallback, handleValidation, handleConfirmation };