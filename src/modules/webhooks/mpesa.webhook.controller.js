'use strict';

/**
 * M-Pesa Webhook Controller — Lipana Edition
 * File: src/modules/webhooks/mpesa.webhook.controller.js
 *
 * Responsibilities:
 *  1. ACK Lipana immediately (always 200) — never let them time out
 *  2. Suppress duplicate webhooks (Lipana fires 2-3 per event)
 *  3. Fetch the full transaction from Lipana API to get the real
 *     Safaricom receipt number (e.g. UE9HU3EJWR) which is NOT
 *     included in the webhook payload itself
 *  4. Normalise the payload and hand off to mpesaService.processCallback()
 */

const mpesaService = require('../../shared/integrations/mpesa/mpesa.service');
const lipana       = require('../../shared/integrations/mpesa/mpesa-client');

// ─── In-memory dedup cache ────────────────────────────────────────────────────
// Lipana fires the same webhook 2-3 times within milliseconds.
// We process only the first hit; duplicates are dropped here before
// they reach the DB — cheaper than relying solely on the DB idempotency guard.
const recentlyProcessed = new Map();

const isDuplicate = (transactionId) => {
  const now = Date.now();

  // Evict entries older than 60 seconds
  for (const [key, ts] of recentlyProcessed) {
    if (now - ts > 60_000) recentlyProcessed.delete(key);
  }

  if (recentlyProcessed.has(transactionId)) return true;
  recentlyProcessed.set(transactionId, now);
  return false;
};

// ─── Receipt resolver ─────────────────────────────────────────────────────────
// Try every field name Lipana might use for the Safaricom receipt number.
// Once we see a real getTransaction() response we can trim this list down
// to the exact field — for now we cast a wide net.
const resolveReceiptNumber = (fullTransaction) => {
  if (!fullTransaction) return null;

  const receipt =
    fullTransaction.mpesaReceiptNumber    ||
    fullTransaction.mpesa_receipt_number  ||
    fullTransaction.receiptNumber         ||
    fullTransaction.receipt_number        ||
    fullTransaction.MpesaReceiptNumber    ||
    fullTransaction.safaricomCode         ||
    fullTransaction.safaricom_code        ||
    fullTransaction.mpesaCode             ||
    fullTransaction.mpesa_code            ||
    fullTransaction.confirmationCode      ||
    fullTransaction.confirmation_code     ||
    null;

  // Guard: reject the string "undefined" or "null" which JS can produce
  // when undefined values get JSON-serialised and back
  if (!receipt || receipt === 'undefined' || receipt === 'null') return null;

  return String(receipt).trim();
};

// ─── Main callback handler ────────────────────────────────────────────────────
const handleCallback = async (req, res) => {
  // ACK immediately — Lipana retries if we don't respond within ~5 s
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const body      = req.body;
    const eventType = body?.event || body?.type || '';
    const data      = body?.data  || body;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[WEBHOOK] Event   :', eventType);
    console.log('[WEBHOOK] Raw body:', JSON.stringify(body, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!body || typeof body !== 'object') {
      console.warn('[WEBHOOK] Empty or non-JSON payload — ignoring');
      return;
    }

    // ── Classify the event ─────────────────────────────────────────────────
    const isPaymentEvent =
      eventType === 'transaction.success' ||
      eventType === 'payment.received'    ||
      eventType === 'payment.success'     ||
      eventType === 'stk.success';

    const isFailedEvent =
      eventType === 'transaction.failed'  ||
      eventType === 'payment.failed'      ||
      eventType === 'stk.failed'          ||
      eventType === 'payment.cancelled';

    if (!isPaymentEvent && !isFailedEvent) {
      console.log(`[WEBHOOK] Ignored event: ${eventType}`);
      return;
    }

    // ── Extract transaction ID ─────────────────────────────────────────────
    const transactionId =
      data.transaction_id ||
      data.transactionId  ||
      data.id;

    if (!transactionId) {
      console.warn('[WEBHOOK] No transaction ID in payload — ignoring');
      return;
    }

    // ── Dedup guard ────────────────────────────────────────────────────────
    if (isDuplicate(transactionId)) {
      console.log(`[WEBHOOK] Duplicate suppressed: ${transactionId}`);
      return;
    }

    // ── Failed payment — pass straight to service, no API fetch needed ─────
    if (isFailedEvent) {
      console.log(`[WEBHOOK] Processing failed payment: ${transactionId}`);
      await mpesaService.processCallback({
        checkout_request_id:  transactionId,
        result_code:          1,
        result_desc:          data.result_desc || data.message || 'Payment failed',
        mpesa_receipt_number: null,
        amount:               data.amount   || 0,
        phone_number:         data.phone    || data.phoneNumber || data.phone_number || null,
        reference:            data.reference || data.accountReference || null,
        transaction_date:     data.timestamp || new Date().toISOString(),
      });
      return;
    }

    // ── Successful payment — fetch full transaction to get Safaricom receipt ─
    // Lipana's webhook payload deliberately omits the real M-PESA receipt
    // number (e.g. UE9HU3EJWR). We must call their API to retrieve it.
    let mpesaReceiptNumber = null;

    console.log(`[WEBHOOK] Fetching full transaction from Lipana: ${transactionId}`);
    const fullTransaction = await lipana.getTransaction(transactionId);

    if (fullTransaction) {
      console.log('[WEBHOOK] Lipana full transaction:',
        JSON.stringify(fullTransaction, null, 2));

      mpesaReceiptNumber = resolveReceiptNumber(fullTransaction);
      console.log(`[WEBHOOK] M-PESA receipt resolved: "${mpesaReceiptNumber}"`);
    } else {
      console.warn(
        `[WEBHOOK] Could not fetch transaction ${transactionId} from Lipana — ` +
        `will fall back to STK reference as receipt`
      );
    }

    // ── Normalise and hand off to service ─────────────────────────────────
    const normalised = {
      checkout_request_id:  transactionId,
      result_code:          0,
      result_desc:          'Success',
      mpesa_receipt_number: mpesaReceiptNumber,  // UE9HU3EJWR or null
      amount:               data.amount,
      phone_number:         data.phone           ||
                            data.phoneNumber     ||
                            data.phone_number    ||
                            null,
      reference:            data.reference       ||
                            data.accountReference ||
                            null,
      transaction_date:     data.timestamp       ||
                            data.transactionDate ||
                            new Date().toISOString(),
    };

    console.log('[WEBHOOK] Normalised payload:', JSON.stringify(normalised, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mpesaService.processCallback(normalised);

  } catch (error) {
    console.error('[WEBHOOK] Unhandled error:', error.message);
    console.error(error.stack);
  }
};

const handleValidation   = (_req, res) =>
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

const handleConfirmation = (_req, res) =>
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

module.exports = { handleCallback, handleValidation, handleConfirmation };