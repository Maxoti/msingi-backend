/**
 * Results Service
 * Handles student exam report generation, PDF export, and result delivery
 * Caching applied to all read-heavy operations
 */

const examsRepository    = require('./exams.repository');
const studentsRepository = require('../students/students.repository');
const PDFDocument        = require('pdfkit');
const { AppError }       = require('../../shared/middleware/errorHandler');
const cache              = require('../../shared/cache/cache.service');

class ResultsService {

  /* ========================================================================
     GRADE HELPERS
     ======================================================================== */

  calculateGrade(percentage) {
    if (percentage >= 90) return 'EE1';
    if (percentage >= 80) return 'EE2';
    if (percentage >= 70) return 'ME1';
    if (percentage >= 60) return 'ME2';
    if (percentage >= 50) return 'AE1';
    if (percentage >= 40) return 'AE2';
    if (percentage >= 30) return 'BE1';
    return 'BE2';
  }

  getPerformanceLevel(grade) {
    const levels = {
      EE1: 'Exceeds Expectations - Outstanding',
      EE2: 'Exceeds Expectations - Excellent',
      ME1: 'Meets Expectations - Very Good',
      ME2: 'Meets Expectations - Good',
      AE1: 'Approaches Expectations - Satisfactory',
      AE2: 'Approaches Expectations - Fair',
      BE1: 'Below Expectations - Needs Improvement',
      BE2: 'Below Expectations - Significant Support Needed',
    };
    return levels[grade] || 'Not Graded';
  }

  /* ========================================================================
     REPORT DATA
     ======================================================================== */

  /**
   * Get full exam report for a student.
   * Cached per exam + student — invalidated when results are updated.
   */
  async getStudentExamReport(examId, studentId, schoolId) {
    const cacheKey = `results:${schoolId}:report:${examId}:${studentId}`;

    // ✅ Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status !== 'PUBLISHED')
      throw new AppError('Exam results are not yet published', 400);

    const student = await studentsRepository.findById(schoolId, studentId);
    if (!student) throw new AppError('Student not found', 404);

    const results = await examsRepository.getStudentResults(examId, studentId, schoolId);
    if (!results.length) throw new AppError('No results found for this student', 404);

    const processedResults = results.map(r => {
      const percentage = (parseFloat(r.marks) / r.max_marks) * 100;
      const grade      = this.calculateGrade(percentage);
      return {
        subject_name:      r.subject_name,
        marks:             parseFloat(r.marks),
        max_marks:         r.max_marks,
        percentage:        percentage.toFixed(2),
        grade,
        performance_level: this.getPerformanceLevel(grade),
      };
    });

    const totalMarks      = processedResults.reduce((s, r) => s + r.marks, 0);
    const totalMaxMarks   = processedResults.reduce((s, r) => s + r.max_marks, 0);
    const overallPct      = (totalMarks / totalMaxMarks) * 100;
    const overallGrade    = this.calculateGrade(overallPct);

    const data = {
      exam: {
        id:   exam.id,
        name: exam.name,
        type: exam.exam_type,
        term: exam.term_name,
        year: exam.term_year,
      },
      student: {
        id:               student.id,
        name:             `${student.firstName} ${student.lastName}`,
        admission_number: student.admissionNo,
        class:            student.class_name || 'N/A',
      },
      results: processedResults,
      summary: {
        total_marks:        totalMarks,
        total_max_marks:    totalMaxMarks,
        overall_percentage: overallPct.toFixed(2),
        overall_grade:      overallGrade,
        performance_level:  this.getPerformanceLevel(overallGrade),
        subjects_count:     results.length,
      },
    };

    // ✅ Cache for 5 minutes
    await cache.set(cacheKey, data, cache.TTL.exams);

    return data;
  }

  /**
   * Get class exam summary — ranked list of all students.
   * Cached per exam + class.
   */
  async getClassExamSummary(examId, classId, schoolId) {
    const cacheKey = `results:${schoolId}:class-summary:${examId}:${classId}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const db      = require('../../shared/database/client');
    const results = await db.schoolQuery(schoolId, `
      SELECT
        s.id              AS student_id,
        s.first_name,
        s.last_name,
        s.admission_no    AS admission_number,
        SUM(er.marks)     AS total_marks,
        COUNT(DISTINCT er.subject_id) AS subjects_count
      FROM students s
      JOIN exam_results er ON s.id = er.student_id
      WHERE er.exam_id = $1 AND s.class_id = $2
      GROUP BY s.id
      ORDER BY total_marks DESC
    `, [examId, classId]);

    await cache.set(cacheKey, results, cache.TTL.exams);
    return results;
  }

  /* ========================================================================
     PDF GENERATION
     ======================================================================== */

  /**
   * Generate PDF report buffer for a student.
   * Note: PDF binary cannot be stored in Redis — we cache the report DATA
   * and regenerate the PDF quickly from it on repeated calls.
   */
  async generatePDFReport(examId, studentId, schoolId) {
    const reportData = await this.getStudentExamReport(examId, studentId, schoolId);

    return new Promise((resolve, reject) => {
      try {
        const doc    = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end',  ()    => resolve(Buffer.concat(chunks)));

        // ── Header ────────────────────────────────────────────────────────
        doc.fontSize(20).fillColor('#0066cc')
           .text('EXAM MANAGEMENT 5.0', { align: 'center' });
        doc.moveDown(1);

        // ── Student info ──────────────────────────────────────────────────
        doc.fontSize(12).fillColor('#000000')
           .text('STUDENT INFORMATION', { underline: true });
        doc.moveDown(0.5).fontSize(10);
        doc.text(`Student ID: ${reportData.student.id}`);
        doc.text(`Name: ${reportData.student.name}`);
        doc.text(`Class: ${reportData.student.class}`);
        doc.text(`Year: ${reportData.exam.year}`);
        doc.text(`Term: ${reportData.exam.term}`);
        doc.moveDown(1.5);

        // ── Academic performance table ────────────────────────────────────
        doc.fontSize(12).fillColor('#000000')
           .text('ACADEMIC PERFORMANCE', { underline: true });
        doc.moveDown(0.5);

        const tableTop = doc.y;
        const col1X = 50, col2X = 250, col3X = 350, col4X = 450;

        // Header row
        doc.fontSize(9).fillColor('#ffffff')
           .rect(col1X, tableTop, 500, 20).fill('#0066cc');
        doc.fillColor('#ffffff')
           .text('Learning Area',     col1X + 5, tableTop + 5, { width: 190 })
           .text('Marks',             col2X + 5, tableTop + 5, { width: 90 })
           .text('Total',             col3X + 5, tableTop + 5, { width: 90 })
           .text('Performance Level', col4X + 5, tableTop + 5, { width: 90 });

        // Data rows
        let currentY = tableTop + 25;
        reportData.results.forEach((r, i) => {
          doc.rect(col1X, currentY, 500, 20).fill(i % 2 === 0 ? '#f5f5f5' : '#ffffff');
          doc.fillColor('#000000').fontSize(9)
             .text(r.subject_name,      col1X + 5, currentY + 5, { width: 190 })
             .text(String(r.marks),     col2X + 5, currentY + 5, { width: 90 })
             .text(String(r.max_marks), col3X + 5, currentY + 5, { width: 90 })
             .text(r.grade,             col4X + 5, currentY + 5, { width: 90 });
          currentY += 20;
        });

        // Total row
        doc.rect(col1X, currentY, 500, 20).fill('#d9e2f3');
        doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold')
           .text('TOTAL',                                       col1X + 5, currentY + 5, { width: 190 })
           .text(String(reportData.summary.total_marks),        col2X + 5, currentY + 5, { width: 90 })
           .text(String(reportData.summary.total_max_marks),    col3X + 5, currentY + 5, { width: 90 })
           .text(reportData.summary.overall_grade,              col4X + 5, currentY + 5, { width: 90 });
        doc.font('Helvetica');

        // ── Termly comment ────────────────────────────────────────────────
        doc.moveDown(3).fontSize(12).fillColor('#000000')
           .text('TERMLY COMMENT', { underline: true });
        doc.moveDown(0.5).fontSize(9);
        doc.text('Closing Date: ____________________');
        doc.text('Opening Date: ____________________');
        doc.moveDown(0.3);
        doc.text('Class Teacher signature: ____________________');
        doc.text('Dean of studies signature: ____________________');
        doc.moveDown(1);
        doc.text('Head Teacher signature: ____________________', { align: 'left' });
        doc.text('School Stamp:', { align: 'right' });

        // ── Performance key ───────────────────────────────────────────────
        doc.moveDown(1.5).fontSize(10).fillColor('#000000')
           .text('Key for CBC Performance Levels', { underline: true });
        doc.moveDown(0.5).fontSize(8);
        [
          'EE1 (90-100): Exceeds Expectations - Outstanding',
          'EE2 (80-89): Exceeds Expectations - Excellent',
          'ME1 (70-79): Meets Expectations - Very Good',
          'ME2 (60-69): Meets Expectations - Good',
          'AE1 (50-59): Approaches Expectations - Satisfactory',
          'AE2 (40-49): Approaches Expectations - Fair',
          'BE1 (30-39): Below Expectations - Needs Improvement',
          'BE2 (< 30): Below Expectations - Significant Support Needed',
        ].forEach(l => doc.text(l));

        // ── Footer ────────────────────────────────────────────────────────
        doc.moveDown(1).fontSize(8).fillColor('#666666')
           .text(
             `Printed on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
             { align: 'center' }
           );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /* ========================================================================
     DELIVERY — SMS / EMAIL
     (No caching — these are side-effect operations, always fresh)
     ======================================================================== */

  async sendResultsViaSMS(examId, studentId, schoolId) {
    const reportData = await this.getStudentExamReport(examId, studentId, schoolId);

    const student = await studentsRepository.findById(schoolId, studentId);
    if (!student.parent_phone) throw new AppError('Parent phone number not found', 400);

    const message = [
      `EXAM RESULTS - ${reportData.exam.name}`,
      `Student: ${reportData.student.name}`,
      `Class: ${reportData.student.class}`,
      `Overall: ${reportData.summary.total_marks}/${reportData.summary.total_max_marks} (${reportData.summary.overall_percentage}%)`,
      `Grade: ${reportData.summary.overall_grade}`,
      'Check portal for detailed report.',
    ].join('\n');

    return { phone: student.parent_phone, message, status: 'prepared' };
  }

  async sendResultsViaEmail(examId, studentId, schoolId) {
    const reportData = await this.getStudentExamReport(examId, studentId, schoolId);
    const pdfBuffer  = await this.generatePDFReport(examId, studentId, schoolId);

    const student = await studentsRepository.findById(schoolId, studentId);
    if (!student.parent_email) throw new AppError('Parent email not found', 400);

    return {
      to:      student.parent_email,
      subject: `Exam Results - ${reportData.exam.name} - ${reportData.student.name}`,
      html: `
        <h2>Exam Results Report</h2>
        <p>Dear Parent/Guardian,</p>
        <p>Please find attached the exam results for <strong>${reportData.student.name}</strong>.</p>
        <h3>Summary:</h3>
        <ul>
          <li><strong>Exam:</strong> ${reportData.exam.name}</li>
          <li><strong>Term:</strong> ${reportData.exam.term}</li>
          <li><strong>Class:</strong> ${reportData.student.class}</li>
          <li><strong>Total Marks:</strong> ${reportData.summary.total_marks}/${reportData.summary.total_max_marks}</li>
          <li><strong>Overall Percentage:</strong> ${reportData.summary.overall_percentage}%</li>
          <li><strong>Overall Grade:</strong> ${reportData.summary.overall_grade}</li>
          <li><strong>Performance Level:</strong> ${reportData.summary.performance_level}</li>
        </ul>
        <h3>Subject Performance:</h3>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse">
          <thead>
            <tr style="background:#0066cc;color:#fff">
              <th>Subject</th><th>Marks</th><th>Total</th><th>Percentage</th><th>Grade</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.results.map(r => `
              <tr>
                <td>${r.subject_name}</td>
                <td>${r.marks}</td>
                <td>${r.max_marks}</td>
                <td>${r.percentage}%</td>
                <td>${r.grade}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p>Please refer to the attached PDF for the full report.</p>
        <p>Best regards,<br><strong>School Administration</strong></p>
      `,
      attachments: [{
        filename:    `${reportData.student.admission_number}_${reportData.exam.name.replace(/\s+/g, '_')}_Results.pdf`,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      }],
    };
  }

  /* ========================================================================
     BULK DELIVERY
     ======================================================================== */

  async bulkSendResults(examId, schoolId, deliveryMethod = 'email') {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status !== 'PUBLISHED')
      throw new AppError('Exam must be published before sending results', 400);

    const results        = await examsRepository.getResults(examId, schoolId);
    const uniqueStudents = [...new Set(results.map(r => r.student_id))];

    const successList = [];
    const failureList = [];

    for (const studentId of uniqueStudents) {
      try {
        if (deliveryMethod === 'email') {
          const emailData = await this.sendResultsViaEmail(examId, studentId, schoolId);
          successList.push({ student_id: studentId, delivery_method: 'email', recipient: emailData.to });
        } else if (deliveryMethod === 'sms') {
          const smsData = await this.sendResultsViaSMS(examId, studentId, schoolId);
          successList.push({ student_id: studentId, delivery_method: 'sms', recipient: smsData.phone });
        }
      } catch (err) {
        failureList.push({ student_id: studentId, error: err.message });
      }
    }

    return {
      total:        uniqueStudents.length,
      success:      successList.length,
      failed:       failureList.length,
      success_list: successList,
      failure_list: failureList,
    };
  }

  /* ========================================================================
     CACHE INVALIDATION
     Call this from exams.service after any result write operation
     ======================================================================== */

  async invalidateResultsCache(examId, schoolId, studentId = null) {
    if (studentId) {
      await cache.del(`results:${schoolId}:report:${examId}:${studentId}`);
    }
    await cache.delPattern(`results:${schoolId}:class-summary:${examId}:*`);
    await cache.delPattern(`results:${schoolId}:report:${examId}:*`);
  }
}

module.exports = new ResultsService();