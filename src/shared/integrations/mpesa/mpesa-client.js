/**
 * M-Pesa Daraja API Client
 * Handles OAuth authentication and STK Push requests
 * Optimized for production use with proper error handling
 */

const axios = require('axios');

class MpesaClient {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get OAuth access token
   * Time Complexity: O(1) - Single API call
   * Caches token until expiry
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${this.config.consumerKey}:${this.config.consumerSecret}`
      ).toString('base64');

      const response = await axios.get(
        `${this.config.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`
          },
          timeout: 30000 // 30 second timeout
        }
      );

      this.accessToken = response.data.access_token;
      // Token expires in 3599 seconds, cache for 3500 seconds (safe margin)
      this.tokenExpiry = Date.now() + 3500000;

      return this.accessToken;
    } catch (error) {
      throw new Error(`M-Pesa OAuth failed: ${error.message}`);
    }
  }

  /**
   * Initiate STK Push (Lipa Na M-Pesa Online)
   * Time Complexity: O(1) - Single API call
   */
  async initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
    try {
      const token = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(timestamp);

      // Format phone number (remove + and leading 0)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const requestBody = {
        BusinessShortCode: this.config.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.floor(amount), // M-Pesa requires integer
        PartyA: formattedPhone,
        PartyB: this.config.shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: this.config.callbackURL,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc || 'School Fees Payment'
      };

      const response = await axios.post(
        `${this.config.baseURL}/mpesa/stkpush/v1/processrequest`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 second timeout for STK push
        }
      );

      return {
        success: true,
        checkoutRequestID: response.data.CheckoutRequestID,
        merchantRequestID: response.data.MerchantRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
        customerMessage: response.data.CustomerMessage
      };
    } catch (error) {
      // Handle M-Pesa specific errors
      if (error.response?.data) {
        throw new Error(
          error.response.data.errorMessage || 
          error.response.data.ResponseDescription || 
          'STK Push failed'
        );
      }
      throw new Error(`STK Push request failed: ${error.message}`);
    }
  }

  /**
   * Query STK Push transaction status
   * Time Complexity: O(1) - Single API call
   */
  async querySTKPush(checkoutRequestID) {
    try {
      const token = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(timestamp);

      const requestBody = {
        BusinessShortCode: this.config.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID
      };

      const response = await axios.post(
        `${this.config.baseURL}/mpesa/stkpushquery/v1/query`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return {
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
        merchantRequestID: response.data.MerchantRequestID,
        checkoutRequestID: response.data.CheckoutRequestID,
        resultCode: response.data.ResultCode,
        resultDesc: response.data.ResultDesc
      };
    } catch (error) {
      if (error.response?.data) {
        throw new Error(
          error.response.data.errorMessage || 
          error.response.data.ResponseDescription || 
          'STK Query failed'
        );
      }
      throw new Error(`STK Query request failed: ${error.message}`);
    }
  }

  /**
   * Generate timestamp in M-Pesa format (YYYYMMDDHHmmss)
   */
  generateTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Generate password for M-Pesa API
   * Password = Base64(Shortcode + Passkey + Timestamp)
   */
  generatePassword(timestamp) {
    const str = this.config.shortCode + this.config.passkey + timestamp;
    return Buffer.from(str).toString('base64');
  }

  /**
   * Format phone number to M-Pesa format (254XXXXXXXXX)
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Remove leading + if present
    if (cleaned.startsWith('254')) {
      return cleaned;
    }
    
    // Remove leading 0 and add 254
    if (cleaned.startsWith('0')) {
      return '254' + cleaned.substring(1);
    }
    
    // Add 254 if not present
    if (cleaned.length === 9) {
      return '254' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phoneNumber) {
    const formatted = this.formatPhoneNumber(phoneNumber);
    // Kenyan phone numbers: 254XXXXXXXXX (12 digits)
    return /^254\d{9}$/.test(formatted);
  }
}

module.exports = MpesaClient;