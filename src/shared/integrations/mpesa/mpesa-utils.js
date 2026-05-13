/**
 * M-Pesa Utility Functions
 * Replaces: src/shared/integrations/mpesa/mpesa-utils.js
 *
 * REMOVED (Daraja-only, no longer needed with Lipana):
 *   - generateTimestamp()   → Lipana handles timestamps internally
 *   - generatePassword()    → Lipana handles password/auth internally
 *   - parseCallbackMetadata() → Lipana sends flat JSON, not nested items array
 *
 * KEPT (generic, still useful):
 *   - formatPhoneNumber, isValidPhoneNumber, isValidAmount
 *   - parseTransactionDate, maskPhoneNumber, getResultCodeDescription
 */

'use strict';

/**
 * Format phone number to Kenyan M-Pesa format (254XXXXXXXXX)
 */
const formatPhoneNumber = (phoneNumber) => {
  let cleaned = String(phoneNumber).replace(/\D/g, '');

  if (cleaned.startsWith('254') && cleaned.length === 12) return cleaned;
  if (cleaned.startsWith('0')   && cleaned.length === 10) return '254' + cleaned.substring(1);
  if (cleaned.length === 9)                               return '254' + cleaned;

  return cleaned;
};

/**
 * Validate Kenyan phone number (254 7XX XXX XXX or 254 1XX XXX XXX)
 */
const isValidPhoneNumber = (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  return /^254[71]\d{8}$/.test(formatted);
};

/**
 * Validate M-Pesa transaction amount (1 – 300,000 KES)
 */
const isValidAmount = (amount) => {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= 1 && num <= 300_000;
};

/**
 * Parse M-Pesa transaction date from YYYYMMDDHHMMSS format
 * Works for both Daraja (integer) and Lipana (string) formats.
 */
const parseTransactionDate = (mpesaDate) => {
  if (!mpesaDate) return null;
  const s = mpesaDate.toString();

  if (s.length === 14) {
    return new Date(
      `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` +
      `T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}+03:00`
    );
  }

  return new Date(mpesaDate);
};

/**
 * Mask phone number for display (e.g. 254712XXXXX8)
 */
const maskPhoneNumber = (phoneNumber) => {
  const f = formatPhoneNumber(phoneNumber);
  if (f.length === 12) return `${f.substring(0,6)}XXX${f.substring(9)}`;
  return phoneNumber;
};

/**
 * Human-readable description for M-Pesa result codes.
 * Covers both Daraja and Lipana result codes.
 */
const getResultCodeDescription = (resultCode) => {
  const codes = {
    '0':    'Success',
    '1':    'Insufficient Funds',
    '2':    'Less Than Minimum Transaction Value',
    '3':    'More Than Maximum Transaction Value',
    '4':    'Would Exceed Daily Transfer Limit',
    '5':    'Would Exceed Minimum Balance',
    '6':    'Unresolved Primary Party',
    '7':    'Unresolved Receiver Party',
    '8':    'Would Exceed Maximum Balance',
    '11':   'Debit Account Invalid',
    '12':   'Credit Account Invalid',
    '13':   'Unresolved Debit Account',
    '14':   'Unresolved Credit Account',
    '15':   'Duplicate Detected',
    '17':   'Internal Failure',
    '20':   'Unresolved Initiator',
    '26':   'Traffic blocking condition in place',
    '1032': 'Request cancelled by user',
    '1037': 'DS timeout',
  };

  return codes[resultCode?.toString()] || 'Unknown error';
};

module.exports = {
  formatPhoneNumber,
  isValidPhoneNumber,
  isValidAmount,
  parseTransactionDate,
  maskPhoneNumber,
  getResultCodeDescription,
};