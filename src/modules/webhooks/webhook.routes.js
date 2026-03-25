/**
 * Webhook Routes
 * Handles M-Pesa callback endpoints from Safaricom
 *
 * CRITICAL: These routes must NOT have authentication middleware
 * because Safaricom cannot send auth tokens.
 */

const express = require('express');
const router = express.Router();

// Import webhook controller
const webhookController = require('./mpesa.webhook.controller');

/**
 * M-Pesa STK Push Callback
 * POST /api/v1/webhooks/mpesa/callback
 */
router.post('/mpesa/callback', webhookController.handleCallback);

/**
 * M-Pesa C2B Validation Endpoint
 * POST /api/v1/webhooks/mpesa/validation
 */
router.post('/mpesa/validation', webhookController.handleValidation);

/**
 * M-Pesa C2B Confirmation Endpoint
 * POST /api/v1/webhooks/mpesa/confirmation
 */
router.post('/mpesa/confirmation', webhookController.handleConfirmation);

console.log("Webhook routes module loaded");

module.exports = router;
