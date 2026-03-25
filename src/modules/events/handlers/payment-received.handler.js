/**
 * Payment Received Event Handler
 * Handles actions when a payment is received (e.g., send receipt, update records)
 * Uses sms_logs table (not notification_logs)
 */

const smsService = require('../../notifications/sms/sms.service');
const db = require('../../../shared/database/client');

/**
 * Handle payment received event
 * @param {Object} data - Event data
 * @param {number} data.paymentId - Payment ID
 * @param {number} data.studentId - Student ID
 * @param {number} data.invoiceId - Invoice ID
 * @param {number} data.amount - Payment amount
 * @param {string} data.paymentMethod - Payment method (MPESA, CASH, BANK, etc.)
 * @param {string} data.referenceNumber - Payment reference number
 */
const handlePaymentReceived = async (data) => {
  try {
    console.log('💸 [EVENT] Payment Received:', data);

    const { paymentId, studentId, invoiceId, amount, paymentMethod, referenceNumber } = data;

    // Get payment details with student and invoice info
    const paymentDetails = await db.queryOne(
      `SELECT 
         p.id as payment_id,
         p.amount,
         p.payment_method,
         p.reference_number,
         p.payment_date,
         s.id as student_id,
         s.first_name,
         s.last_name,
         s.admission_no,
         c.name as class_name,
         i.id as invoice_id,
         i.total_amount,
         i.status as invoice_status,
         at.term,
         at.year,
         pc.name as parent_name,
         pc.phone as parent_phone,
         COALESCE(SUM(all_payments.amount), 0) as total_paid,
         (i.total_amount - COALESCE(SUM(all_payments.amount), 0)) as balance
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN students s ON s.id = i.student_id
       JOIN classes c ON c.id = s.class_id
       JOIN academic_terms at ON at.id = i.term_id
       LEFT JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
       LEFT JOIN payments all_payments ON all_payments.invoice_id = i.id
       WHERE p.id = $1
       GROUP BY p.id, s.id, c.id, i.id, at.id, pc.name, pc.phone`,
      [paymentId]
    );

    if (!paymentDetails) {
      console.error(` Payment ${paymentId} not found`);
      return { success: false, error: 'Payment not found' };
    }

    console.log(` Sending payment receipt to parent: ${paymentDetails.parent_phone}`);

    // Send SMS receipt to parent
    if (paymentDetails.parent_phone) {
      const paidAmount = parseFloat(paymentDetails.amount).toFixed(2);
      const balance = parseFloat(paymentDetails.balance).toFixed(2);
      const totalPaid = parseFloat(paymentDetails.total_paid).toFixed(2);
      const totalAmount = parseFloat(paymentDetails.total_amount).toFixed(2);
      const paymentDate = new Date(paymentDetails.payment_date).toLocaleDateString('en-GB');

      let message = `Dear ${paymentDetails.parent_name || 'Parent'}, we confirm receipt of KES ${paidAmount} for ${paymentDetails.first_name} ${paymentDetails.last_name} (${paymentDetails.admission_no}). `;
      
      message += `Ref: ${paymentDetails.reference_number}. `;
      message += `Total Paid: KES ${totalPaid}/${totalAmount}. `;
      
      if (parseFloat(balance) > 0) {
        message += `Balance: KES ${balance}. `;
      } else {
        message += `Fully paid. `;
      }
      
      message += `Thank you. - Msingi School`;

      try {
        await smsService.sendSMS({
          to: paymentDetails.parent_phone,
          message,
          context: {
            type: 'PAYMENT_RECEIPT',
            paymentId,
            invoiceId,
            studentId,
            amount: paidAmount
          }
        });
        console.log(` Payment receipt sent to ${paymentDetails.parent_phone}`);
      } catch (smsError) {
        console.error(`Failed to send receipt SMS:`, smsError.message);
      }
    } else {
      console.warn(`  No parent phone number for student ${studentId}`);
    }

    // Note: sms_logs table is populated by smsService.sendSMS() automatically
    // No need to manually insert here

    // If invoice is now fully paid, send congratulations message
    if (parseFloat(paymentDetails.balance) <= 0 && paymentDetails.parent_phone) {
      try {
        const congrats = `Dear ${paymentDetails.parent_name || 'Parent'}, congratulations! ${paymentDetails.first_name}'s fees for Term ${paymentDetails.term}/${paymentDetails.year} are now fully paid. Thank you for your prompt payment. - Msingi School`;
        
        await smsService.sendSMS({
          to: paymentDetails.parent_phone,
          message: congrats,
          context: {
            type: 'FEES_FULLY_PAID',
            invoiceId,
            studentId
          }
        });
        console.log(`🎉 Full payment congratulations sent`);
      } catch (err) {
        console.error(`Failed to send congratulations SMS:`, err.message);
      }
    }

    return {
      success: true,
      receiptSent: !!paymentDetails.parent_phone,
      studentName: `${paymentDetails.first_name} ${paymentDetails.last_name}`,
      amountPaid: parseFloat(paymentDetails.amount),
      balance: parseFloat(paymentDetails.balance)
    };

  } catch (error) {
    console.error(' [EVENT] Error handling payment received event:', error);
    throw error;
  }
};

/**
 * Handle M-Pesa payment confirmation (specialized handler for M-Pesa payments)
 * @param {Object} data - M-Pesa payment data
 */
const handleMpesaPaymentReceived = async (data) => {
  try {
    console.log(' [EVENT] M-Pesa Payment Received:', data);

    const { transactionId, mpesaReceiptNumber, amount, phoneNumber, studentId } = data;

    // Get student and parent details
    const student = await db.queryOne(
      `SELECT 
         s.id,
         s.first_name,
         s.last_name,
         s.admission_no,
         pc.name as parent_name,
         pc.phone as parent_phone
       FROM students s
       LEFT JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
       WHERE s.id = $1`,
      [studentId]
    );

    if (!student) {
      console.error(` Student ${studentId} not found`);
      return { success: false, error: 'Student not found' };
    }

    // Send immediate confirmation SMS
    const parentPhone = student.parent_phone || phoneNumber;
    
    if (parentPhone) {
      const paidAmount = parseFloat(amount).toFixed(2);
      const message = `Dear ${student.parent_name || 'Parent'}, your M-Pesa payment of KES ${paidAmount} for ${student.first_name} has been received. Receipt: ${mpesaReceiptNumber}. Payment will be allocated to your account shortly. Thank you. - Msingi School`;

      try {
        await smsService.sendSMS({
          to: parentPhone,
          message,
          context: {
            type: 'MPESA_CONFIRMATION',
            transactionId,
            mpesaReceiptNumber,
            studentId,
            amount: paidAmount
          }
        });
        console.log(` M-Pesa confirmation sent to ${parentPhone}`);
      } catch (smsError) {
        console.error(`Failed to send M-Pesa confirmation:`, smsError.message);
      }
    }

    return {
      success: true,
      confirmationSent: !!parentPhone,
      mpesaReceiptNumber,
      amount: parseFloat(amount)
    };

  } catch (error) {
    console.error(' [EVENT] Error handling M-Pesa payment:', error);
    throw error;
  }
};

module.exports = {
  handlePaymentReceived,
  handleMpesaPaymentReceived
};