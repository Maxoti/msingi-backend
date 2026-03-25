/**
 * Mobiwave SMS Provider
 * Integration with TalkSasa Bulk SMS API
 * API Documentation: https://sms.mobiwave.co.ke/api/v3/
 *
 * ⚠️  IMPORTANT: The v3 API only supports GET requests.
 *     POST to this endpoint returns 405 "Method Not Allowed".
 *     All parameters must be sent as query params, NOT a JSON body.
 */

const axios = require('axios');

class MobiwaveProvider {
  constructor() {
    this.apiUrl    = process.env.MOBIWAVE_API_URL || 'https://sms.mobiwave.co.ke/api/v3/sms';
    this.apiToken  = process.env.MOBIWAVE_API_TOKEN;
    this.senderId  = process.env.MOBIWAVE_SENDER_ID || 'SCHOOL';

    if (!this.apiToken) {
      console.warn('  MOBIWAVE_API_TOKEN not configured in environment variables');
    }
  }

  /**
   * Send a single SMS
   */
  async sendSMS(phoneNumber, message) {
  try {
    if (!this.apiToken) {
      throw new Error('Mobiwave API token not configured');
    }

    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    // ─── DEBUG: log everything before sending ────────────────────────────
    console.log('========== MOBIWAVE DEBUG ==========');
    console.log('URL:      ', this.apiUrl);
    console.log('Token:    ', this.apiToken ? `${this.apiToken.slice(0, 8)}...${this.apiToken.slice(-4)}` : 'NOT SET');
    console.log('Sender:   ', this.senderId);
    console.log('Phone:    ', formattedPhone);
    console.log('Msg len:  ', message.length);
    console.log('Full params:', JSON.stringify({
      h_api_key:     this.apiToken,
      mobile:        formattedPhone,
      sender_name:   this.senderId,
      service_id:    0,
      message:       message,
      response_type: 'json',
    }, null, 2));
    console.log('=====================================');
    // ─────────────────────────────────────────────────────────────────────
    const response = await axios.post(this.apiUrl, {
  recipient:  formattedPhone,   // was "mobile"
  sender_id:  this.senderId,    // was "sender_name"
  type:       'plain',          // was missing
  message:    message,
}, {
  headers: {
    'Authorization': `Bearer ${this.apiToken}`,  // was "h_api_key"
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  },
  timeout: 30000,
});
 

 

    // ─── DEBUG: log raw response ─────────────────────────────────────────
    console.log('========== MOBIWAVE RESPONSE ==========');
    console.log('HTTP Status:', response.status);
    console.log('Raw data:  ', JSON.stringify(response.data, null, 2));
    console.log('=======================================');
    // ─────────────────────────────────────────────────────────────────────

    const result = this.parseResponse(response.data);

    if (!result.success) {
      return {
        success:   false,
        status:    'FAILED',
        messageId: null,
        cost:      0,
        error:     result.message || 'Mobiwave returned an error',
        response:  result,
      };
    }

    return {
      success:      true,
      messageId:    result.messageId,
      status:       'SENT',
      cost:         result.cost,
      credits_used: result.credits,
      response:     result,
    };

  } catch (error) {
    // ─── DEBUG: log full axios error ─────────────────────────────────────
    console.log('========== MOBIWAVE ERROR ==========');
    console.log('Error msg:     ', error.message);
    console.log('Response status:', error.response?.status);
    console.log('Response data: ', JSON.stringify(error.response?.data, null, 2));
    console.log('Request URL:   ', error.config?.url);
    console.log('Request params:', JSON.stringify(error.config?.params, null, 2));
    console.log('====================================');
    // ─────────────────────────────────────────────────────────────────────

    return {
      success:      false,
      status:       'FAILED',
      error:        error.response?.data?.message || error.message,
      errorDetails: error.response?.data || null,
    };
  }
}
 

  /**
   * Send bulk SMS to multiple recipients
   */
  async sendBulkSMS(recipients) {
    const results = [];

    console.log(`📤 Sending bulk SMS to ${recipients.length} recipients`);

    for (const recipient of recipients) {
      const { phoneNumber, message, reference } = recipient;

      try {
        const result = await this.sendSMS(phoneNumber, message);

        results.push({
          phoneNumber,
          reference,
          success:   result.success,
          messageId: result.messageId,
          status:    result.status,
          cost:      result.cost,
          error:     result.error,
        });

        // Small delay between messages to avoid rate limiting
        await this.delay(100);

      } catch (error) {
        results.push({
          phoneNumber,
          reference,
          success: false,
          status:  'FAILED',
          error:   error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount  = results.length - successCount;

    console.log(`✅ Bulk SMS complete: ${successCount} sent, ${failedCount} failed`);

    return {
      total:      results.length,
      successful: successCount,
      failed:     failedCount,
      results,
    };
  }

  /**
   * Check SMS delivery status
   */
  async checkStatus(messageId) {
    console.log('ℹ️  Status check not implemented for Mobiwave');
    return {
      messageId,
      status:  'UNKNOWN',
      message: 'Status check not available for this provider',
    };
  }

  /**
   * Get account balance/credits
   */
  async getBalance() {
    try {
      if (!this.apiToken) {
        return { success: false, message: 'API token not configured' };
      }

      const baseUrl = this.apiUrl.replace(/\/sms$/, '');
      const response = await axios.get(`${baseUrl}/balance`, {
        params: { h_api_key: this.apiToken, response_type: 'json' },
        timeout: 15000,
      });

      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Balance check error:', error.message);
      return {
        success: false,
        message: 'Balance check failed. Check SMS send response for credit info.',
      };
    }
  }

  /**
   * Format phone number to Kenyan format (254XXXXXXXXX)
   */
  formatPhoneNumber(phone) {
    let cleaned = String(phone).replace(/[\s\-\(\)\+]/g, '');

    if (cleaned.startsWith('254')) return cleaned;
    if (cleaned.startsWith('0'))   return '254' + cleaned.substring(1);
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) return '254' + cleaned;

    return cleaned;
  }

  /**
   * Validate Kenyan phone number
   */
  isValidKenyanPhone(phone) {
    const formatted = this.formatPhoneNumber(phone);
    return /^254[71]\d{8}$/.test(formatted);
  }

  /**
   * Parse Mobiwave API response
   */
  parseResponse(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return {
          success:   data.toLowerCase().includes('success'),
          messageId: null,
          message:   data,
          credits:   0,
          cost:      0,
        };
      }
    }

    return {
      success:   data.success || data.status === 'success' || false,
      messageId: data.message_id || data.messageId || data.id || null,
      message:   data.message || data.response || '',
      credits:   data.credits_used || data.credits || 0,
      cost:      data.cost || 0,
      raw:       data,
    };
  }

  /**
   * Calculate approximate SMS cost
   */
  calculateCost(message, count = 1) {
    const hasUnicode    = /[^\x00-\x7F]/.test(message);
    const segmentLength = hasUnicode ? 70 : 160;
    const segments      = Math.ceil(message.length / segmentLength);
    const costPerSMS    = 0.50;

    return {
      segments,
      totalCost:      segments * count * costPerSMS,
      costPerMessage: segments * costPerSMS,
      messageLength:  message.length,
      hasUnicode,
    };
  }

  /**
   * Utility: delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection
   */
  async testConnection() {
    console.log('🔍 Testing Mobiwave connection...');
    console.log('API URL:', this.apiUrl);
    console.log('Sender ID:', this.senderId);
    console.log('Token configured:', !!this.apiToken);

    if (!this.apiToken) {
      return { success: false, message: 'API token not configured' };
    }

    return {
      success:  true,
      message:  'Configuration appears valid. Send a test SMS to verify.',
      provider: 'Mobiwave (TalkSasa)',
      endpoint: this.apiUrl,
    };
  }
}

module.exports = MobiwaveProvider;