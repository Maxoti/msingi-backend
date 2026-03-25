// src/modules/jobs/fee-reminder.job.js
/**
 * Fee Reminder Job
 * 
 * Automatically sends SMS reminders to parents of students with outstanding fees.
 * Runs daily at 9:00 AM to check for unpaid invoices and queue SMS notifications.
 * 
 * Logic:
 * 1. Find all unpaid/partially paid invoices
 * 2. Filter based on reminder rules (e.g., 7 days before due date, on due date, 3 days overdue)
 * 3. Create SMS notifications in notification_queue
 * 4. SMS queue processor will send them automatically
 */

const { pool } = require('../../config/database');
/**
 * Send fee reminders for students with outstanding balances
 */
async function sendFeeReminders() {
  try {
    console.log('[Fee Reminder] Starting fee reminder job...');

    // Get students with outstanding fees
    const studentsWithFees = await getStudentsWithOutstandingFees();

    if (studentsWithFees.length === 0) {
      console.log('[Fee Reminder] No students with outstanding fees found.');
      return { notificationsCreated: 0 };
    }

    console.log(`[Fee Reminder] Found ${studentsWithFees.length} students with outstanding fees.`);

    let notificationsCreated = 0;

    // Create SMS notification for each student
    for (const student of studentsWithFees) {
      try {
        await createFeeReminderNotification(student);
        notificationsCreated++;
      } catch (error) {
        console.error(`[Fee Reminder] Failed to create notification for student ${student.student_id}:`, error.message);
      }
    }

    console.log(`[Fee Reminder] Job complete. Created ${notificationsCreated} notifications.`);

    return { notificationsCreated };

  } catch (error) {
    console.error('[Fee Reminder] Error in fee reminder job:', error);
    throw error;
  }
}

/**
 * Get students with outstanding fees that need reminders
 */
async function getStudentsWithOutstandingFees() {
  const query = `
    SELECT 
      s.id as student_id,
      s.first_name,
      s.last_name,
      s.admission_no,
      pc.phone as parent_phone,
      pc.name as parent_name,
      i.id as invoice_id,
      i.total_amount,
      i.amount_paid,
      (i.total_amount - i.amount_paid) as balance,
      i.due_date,
      i.term_id,
      CASE 
        WHEN i.due_date < CURRENT_DATE THEN 'OVERDUE'
        WHEN i.due_date = CURRENT_DATE THEN 'DUE_TODAY'
        WHEN i.due_date = CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_IN_7_DAYS'
        WHEN i.due_date = CURRENT_DATE + INTERVAL '3 days' THEN 'DUE_IN_3_DAYS'
        ELSE 'UPCOMING'
      END as reminder_type
    FROM students s
    INNER JOIN parent_contacts pc ON s.id = pc.student_id AND pc.is_primary = TRUE
    INNER JOIN invoices i ON s.id = i.student_id
    WHERE s.is_active = TRUE
      AND i.status IN ('PENDING', 'PARTIALLY_PAID')
      AND (i.total_amount - i.amount_paid) > 0
      AND pc.phone IS NOT NULL
      AND (
        -- Send reminder 7 days before due date
        i.due_date = CURRENT_DATE + INTERVAL '7 days'
        -- Send reminder 3 days before due date
        OR i.due_date = CURRENT_DATE + INTERVAL '3 days'
        -- Send reminder on due date
        OR i.due_date = CURRENT_DATE
        -- Send reminder for overdue (but not if already sent today)
        OR (
          i.due_date < CURRENT_DATE 
          AND NOT EXISTS (
            SELECT 1 FROM notification_queue nq
            WHERE nq.student_id = s.id
              AND nq.related_entity_type = 'INVOICE'
              AND nq.related_entity_id = i.id
              AND DATE(nq.created_at) = CURRENT_DATE
          )
        )
      )
    ORDER BY i.due_date ASC, s.last_name ASC
  `;

  const result = await db.query(query);
  return result.rows;
}

/**
 * Create a fee reminder notification for a student
 */
async function createFeeReminderNotification(student) {
  const message = buildFeeReminderMessage(student);

  // Determine priority based on reminder type
  const priorityMap = {
    'OVERDUE': 8,        // Highest priority
    'DUE_TODAY': 7,
    'DUE_IN_3_DAYS': 5,
    'DUE_IN_7_DAYS': 4,
    'UPCOMING': 3
  };
  const priority = priorityMap[student.reminder_type] || 5;

  // Create notification in the queue
  const result = await db.queryOne(`
    INSERT INTO notification_queue (
      type,
      recipient,
      message,
      priority,
      scheduled_for,
      status,
      attempts,
      max_attempts,
      student_id,
      related_entity_type,
      related_entity_id,
      message_type,
      created_at
    ) VALUES (
      'SMS',
      $1,
      $2,
      $3,
      NOW(),
      'PENDING',
      0,
      3,
      $4,
      'INVOICE',
      $5,
      'FEE_REMINDER',
      NOW()
    )
    RETURNING id
  `, [
    student.parent_phone,
    message,
    priority,
    student.student_id,
    student.invoice_id
  ]);

  console.log(`[Fee Reminder] Created notification ${result.id} for ${student.first_name} ${student.last_name} (Balance: KES ${student.balance})`);

  return result;
}

/**
 * Build the SMS message based on reminder type
 */
function buildFeeReminderMessage(student) {
  const studentName = `${student.first_name} ${student.last_name}`;
  const balance = parseFloat(student.balance).toLocaleString('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  });

  const dueDate = new Date(student.due_date).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let message = '';

  switch (student.reminder_type) {
    case 'OVERDUE':
      const daysOverdue = Math.floor((new Date() - new Date(student.due_date)) / (1000 * 60 * 60 * 24));
      message = `Dear parent, ${studentName} has an OVERDUE fee balance of ${balance} (${daysOverdue} days overdue). Please clear immediately to avoid penalties. - Msingi School`;
      break;

    case 'DUE_TODAY':
      message = `Dear parent, ${studentName}'s fee payment of ${balance} is DUE TODAY. Please pay to avoid late fees. M-Pesa: Paybill 123456, Account: ${student.admission_no}. - Msingi School`;
      break;

    case 'DUE_IN_3_DAYS':
      message = `Dear parent, reminder that ${studentName}'s fee balance of ${balance} is due in 3 days (${dueDate}). M-Pesa: Paybill 123456. - Msingi School`;
      break;

    case 'DUE_IN_7_DAYS':
      message = `Dear parent, ${studentName} has a fee balance of ${balance} due on ${dueDate}. Please plan to pay before the deadline. - Msingi School`;
      break;

    default:
      message = `Dear parent, ${studentName} has an outstanding fee balance of ${balance}. Due date: ${dueDate}. - Msingi School`;
  }

  return message;
}

/**
 * Send fee reminders for a specific term
 * (Can be called manually for specific terms)
 */
async function sendFeeRemindersForTerm(termId) {
  try {
    console.log(`[Fee Reminder] Sending reminders for term ${termId}...`);

    const query = `
      SELECT 
        s.id as student_id,
        s.first_name,
        s.last_name,
        s.admission_no,
        pc.phone as parent_phone,
        i.id as invoice_id,
        i.total_amount,
        i.amount_paid,
        (i.total_amount - i.amount_paid) as balance,
        i.due_date
      FROM students s
      INNER JOIN parent_contacts pc ON s.id = pc.student_id AND pc.is_primary = TRUE
      INNER JOIN invoices i ON s.id = i.student_id
      WHERE s.is_active = TRUE
        AND i.term_id = $1
        AND i.status IN ('PENDING', 'PARTIALLY_PAID')
        AND (i.total_amount - i.amount_paid) > 0
        AND pc.phone IS NOT NULL
    `;

    const result = await db.query(query, [termId]);
    const students = result.rows;

    let created = 0;
    for (const student of students) {
      student.reminder_type = 'UPCOMING'; // Default type for manual reminders
      await createFeeReminderNotification(student);
      created++;
    }

    console.log(`[Fee Reminder] Created ${created} reminders for term ${termId}`);
    return { notificationsCreated: created };

  } catch (error) {
    console.error('[Fee Reminder] Error sending term reminders:', error);
    throw error;
  }
}

module.exports = {
  sendFeeReminders,
  sendFeeRemindersForTerm
};