/**
 * M-Pesa Utility Functions
 * Helper functions for M-Pesa operations
 */

/**
 * Format phone number to Kenyan M-Pesa format (254XXXXXXXXX)
 */
const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // Already in correct format
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }
  
  // Remove leading 0 and add 254
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return '254' + cleaned.substring(1);
  }
  
  // Add 254 if only 9 digits
  if (cleaned.length === 9) {
    return '254' + cleaned;
  }
  
  // Remove +254 and add back
  if (cleaned.startsWith('254')) {
    return cleaned;
  }
  
  return cleaned;
};

/**
 * Validate Kenyan phone number
 */
const isValidPhoneNumber = (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  
  // Must be 254XXXXXXXXX (12 digits total)
  // Kenyan mobile numbers: 254 7XX XXX XXX or 254 1XX XXX XXX
  return /^254[71]\d{8}$/.test(formatted);
};

/**
 * Validate M-Pesa transaction amount
 * Limits: 1 - 300,000 KES
 */
const isValidAmount = (amount) => {
  const num = parseFloat(amount);
  return !isNaN(num) && num >= 1 && num <= 300000;
};

/**
 * Parse M-Pesa callback metadata
 */
const parseCallbackMetadata = (callbackMetadataItems) => {
  const metadata = {};
  
  if (Array.isArray(callbackMetadataItems)) {
    callbackMetadataItems.forEach(item => {
      if (item.Name && item.Value !== undefined) {
        metadata[item.Name] = item.Value;
      }
    });
  }
  
  return metadata;
};

/**
 * Format M-Pesa date (YYYYMMDDHHMMSS) to JavaScript Date
 */
const parseTransactionDate = (mpesaDate) => {
  if (!mpesaDate) return null;
  
  const dateStr = mpesaDate.toString();
  
  // YYYYMMDDHHMMSS format
  if (dateStr.length === 14) {
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const hour = dateStr.substring(8, 10);
    const minute = dateStr.substring(10, 12);
    const second = dateStr.substring(12, 14);
    
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`); // EAT timezone
  }
  
  return new Date(mpesaDate);
};

/**
 * Generate timestamp for M-Pesa API (YYYYMMDDHHMMSS)
 */
const generateTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

/**
 * Mask phone number for display (254XXX XXX 789)
 */
const maskPhoneNumber = (phoneNumber) => {
  const formatted = formatPhoneNumber(phoneNumber);
  
  if (formatted.length === 12) {
    return `${formatted.substring(0, 6)}XXX${formatted.substring(9)}`;
  }
  
  return phoneNumber;
};

/**
 * Get M-Pesa result code description
 */
const getResultCodeDescription = (resultCode) => {
  const codes = {
    '0': 'Success',
    '1': 'Insufficient Funds',
    '2': 'Less Than Minimum Transaction Value',
    '3': 'More Than Maximum Transaction Value',
    '4': 'Would Exceed Daily Transfer Limit',
    '5': 'Would Exceed Minimum Balance',
    '6': 'Unresolved Primary Party',
    '7': 'Unresolved Receiver Party',
    '8': 'Would Exceed Maximum Balance',
    '11': 'Debit Account Invalid',
    '12': 'Credit Account Invalid',
    '13': 'Unresolved Debit Account',
    '14': 'Unresolved Credit Account',
    '15': 'Duplicate Detected',
    '17': 'Internal Failure',
    '20': 'Unresolved Initiator',
    '26': 'Traffic blocking condition in place',
    '1032': 'Request cancelled by user',
    '1037': 'DS timeout'
  };
  
  return codes[resultCode?.toString()] || 'Unknown error';
};

module.exports = {
  formatPhoneNumber,
  isValidPhoneNumber,
  isValidAmount,
  parseCallbackMetadata,
  parseTransactionDate,
  generateTimestamp,
  maskPhoneNumber,
  getResultCodeDescription
};