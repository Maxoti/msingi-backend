/**
 * M-Pesa Configuration — Lipana (lipana.dev)
 * Replaces: src/shared/integrations/mpesa/mpesa.config.js
 *
 * Previously used Safaricom Daraja (consumerKey, shortCode, passkey).
 * Lipana abstracts all of that — you only need your secret key + callback URL.
 */

'use strict';

const config = {
  // ── Lipana API base URL ──────────────────────────────────────────────────
  baseURL: 'https://api.lipana.dev',

  // ── Your secret key from lipana.dev/dashboard → API Keys ────────────────
  // lip_sk_live_...  (NEVER expose this on the frontend)
  secretKey: process.env.LIPANA_SECRET_KEY,

  // ── Webhook URL: Lipana POSTs here after every payment ──────────────────
  // Must be a publicly reachable HTTPS URL.
  // Local dev: use ngrok → npx ngrok http 3000
  callbackURL: `${process.env.APP_URL}/api/v1/webhooks/mpesa/callback`,

  // ── Optional: your publishable key (safe for frontend use) ───────────────
  publishableKey: process.env.LIPANA_PUBLISHABLE_KEY,
};

// ── Validate at startup ──────────────────────────────────────────────────────
if (!config.secretKey) {
  console.warn(
    '  [MPESA] LIPANA_SECRET_KEY is not set. M-Pesa payments will fail.'
  );
}

if (!process.env.APP_URL) {
  console.warn(
    '  [MPESA] APP_URL is not set. Lipana cannot reach your webhook.'
  );
}

module.exports = config;