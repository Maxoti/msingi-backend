// src/modules/jobs/scheduler.js
/**
 * Job Scheduler
 * 
 * Manages all background jobs using node-cron.
 * Jobs run automatically at scheduled intervals.
 * 
 * Jobs:
 * 1. SMS Queue Processor - Every 30 seconds
 * 2. Fee Reminders - Daily at 9:00 AM
 * 3. M-Pesa Auto-Reconciliation - Daily at 10:00 AM
 * 4. Cleanup Old Notifications - Weekly on Sunday at 2:00 AM
 * 
 * Usage:
 *   const scheduler = require('./modules/jobs/scheduler');
 *   scheduler.start();  // In server.js
 */

const { pool } = require('../../config/database');
const cron = require('node-cron');
const smsQueueProcessor = require('./sms-queue-processor.job');
const feeReminder = require('./fee-reminder.job');
const mpesaReconciliation = require('./mpesa-reconciliation.job');

// Track running jobs
const jobs = new Map();
let isRunning = false;

/**
 * Start all scheduled jobs
 */
function start() {
  if (isRunning) {
    console.log('[Scheduler] Jobs already running.');
    return;
  }

  console.log('[Scheduler] Starting background jobs...');

  // ============================================================
  // JOB 1: SMS Queue Processor
  // Runs every 30 seconds to process pending SMS
  // ============================================================
  const smsProcessorJob = cron.schedule('*/30 * * * * *', async () => {
    try {
      await smsQueueProcessor.processSmsQueue();
    } catch (error) {
      console.error('[Scheduler] SMS Queue Processor error:', error);
    }
  }, {
    scheduled: true,
    timezone: "Africa/Nairobi"
  });

  jobs.set('smsProcessor', smsProcessorJob);
  console.log('[Scheduler] ✅ SMS Queue Processor scheduled (every 30 seconds)');

  // ============================================================
  // JOB 2: Fee Reminders
  // Runs daily at 9:00 AM to send fee reminders
  // ============================================================
  const feeReminderJob = cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[Scheduler] Running daily fee reminder job...');
      const result = await feeReminder.sendFeeReminders();
      console.log(`[Scheduler] Fee reminder job complete: ${result.notificationsCreated} notifications created`);
    } catch (error) {
      console.error('[Scheduler] Fee Reminder error:', error);
    }
  }, {
    scheduled: true,
    timezone: "Africa/Nairobi"
  });

  jobs.set('feeReminder', feeReminderJob);
  console.log('[Scheduler] ✅ Fee Reminder scheduled (daily at 9:00 AM)');

  // ============================================================
  // JOB 3: M-Pesa Auto-Reconciliation
  // Runs daily at 10:00 AM to auto-reconcile M-Pesa payments
  // ============================================================
  const mpesaReconciliationJob = cron.schedule('0 10 * * *', async () => {
    try {
      console.log('[Scheduler] Running M-Pesa auto-reconciliation...');
      const result = await mpesaReconciliation.autoReconcileMpesaPayments();
      console.log(`[Scheduler] M-Pesa reconciliation complete: ${result.reconciled} reconciled, ${result.failed} failed`);
    } catch (error) {
      console.error('[Scheduler] M-Pesa reconciliation error:', error);
    }
  }, {
    scheduled: true,
    timezone: "Africa/Nairobi"
  });

  jobs.set('mpesaReconciliation', mpesaReconciliationJob);
  console.log('[Scheduler] ✅ M-Pesa Auto-Reconciliation scheduled (daily at 10:00 AM)');

  // ============================================================
  // JOB 4: Cleanup Old Notifications
  // Runs weekly on Sunday at 2:00 AM
  // ============================================================
  const cleanupJob = cron.schedule('0 2 * * 0', async () => {
    try {
      console.log('[Scheduler] Running weekly cleanup job...');
      const deleted = await smsQueueProcessor.cleanupOldNotifications();
      console.log(`[Scheduler] Cleanup complete: ${deleted} old notifications deleted`);
    } catch (error) {
      console.error('[Scheduler] Cleanup error:', error);
    }
  }, {
    scheduled: true,
    timezone: "Africa/Nairobi"
  });

  jobs.set('cleanup', cleanupJob);
  console.log('[Scheduler] ✅ Cleanup scheduled (weekly on Sunday at 2:00 AM)');

  // ============================================================
  // OPTIONAL: Add more jobs here
  // ============================================================

  // Example: Attendance reminder (daily at 8:00 AM)
  // const attendanceReminderJob = cron.schedule('0 8 * * *', async () => {
  //   try {
  //     await attendanceReminder.send();
  //   } catch (error) {
  //     console.error('[Scheduler] Attendance Reminder error:', error);
  //   }
  // }, {
  //   scheduled: true,
  //   timezone: "Africa/Nairobi"
  // });
  // jobs.set('attendanceReminder', attendanceReminderJob);

  isRunning = true;
  console.log('[Scheduler] All jobs started successfully ✅');
  console.log(`[Scheduler] ${jobs.size} jobs running`);
}

/**
 * Stop all scheduled jobs
 */
function stop() {
  if (!isRunning) {
    console.log('[Scheduler] No jobs running.');
    return;
  }

  console.log('[Scheduler] Stopping all jobs...');

  jobs.forEach((job, name) => {
    job.stop();
    console.log(`[Scheduler] Stopped ${name}`);
  });

  jobs.clear();
  isRunning = false;

  console.log('[Scheduler] All jobs stopped ✅');
}

/**
 * Get status of all jobs
 */
function getStatus() {
  const status = {
    running: isRunning,
    jobCount: jobs.size,
    jobs: []
  };

  jobs.forEach((job, name) => {
    status.jobs.push({
      name,
      running: job.getStatus() === 'scheduled'
    });
  });

  return status;
}

/**
 * Manually run a specific job (for testing or admin triggers)
 */
async function runJob(jobName) {
  console.log(`[Scheduler] Manually running job: ${jobName}`);

  switch (jobName) {
    case 'smsProcessor':
      return await smsQueueProcessor.processSmsQueue();
    
    case 'feeReminder':
      return await feeReminder.sendFeeReminders();
    
    case 'mpesaReconciliation':
      return await mpesaReconciliation.autoReconcileMpesaPayments();
    
    case 'cleanup':
      return await smsQueueProcessor.cleanupOldNotifications();
    
    default:
      throw new Error(`Unknown job: ${jobName}`);
  }
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('[Scheduler] Shutting down gracefully...');
  stop();
}

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  start,
  stop,
  getStatus,
  runJob
};