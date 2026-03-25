/**
 * Exam Published Event Handler
 * Handles actions when an exam is published (e.g., notify students/parents)
 */

const smsService = require('../../notifications/sms/sms.service');
const db = require('../../../shared/database/client');

/**
 * Handle exam published event
 * @param {Object} data - Event data
 * @param {number} data.examId - The published exam ID
 * @param {string} data.examName - Name of the exam
 * @param {number} data.classId - Class ID
 * @param {Date} data.examDate - Date of the exam
 */
const handleExamPublished = async (data) => {
  try {
    console.log(' [EVENT] Exam Published:', data);

    const { examId, examName, classId, examDate } = data;

    // Get all students in the class with parent contacts
    const students = await db.queryAll(
      `SELECT 
         s.id,
         s.first_name,
         s.last_name,
         s.admission_no,
         pc.name as parent_name,
         pc.phone as parent_phone
       FROM students s
       LEFT JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
       WHERE s.class_id = $1 AND s.is_active = TRUE`,
      [classId]
    );

    console.log(`📨 Sending exam notifications to ${students.length} students`);

    // Send SMS to each parent
    const notifications = students
      .filter(s => s.parent_phone) // Only students with parent phone
      .map(student => {
        const message = `Dear ${student.parent_name || 'Parent'}, ${examName} has been published for ${student.first_name}. Exam Date: ${examDate}. Please prepare your child. - Msingi School`;
        
        return smsService.sendSMS({
          to: student.parent_phone,
          message,
          context: {
            type: 'EXAM_PUBLISHED',
            examId,
            studentId: student.id
          }
        }).catch(err => {
          console.error(`Failed to send SMS to ${student.parent_phone}:`, err.message);
          return null;
        });
      });

    const results = await Promise.allSettled(notifications);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    console.log(`✅ Exam published notifications: ${successful}/${notifications.length} sent`);

    return {
      success: true,
      notificationsSent: successful,
      totalRecipients: notifications.length
    };

  } catch (error) {
    console.error('❌ [EVENT] Error handling exam published event:', error);
    throw error;
  }
};

module.exports = {
  handleExamPublished
};