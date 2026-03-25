// src/modules/jobs/sms-queue-processor.job.js
/**
 * SMS Queue Processor
 * 
 * This job runs every 30 seconds and processes pending SMS notifications
 * from the notification_queue table.
 * 
 * Flow:
 * 1. Fetch pending SMS notifications (up to 10 at a time)
 * 2. Send each SMS via the SMS provider (Mobiwave)
 * 3. Log the result in sms_logs table
 * 4. Update notification status in notification_queue
 * 5. Handle failures and retry logic
 */
const { pool } = require('../../config/database');
const db = require('../../shared/database/client');
const smsService = require('../notifications/sms/sms.service');

/**
 * Process pending SMS notifications from the queue
 */
async function processSmsQueue() {
  try {
    console.log('[SMS Queue] Starting SMS queue processing...');

    // Fetch pending notifications scheduled for now or earlier
    const result = await db.query(`
      SELECT * FROM notification_queue
      WHERE type = 'SMS' 
        AND status = 'PENDING'
        AND scheduled_for <= NOW()
        AND attempts < max_attempts
      ORDER BY priority DESC, created_at ASC
      LIMIT 10
    `);

    const notifications = result.rows;

    if (notifications.length === 0) {
      console.log('[SMS Queue] No pending SMS notifications found.');
      return { processed: 0, success: 0, failed: 0 };
    }

    console.log(`[SMS Queue] Found ${notifications.length} pending SMS notifications.`);

    let successCount = 0;
    let failureCount = 0;

    // Process each notification
    for (const notification of notifications) {
      try {
        await processSingleSms(notification);
        successCount++;
      } catch (error) {
        console.error(`[SMS Queue] Failed to process notification ${notification.id}:`, error.message);
        failureCount++;
      }
    }

    console.log(`[SMS Queue] Processing complete. Success: ${successCount}, Failed: ${failureCount}`);

    return {
      processed: notifications.length,
      success: successCount,
      failed: failureCount
    };

  } catch (error) {
    console.error('[SMS Queue] Error processing SMS queue:', error);
    throw error;
  }
}

/**
 * Process a single SMS notification
 */
async function processSingleSms(notification) {
  const startTime = Date.now();
  
  console.log(`[SMS Queue] Processing notification ${notification.id} to ${notification.recipient}`);

  try {
    // Increment attempts counter first
    await db.query(`
      UPDATE notification_queue
      SET attempts = attempts + 1,
          updated_at = NOW()
      WHERE id = $1
    `, [notification.id]);

    // Send SMS via provider
    const smsResult = await smsService.sendSMS({
      recipient: notification.recipient,
      message: notification.message,
      studentId: notification.student_id
    });

    // Calculate cost (example: 0.80 KES per SMS, 1.60 for messages > 160 chars)
    const messageLength = notification.message.length;
    const cost = messageLength > 160 ? 1.60 : 0.80;

    // Log successful SMS in sms_logs table
    await db.query(`
      INSERT INTO sms_logs (
        recipient_phone,
        message,
        message_type,
        status,
        cost,
        provider_message_id,
        student_id,
        invoice_id,
        payment_id,
        sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    `, [
      notification.recipient,
      notification.message,
      notification.message_type || 'GENERAL',
      'SENT', // Initial status, will be updated by delivery webhook
      cost,
      smsResult.messageId || null,
      notification.student_id || null,
      notification.related_entity_type === 'INVOICE' ? notification.related_entity_id : null,
      notification.related_entity_type === 'PAYMENT' ? notification.related_entity_id : null
    ]);

    // Update notification status to SENT
    await db.query(`
      UPDATE notification_queue
      SET status = 'SENT',
          processed_at = NOW(),
          error_message = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [notification.id]);

    const duration = Date.now() - startTime;
    console.log(`[SMS Queue] ✅ Successfully sent SMS ${notification.id} in ${duration}ms`);

  } catch (error) {
    // Handle failure
    const duration = Date.now() - startTime;
    console.error(`[SMS Queue] ❌ Failed to send SMS ${notification.id} after ${duration}ms:`, error.message);

    // Check if max attempts reached
    const updatedNotification = await db.queryOne(`
      SELECT attempts, max_attempts FROM notification_queue WHERE id = $1
    `, [notification.id]);

    const isFinalAttempt = updatedNotification.attempts >= updatedNotification.max_attempts;

    // Update notification status
    await db.query(`
      UPDATE notification_queue
      SET status = $1,
          error_message = $2,
          processed_at = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [
      isFinalAttempt ? 'FAILED' : 'PENDING', // Keep as PENDING if retries remain
      error.message.substring(0, 500), // Store error message (truncate to 500 chars)
      isFinalAttempt ? new Date() : null,
      notification.id
    ]);

    // Log failed SMS
    await db.query(`
      INSERT INTO sms_logs (
        recipient_phone,
        message,
        message_type,
        status,
        cost,
        error_message,
        student_id,
        sent_at
      ) VALUES ($1, $2, $3, 'FAILED', 0, $4, $5, NOW())
    `, [
      notification.recipient,
      notification.message,
      notification.message_type || 'GENERAL',
      error.message.substring(0, 500),
      notification.student_id || null
    ]);

    throw error; // Re-throw to count as failure
  }
}

/**
 * Clean up old processed notifications (optional maintenance)
 * Run this weekly to prevent table bloat
 */
async function cleanupOldNotifications() {
  try {
    console.log('[SMS Queue] Cleaning up old notifications...');

    // Delete SENT notifications older than 30 days
    const deleteResult = await db.query(`
      DELETE FROM notification_queue
      WHERE status = 'SENT'
        AND processed_at < NOW() - INTERVAL '30 days'
    `);

    console.log(`[SMS Queue] Deleted ${deleteResult.rowCount} old notifications.`);
    return deleteResult.rowCount;

  } catch (error) {
    console.error('[SMS Queue] Error cleaning up old notifications:', error);
    throw error;
  }
}

module.exports = {
  processSmsQueue,
  cleanupOldNotifications
};
