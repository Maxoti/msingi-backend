/**
 * Lipana M-Pesa Client
 * File: src/shared/integrations/mpesa/mpesa-client.js
 */

'use strict';

const { Lipana } = require('@lipana/sdk');
const axios = require('axios');


const client = new Lipana({
  apiKey: process.env.LIPANA_SECRET_KEY,
});

class LipanaClient {

  // ─── STK PUSH ─────────────────────────────────────────────────────────────
  async initiateSTKPush(phoneNumber, amount, accountReference, description) {
    try {
      const phone = this.formatPhoneNumber(phoneNumber);

      const response = await client.transactions.initiateStkPush({
        phone:  `+${phone}`,
        amount: Math.round(amount),
      });

      console.log('[LIPANA] STK Push response:', JSON.stringify(response, null, 2));

      return {
        success:           true,
        checkoutRequestID: response.transactionId  || response.id || response.checkoutRequestId,
        merchantRequestID: response.transactionId  || response.id,
        customerMessage:   'STK Push sent. Check your phone.',
        responseCode:      '0',
      };
    } catch (error) {
      console.error('[LIPANA] STK Push error:', error?.response?.data || error.message);
      throw new Error(error?.response?.data?.message || error?.message || 'STK Push failed');
    }
  }



// ─── GET TRANSACTION (fetch real M-PESA receipt) ──────────────────────────
async getTransaction(transactionId) {
  try {
    const response = await client.transactions.retrieve(transactionId);
    console.log('[LIPANA] getTransaction response:', JSON.stringify(response, null, 2));
    return response;
  } catch (error) {
    console.error('[LIPANA] getTransaction error:',
      error?.response?.status,
      JSON.stringify(error?.response?.data || error.message)
    );
    return null;
  }
}


  // ─── QUERY STATUS ─────────────────────────────────────────────────────────
  // Lipana uses webhooks for payment confirmation — polling is not supported.
  // This method checks our local DB status instead of calling Lipana API.
  async querySTKPush(checkoutRequestID) {
    // Return a safe response — actual status comes via webhook
    return {
      responseCode:        '0',
      responseDescription: 'Query not supported — status delivered via webhook',
      merchantRequestID:   null,
      checkoutRequestID,
      resultCode:          -1, // -1 = still pending, not failed
      resultDesc:          'Pending — waiting for webhook confirmation',
      status:              'pending',
    };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────
  formatPhoneNumber(phoneNumber) {
    let cleaned = String(phoneNumber).replace(/\D/g, '');
    if (cleaned.startsWith('254')) return cleaned;
    if (cleaned.startsWith('0'))   return '254' + cleaned.slice(1);
    if (cleaned.length === 9)      return '254' + cleaned;
    return cleaned;
  }

  isValidPhoneNumber(phoneNumber) {
    return /^254[71]\d{8}$/.test(this.formatPhoneNumber(phoneNumber));
  }
}

module.exports = new LipanaClient();