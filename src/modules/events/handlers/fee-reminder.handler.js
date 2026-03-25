/**
 * Fee Reminder Event Handler
 * Handles sending fee reminders to parents with outstanding balances
 * Uses sms_logs table (not notification_logs)
 */

const smsService = require('../../notifications/sms/sms.service');
const db = require('../../../shared/database/client');

/**
 * Handle fee reminder event
 * @param {Object} data - Event data
 * @param {number} data.invoiceId - Invoice ID (optional - if not provided, sends to all overdue)
 * @param {number} data.studentId - Student ID (optional - for single student reminder)
 * @param {number} data.termId - Term ID (optional - for term-specific reminders)
 */
const handleFeeReminder = async (data) => {
  try {
    console.log('💰 [EVENT] Fee Reminder:', data);

    const { invoiceId, studentId, termId } = data;

    // Build query based on provided filters
    let query = `
      SELECT 
        i.id as invoice_id,
        i.total_amount,
        i.status,
        i.due_date,
        s.id as student_id,
        s.first_name,
        s.last_name,
        s.admission_no,
        c.name as class_name,
        at.term,
        at.year,
        pc.name as parent_name,
        pc.phone as parent_phone,
        COALESCE(SUM(p.amount), 0) as paid_amount,
        (i.total_amount - COALESCE(SUM(p.amount), 0)) as balance
      FROM invoices i
      JOIN students s ON s.id = i.student_id
      JOIN classes c ON c.id = s.class_id
      JOIN academic_terms at ON at.id = i.term_id
      LEFT JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
      LEFT JOIN payments p ON p.invoice_id = i.id
      WHERE i.status IN ('UNPAID', 'PARTIAL')
        AND s.is_active = TRUE
    `;

    const params = [];
    let paramIndex = 1;

    if (invoiceId) {
      query += ` AND i.id = $${paramIndex++}`;
      params.push(invoiceId);
    }

    if (studentId) {
      query += ` AND s.id = $${paramIndex++}`;
      params.push(studentId);
    }

    if (termId) {
      query += ` AND i.term_id = $${paramIndex++}`;
      params.push(termId);
    }

    query += `
      GROUP BY i.id, s.id, c.id, at.id, pc.name, pc.phone
      HAVING (i.total_amount - COALESCE(SUM(p.amount), 0)) > 0
      ORDER BY i.due_date ASC
    `;

    const overdueInvoices = await db.queryAll(query, params);

    console.log(`📨 Sending fee reminders to ${overdueInvoices.length} parents`);

    if (overdueInvoices.length === 0) {
      console.log('ℹ️  No overdue invoices found');
      return {
        success: true,
        remindersSent: 0,
        totalRecipients: 0
      };
    }

    // Send SMS to each parent
    const reminders = overdueInvoices
      .filter(inv => inv.parent_phone) // Only parents with phone numbers
      .map(invoice => {
        const balance = parseFloat(invoice.balance).toFixed(2);
        const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB');
        
        const message = `Dear ${invoice.parent_name || 'Parent'}, this is a reminder that ${invoice.first_name} ${invoice.last_name} (${invoice.admission_no}) has an outstanding fee balance of KES ${balance}. Term: ${invoice.term}/${invoice.year}. Due: ${dueDate}. Please clear to avoid inconvenience. - Msingi School`;
        
        return smsService.sendSMS({
          to: invoice.parent_phone,
          message,
          context: {
            type: 'FEE_REMINDER',
            invoiceId: invoice.invoice_id,
            studentId: invoice.student_id,
            balance: balance
          }
        }).catch(err => {
          console.error(`Failed to send reminder to ${invoice.parent_phone}:`, err.message);
          return null;
        });
      });

    const results = await Promise.allSettled(reminders);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    console.log(`✅ Fee reminders: ${successful}/${reminders.length} sent`);

    // Note: sms_logs table is populated by smsService.sendSMS() automatically
    // No need to manually insert here

    return {
      success: true,
      remindersSent: successful,
      totalRecipients: reminders.length
    };

  } catch (error) {
    console.error('❌ [EVENT] Error handling fee reminder event:', error);
    throw error;
  }
};

/**
 * Send reminder for invoices due soon (e.g., 7 days before due date)
 * @param {Object} data - Event data
 * @param {number} data.daysBeforeDue - Days before due date to send reminder (default: 7)
 */
const handleUpcomingDueReminder = async (data = {}) => {
  try {
    const daysBeforeDue = data.daysBeforeDue || 7;
    console.log(`💰 [EVENT] Upcoming Due Reminder (${daysBeforeDue} days)`);

    const upcomingDue = await db.queryAll(
      `SELECT 
         i.id as invoice_id,
         i.total_amount,
         i.due_date,
         s.id as student_id,
         s.first_name,
         s.last_name,
         pc.name as parent_name,
         pc.phone as parent_phone,
         COALESCE(SUM(p.amount), 0) as paid_amount,
         (i.total_amount - COALESCE(SUM(p.amount), 0)) as balance
       FROM invoices i
       JOIN students s ON s.id = i.student_id
       LEFT JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
       LEFT JOIN payments p ON p.invoice_id = i.id
       WHERE i.status IN ('UNPAID', 'PARTIAL')
         AND i.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '${daysBeforeDue} days')
         AND s.is_active = TRUE
       GROUP BY i.id, s.id, pc.name, pc.phone
       HAVING (i.total_amount - COALESCE(SUM(p.amount), 0)) > 0
       ORDER BY i.due_date ASC`
    );

    console.log(`📨 Sending upcoming due reminders to ${upcomingDue.length} parents`);

    if (upcomingDue.length === 0) {
      return { success: true, remindersSent: 0, totalRecipients: 0 };
    }

    const reminders = upcomingDue
      .filter(inv => inv.parent_phone)
      .map(invoice => {
        const balance = parseFloat(invoice.balance).toFixed(2);
        const dueDate = new Date(invoice.due_date).toLocaleDateString('en-GB');
        
        const message = `Dear ${invoice.parent_name || 'Parent'}, ${invoice.first_name}'s fee balance of KES ${balance} is due on ${dueDate}. Please pay early to avoid late penalties. Thank you. - Msingi School`;
        
        return smsService.sendSMS({
          to: invoice.parent_phone,
          message,
          context: {
            type: 'FEE_DUE_SOON',
            invoiceId: invoice.invoice_id,
            studentId: invoice.student_id
          }
        }).catch(err => null);
      });

    const results = await Promise.allSettled(reminders);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    console.log(`✅ Upcoming due reminders: ${successful}/${reminders.length} sent`);

    return {
      success: true,
      remindersSent: successful,
      totalRecipients: reminders.length
    };

  } catch (error) {
    console.error('❌ [EVENT] Error handling upcoming due reminder:', error);
    throw error;
  }
};

module.exports = {
  handleFeeReminder,
  handleUpcomingDueReminder
};