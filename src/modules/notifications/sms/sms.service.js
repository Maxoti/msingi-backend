/**
 * SMS Service
 * Abstraction layer for SMS providers
 * Handles SMS sending, logging, and provider management
 */

const MobiwaveProvider = require('./mobiwave.provider');
const db = require('../../../shared/database/client');

class SMSService {
  constructor() {
    // Initialize provider based on configuration
    this.provider = this.initializeProvider();
    this.enabled = process.env.SMS_ENABLED === 'true';
    
    if (!this.enabled) {
      console.warn('⚠️  SMS service is disabled. Set SMS_ENABLED=true to enable.');
    }
  }

  /**
   * Initialize SMS provider
   */
  initializeProvider() {
    const providerName = process.env.SMS_PROVIDER || 'mobiwave';
    
    console.log(`📱 Initializing SMS provider: ${providerName}`);
    
    switch (providerName.toLowerCase()) {
      case 'mobiwave':
      case 'talksasa':
        return new MobiwaveProvider();
      
      // Add more providers here as needed
      // case 'africastalking':
      //   return new AfricasTalkingProvider();
      
      default:
        console.warn(`⚠️  Unknown SMS provider: ${providerName}. Using Mobiwave.`);
        return new MobiwaveProvider();
    }
  }

  /**
   * Send SMS to a single recipient
   */
  async sendSMS(phoneNumber, message, options = {}) {
    try {
      // Check if SMS is enabled
      if (!this.enabled) {
        console.log('ℹ️  SMS disabled. Message not sent:', { phoneNumber, message });
        return {
          success: false,
          status: 'DISABLED',
          message: 'SMS service is disabled'
        };
      }

      // Validate inputs
      if (!phoneNumber || !message) {
        throw new Error('Phone number and message are required');
      }

      // Validate phone number
      if (!this.provider.isValidKenyanPhone(phoneNumber)) {
        throw new Error('Invalid Kenyan phone number format');
      }

      const {
        messageType = 'GENERAL',
        studentId = null,
        invoiceId = null,
        paymentId = null,
        mpesaTransactionId = null
      } = options;

      // Send via provider
      const result = await this.provider.sendSMS(phoneNumber, message);

      // Log to database
      const logId = await this.logSMS({
        recipient_phone: phoneNumber,
        message,
        message_type: messageType,
        status: result.status,
        provider_message_id: result.messageId,
        cost: result.cost,
        student_id: studentId,
        invoice_id: invoiceId,
        payment_id: paymentId,
        mpesa_transaction_id: mpesaTransactionId,
        sent_at: result.success ? new Date() : null,
        failed_reason: result.error || null
      });

      return {
        ...result,
        logId
      };

    } catch (error) {
      console.error('❌ SMS send error:', error.message);
      
      // Log failed attempt
      await this.logSMS({
        recipient_phone: phoneNumber,
        message,
        message_type: options.messageType || 'GENERAL',
        status: 'FAILED',
        failed_reason: error.message,
        student_id: options.studentId || null,
        invoice_id: options.invoiceId || null,
        payment_id: options.paymentId || null,
        mpesa_transaction_id: options.mpesaTransactionId || null
      });

      return {
        success: false,
        status: 'FAILED',
        error: error.message
      };
    }
  }

  /**
   * Send SMS to multiple recipients
   */
  async sendBulkSMS(recipients) {
    try {
      if (!this.enabled) {
        console.log('ℹ️  SMS disabled. Bulk messages not sent.');
        return {
          success: false,
          message: 'SMS service is disabled'
        };
      }

      console.log(`📤 Sending bulk SMS to ${recipients.length} recipients`);

      const result = await this.provider.sendBulkSMS(recipients);

      // Log each message
      for (const item of result.results) {
        await this.logSMS({
          recipient_phone: item.phoneNumber,
          message: recipients.find(r => r.phoneNumber === item.phoneNumber)?.message || '',
          message_type: recipients.find(r => r.phoneNumber === item.phoneNumber)?.messageType || 'BULK',
          status: item.status,
          provider_message_id: item.messageId,
          cost: item.cost,
          student_id: recipients.find(r => r.phoneNumber === item.phoneNumber)?.studentId || null,
          sent_at: item.success ? new Date() : null,
          failed_reason: item.error || null
        });
      }

      return result;

    } catch (error) {
      console.error('❌ Bulk SMS error:', error.message);
      throw error;
    }
  }

  /**
   * Send fee reminder SMS
   */
  async sendFeeReminder(student, invoice) {
    const phoneNumber = student.parent_phone || student.guardian_phone;
    
    if (!phoneNumber) {
      throw new Error('No phone number found for student');
    }

    const message = this.templates.feeReminder({
      studentName: `${student.first_name} ${student.last_name}`,
      amount: invoice.amount_due,
      dueDate: invoice.due_date,
      schoolName: process.env.SCHOOL_NAME || 'School'
    });

    return this.sendSMS(phoneNumber, message, {
      messageType: 'FEE_REMINDER',
      studentId: student.id,
      invoiceId: invoice.id
    });
  }

  /**
   * Send payment confirmation SMS
   */
  async sendPaymentConfirmation(student, payment) {
    const phoneNumber = student.parent_phone || student.guardian_phone;
    
    if (!phoneNumber) {
      throw new Error('No phone number found for student');
    }

    const message = this.templates.paymentConfirmation({
      studentName: `${student.first_name} ${student.last_name}`,
      amount: payment.amount,
      reference: payment.transaction_reference,
      balance: payment.balance_after || 0,
      schoolName: process.env.SCHOOL_NAME || 'School'
    });

    return this.sendSMS(phoneNumber, message, {
      messageType: 'PAYMENT_CONFIRMATION',
      studentId: student.id,
      paymentId: payment.id,
      mpesaTransactionId: payment.mpesa_transaction_id
    });
  }

  /**
   * Send exam results notification
   */
  async sendExamResults(student, exam, results) {
    const phoneNumber = student.parent_phone || student.guardian_phone;
    
    if (!phoneNumber) {
      throw new Error('No phone number found for student');
    }

    const message = this.templates.examResults({
      studentName: `${student.first_name} ${student.last_name}`,
      examName: exam.name,
      totalMarks: results.total_marks,
      maxMarks: results.max_marks,
      percentage: results.percentage,
      schoolName: process.env.SCHOOL_NAME || 'School'
    });

    return this.sendSMS(phoneNumber, message, {
      messageType: 'EXAM_RESULTS',
      studentId: student.id
    });
  }

  /**
   * Send attendance alert
   */
  async sendAttendanceAlert(student, date, status) {
    const phoneNumber = student.parent_phone || student.guardian_phone;
    
    if (!phoneNumber) {
      throw new Error('No phone number found for student');
    }

    const message = this.templates.attendanceAlert({
      studentName: `${student.first_name} ${student.last_name}`,
      date,
      status,
      schoolName: process.env.SCHOOL_NAME || 'School'
    });

    return this.sendSMS(phoneNumber, message, {
      messageType: 'ATTENDANCE_ALERT',
      studentId: student.id
    });
  }

  /**
   * Send general announcement
   */
  async sendAnnouncement(phoneNumbers, announcement) {
    const recipients = phoneNumbers.map(phone => ({
      phoneNumber: phone,
      message: announcement,
      messageType: 'ANNOUNCEMENT'
    }));

    return this.sendBulkSMS(recipients);
  }

  /**
   * Log SMS to database
   */
  async logSMS(data) {
    try {
      const result = await db.query(
        `INSERT INTO sms_logs (
          recipient_phone, message, message_type, status,
          provider_message_id, cost, student_id, invoice_id,
          payment_id, mpesa_transaction_id, sent_at, failed_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          data.recipient_phone,
          data.message,
          data.message_type,
          data.status,
          data.provider_message_id || null,
          data.cost || null,
          data.student_id || null,
          data.invoice_id || null,
          data.payment_id || null,
          data.mpesa_transaction_id || null,
          data.sent_at || null,
          data.failed_reason || null
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error('❌ Failed to log SMS:', error.message);
      return null;
    }
  }

  /**
   * Get SMS logs with filters
   */
  async getLogs(filters = {}) {
    const {
      studentId,
      status,
      messageType,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = filters;

    let query = 'SELECT * FROM sms_logs WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (studentId) {
      query += ` AND student_id = $${paramCount}`;
      params.push(studentId);
      paramCount++;
    }

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (messageType) {
      query += ` AND message_type = $${paramCount}`;
      params.push(messageType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';
    
    // Pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM sms_logs WHERE 1=1';
    const countParams = params.slice(0, -2); // Remove limit and offset
    
    if (studentId) countQuery += ` AND student_id = $1`;
    if (status) countQuery += ` AND status = $${countParams.length}`;
    if (messageType) countQuery += ` AND message_type = $${countParams.length}`;
    if (startDate) countQuery += ` AND created_at >= $${countParams.length}`;
    if (endDate) countQuery += ` AND created_at <= $${countParams.length}`;
    
    const countResult = await db.queryOne(countQuery, countParams);
    const total = parseInt(countResult.count);

    return {
      logs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get SMS statistics
   */
  async getStatistics(startDate, endDate) {
    const query = `
      SELECT 
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'SENT') as successful,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        SUM(cost) as total_cost,
        COUNT(DISTINCT student_id) as unique_recipients
      FROM sms_logs
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const result = await db.queryOne(query, [startDate, endDate]);

    return {
      total_sent: parseInt(result.total_sent) || 0,
      successful: parseInt(result.successful) || 0,
      delivered: parseInt(result.delivered) || 0,
      failed: parseInt(result.failed) || 0,
      total_cost: parseFloat(result.total_cost) || 0,
      unique_recipients: parseInt(result.unique_recipients) || 0,
      success_rate: result.total_sent > 0 
        ? ((result.successful / result.total_sent) * 100).toFixed(2)
        : 0
    };
  }

  /**
   * Test SMS service
   */
  async testService() {
    return this.provider.testConnection();
  }

  /**
   * SMS message templates
   */
  templates = {
    feeReminder: ({ studentName, amount, dueDate, schoolName }) => 
      `Dear Parent, ${studentName} has an outstanding balance of KES ${amount} due by ${dueDate}. Please pay to avoid inconvenience. Thank you. - ${schoolName}`,

    paymentConfirmation: ({ studentName, amount, reference, balance, schoolName }) =>
      `Payment received: KES ${amount} for ${studentName}. Ref: ${reference}. Balance: KES ${balance}. Thank you. - ${schoolName}`,

    examResults: ({ studentName, examName, totalMarks, maxMarks, percentage, schoolName }) =>
      `${examName} results for ${studentName}: ${totalMarks}/${maxMarks} (${percentage}%). Full report available at school. - ${schoolName}`,

    attendanceAlert: ({ studentName, date, status, schoolName }) =>
      `Attendance Alert: ${studentName} was marked ${status} on ${date}. Contact school if this is incorrect. - ${schoolName}`,

    general: ({ message, schoolName }) =>
      `${message} - ${schoolName}`
  };
}

// Export singleton instance
module.exports = new SMSService();
