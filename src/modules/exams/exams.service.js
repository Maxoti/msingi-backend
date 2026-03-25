const examsRepository = require('./exams.repository');
const { AppError }    = require('../../shared/middleware/errorHandler');
const cache           = require('../../shared/cache/cache.service');

class ExamsService {

  /* ========================================================================
     EXAMS MANAGEMENT
     ======================================================================== */

  async createExam(examData, schoolId) {
    if (!examData.name)      throw new AppError('Exam name is required', 400);
    if (!examData.term_id)   throw new AppError('Term ID is required', 400);
    if (!examData.exam_type) throw new AppError('Exam type is required', 400);
    if (!examData.class_id)  throw new AppError('Class ID is required', 400);

    const validTypes = ['CAT', 'MIDTERM', 'ENDTERM'];
    if (!validTypes.includes(examData.exam_type))
      throw new AppError('Invalid exam type. Must be CAT, MIDTERM, or ENDTERM', 400);

    const result = await examsRepository.create(examData, schoolId);

    // ✅ Invalidate exam list cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async getAllExams(schoolId, filters = {}) {
    const cacheKey = `exams:${schoolId}:${JSON.stringify(filters)}`;

    // ✅ Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const data = await examsRepository.findAll(schoolId, filters);

    // ✅ Store in cache
    await cache.set(cacheKey, data, cache.TTL.exams);

    return data;
  }

  async getExamById(id, schoolId) {
    const cacheKey = `exams:${schoolId}:id:${id}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(id, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    await cache.set(cacheKey, exam, cache.TTL.exams);
    return exam;
  }

  async updateExam(id, updateData, schoolId) {
    const exam = await examsRepository.findById(id, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status === 'ARCHIVED') throw new AppError('Cannot update an archived exam', 400);

    if (exam.status === 'PUBLISHED') {
      const blocked = ['term_id', 'exam_type', 'status'];
      if (blocked.some(f => updateData[f] !== undefined))
        throw new AppError('Cannot change term, type, or status of a published exam', 400);
    }

    if (updateData.exam_type) {
      const validTypes = ['CAT', 'MIDTERM', 'ENDTERM'];
      if (!validTypes.includes(updateData.exam_type))
        throw new AppError('Invalid exam type. Must be CAT, MIDTERM, or ENDTERM', 400);
    }

    const result = await examsRepository.update(id, updateData, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async publishExam(examId, userId, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status === 'PUBLISHED') throw new AppError('Exam is already published', 400);
    if (exam.status === 'ARCHIVED')  throw new AppError('Cannot publish an archived exam', 400);

    const subjects = await examsRepository.getSubjects(examId, schoolId);
    if (!subjects.length) throw new AppError('Cannot publish exam without subjects', 400);

    const result = await examsRepository.publish(examId, userId, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async archiveExam(examId, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status === 'ARCHIVED') throw new AppError('Exam is already archived', 400);

    const result = await examsRepository.archive(examId, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async deleteExam(id, schoolId) {
    const exam = await examsRepository.findById(id, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const hasResults = await examsRepository.hasResults(id, schoolId);
    if (hasResults) throw new AppError('Cannot delete exam with results. Archive it instead.', 400);

    const result = await examsRepository.delete(id, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  /* ========================================================================
     EXAM SUBJECTS
     ======================================================================== */

  async addSubject(examId, subjectData, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    if (exam.status === 'ARCHIVED')  throw new AppError('Cannot add subjects to an archived exam', 400);
    if (!subjectData.subject_name)   throw new AppError('Subject name is required', 400);
    if (!subjectData.max_marks || subjectData.max_marks < 1)
      throw new AppError('Valid max marks is required', 400);

    const result = await examsRepository.addSubject(examId, subjectData, schoolId);

    // ✅ Invalidate exam and subjects cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async getExamSubjects(examId, schoolId) {
    const cacheKey = `exams:${schoolId}:subjects:${examId}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const data = await examsRepository.getSubjects(examId, schoolId);

    await cache.set(cacheKey, data, cache.TTL.exams);
    return data;
  }

  async updateSubject(subjectId, subjectData, schoolId) {
    const subject = await examsRepository.findSubjectById(subjectId, schoolId);
    if (!subject) throw new AppError('Subject not found', 404);

    const exam = await examsRepository.findById(subject.exam_id, schoolId);
    if (exam.status === 'PUBLISHED') throw new AppError('Cannot update subjects of a published exam', 400);
    if (exam.status === 'ARCHIVED')  throw new AppError('Cannot update subjects of an archived exam', 400);

    const result = await examsRepository.updateSubject(subjectId, subjectData, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  async deleteSubject(subjectId, schoolId) {
    const subject = await examsRepository.findSubjectById(subjectId, schoolId);
    if (!subject) throw new AppError('Subject not found', 404);

    const exam = await examsRepository.findById(subject.exam_id, schoolId);
    if (exam.status === 'PUBLISHED') throw new AppError('Cannot delete subjects from a published exam', 400);
    if (exam.status === 'ARCHIVED')  throw new AppError('Cannot delete subjects from an archived exam', 400);

    const result = await examsRepository.deleteSubject(subjectId, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`exams:${schoolId}:*`);

    return result;
  }

  /* ========================================================================
     EXAM RESULTS
     ======================================================================== */

  calculateGrade(marks, maxMarks) {
    const pct = (marks / maxMarks) * 100;
    if (pct >= 90) return 'EE1';
    if (pct >= 80) return 'EE2';
    if (pct >= 70) return 'ME1';
    if (pct >= 60) return 'ME2';
    if (pct >= 50) return 'AE1';
    if (pct >= 40) return 'AE2';
    if (pct >= 30) return 'BE1';
    return 'BE2';
  }

  async upsertResult(resultData, schoolId) {
    if (!resultData.exam_id)    throw new AppError('Exam ID is required', 400);
    if (!resultData.student_id) throw new AppError('Student ID is required', 400);
    if (resultData.marks === undefined || resultData.marks === null)
      throw new AppError('Marks is required', 400);

    if (!resultData.subject_id) {
      let subjects = await examsRepository.getSubjects(resultData.exam_id, schoolId);
      if (!subjects.length) {
        const defaultSubject = await examsRepository.addSubject(
          resultData.exam_id,
          { subject_name: 'General', max_marks: 100 },
          schoolId
        );
        subjects = [defaultSubject];
      }
      resultData.subject_id = subjects[0].id;
    }

    const subject = await examsRepository.findSubjectById(resultData.subject_id, schoolId);
    if (!subject) throw new AppError('Subject not found', 404);

    if (resultData.marks < 0 || resultData.marks > subject.max_marks)
      throw new AppError(`Marks must be between 0 and ${subject.max_marks}`, 400);

    if (!resultData.grade)
      resultData.grade = this.calculateGrade(resultData.marks, subject.max_marks);

    const result = await examsRepository.upsertResult(resultData, schoolId);

    // ✅ Invalidate results and statistics cache
    await cache.delPattern(`exams:${schoolId}:results:${resultData.exam_id}*`);
    await cache.delPattern(`exams:${schoolId}:stats:${resultData.exam_id}*`);

    return result;
  }

  async getExamResults(examId, schoolId, filters = {}) {
    const cacheKey = `exams:${schoolId}:results:${examId}:${JSON.stringify(filters)}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const data = await examsRepository.getResults(examId, schoolId, filters);

    await cache.set(cacheKey, data, cache.TTL.exams);
    return data;
  }

  async getStudentExamResults(examId, studentId, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    return examsRepository.getStudentResults(examId, studentId, schoolId);
  }

  async updateResult(examId, studentId, updateData, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const marks = updateData.marksObtained !== undefined ? updateData.marksObtained : updateData.marks;
    if (marks === undefined || marks === null) throw new AppError('Marks is required', 400);
    if (typeof marks !== 'number' || isNaN(marks)) throw new AppError('Marks must be a valid number', 400);
    if (marks < 0) throw new AppError('Marks cannot be negative', 400);

    let subjectId = updateData.subjectId || updateData.subject_id;
    if (!subjectId) {
      const existing = await examsRepository.getStudentResults(examId, studentId, schoolId);
      if (existing.length) {
        subjectId = existing[0].subject_id;
      } else {
        let subjects = await examsRepository.getSubjects(examId, schoolId);
        if (!subjects.length) {
          const defaultSubject = await examsRepository.addSubject(
            parseInt(examId),
            { subject_name: 'General', max_marks: 100 },
            schoolId
          );
          subjects = [defaultSubject];
        }
        subjectId = subjects[0].id;
      }
    }

    const subject = await examsRepository.findSubjectById(subjectId, schoolId);
    if (!subject) throw new AppError('Subject not found', 404);
    if (marks > subject.max_marks) throw new AppError(`Marks cannot exceed ${subject.max_marks}`, 400);

    const result = await examsRepository.upsertResult({
      exam_id:    parseInt(examId),
      student_id: parseInt(studentId),
      subject_id: subjectId,
      marks,
      grade:   this.calculateGrade(marks, subject.max_marks),
      remarks: updateData.remarks || null,
    }, schoolId);

    // ✅ Invalidate results and statistics cache
    await cache.delPattern(`exams:${schoolId}:results:${examId}*`);
    await cache.delPattern(`exams:${schoolId}:stats:${examId}*`);

    return result;
  }

  async deleteResult(resultId, schoolId) {
    const result = await examsRepository.deleteResult(resultId, schoolId);
    if (!result) throw new AppError('Result not found', 404);

    // ✅ Invalidate results cache broadly
    await cache.delPattern(`exams:${schoolId}:results:*`);
    await cache.delPattern(`exams:${schoolId}:stats:*`);

    return result;
  }

  async bulkUploadResults(examId, resultsData, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const processed = [];
    const errors    = [];

    for (let i = 0; i < resultsData.length; i++) {
      const r = resultsData[i];
      try {
        if (!r.student_id || r.marks === undefined)
          throw new Error('Missing required fields: student_id or marks');

        let subjectId = r.subject_id;
        if (!subjectId) {
          const subjects = await examsRepository.getSubjects(examId, schoolId);
          if (!subjects.length) throw new Error('No subjects configured for this exam');
          subjectId = subjects[0].id;
        }

        const subject = await examsRepository.findSubjectById(subjectId, schoolId);
        if (!subject) throw new Error(`Subject not found: ${subjectId}`);

        if (r.marks < 0 || r.marks > subject.max_marks)
          throw new Error(`Marks must be between 0 and ${subject.max_marks}`);

        processed.push({
          exam_id:    parseInt(examId),
          student_id: r.student_id,
          subject_id: subjectId,
          marks:      r.marks,
          grade:      r.grade || this.calculateGrade(r.marks, subject.max_marks),
          remarks:    r.remarks || null,
        });
      } catch (err) {
        errors.push({ row: i + 1, data: r, error: err.message });
      }
    }

    if (errors.length) throw new AppError('Validation errors in bulk upload', 400, { errors });

    const inserted = await examsRepository.bulkInsertResults(processed, schoolId);

    // ✅ Invalidate results and statistics cache
    await cache.delPattern(`exams:${schoolId}:results:${examId}*`);
    await cache.delPattern(`exams:${schoolId}:stats:${examId}*`);

    return { success: true, inserted: inserted.length, results: inserted };
  }

  /* ========================================================================
     STATISTICS
     ======================================================================== */

  async getExamStatistics(examId, schoolId) {
    const cacheKey = `exams:${schoolId}:stats:${examId}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const data = await examsRepository.getExamStatistics(examId, schoolId);

    await cache.set(cacheKey, data, cache.TTL.exams);
    return data;
  }

  async getGradeDistribution(examId, schoolId) {
    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);
    const stats        = await examsRepository.getExamStatistics(examId, schoolId);
    const distribution = stats?.grade_distribution || stats?.distribution || {};
    return { distribution };
  }

  /* ========================================================================
     SMS RESULTS
     ======================================================================== */

  async sendResultsSms(examId, schoolId) {
    const db               = require('../../shared/database/client');
    const MobiwaveProvider = require('../notifications/sms/mobiwave.provider');
    const sms              = new MobiwaveProvider();

    const exam = await examsRepository.findById(examId, schoolId);
    if (!exam) throw new AppError('Exam not found', 404);

    const subjects = await examsRepository.getSubjects(examId, schoolId);
    if (!subjects.length) throw new AppError('No subjects found for this exam', 400);

    const maxTotal = subjects.reduce((a, s) => a + parseInt(s.max_marks), 0);

    const results = await examsRepository.getResults(examId, schoolId);
    if (!results.length) throw new AppError('No results found for this exam', 400);

    const byStudent = {};
    results.forEach(r => {
      if (!byStudent[r.student_id]) {
        byStudent[r.student_id] = {
          student_id: r.student_id,
          first_name: r.first_name,
          last_name:  r.last_name,
          subjects:   [],
        };
      }
      byStudent[r.student_id].subjects.push({
        marks:     parseFloat(r.marks),
        max_marks: parseInt(r.max_marks),
      });
    });

    const studentList = Object.values(byStudent).map(st => {
      const filled = st.subjects.length === subjects.length;
      const total  = st.subjects.reduce((a, s) => a + s.marks, 0);
      const avg    = filled ? Math.round((total / maxTotal) * 100) : null;
      const grade  = avg !== null
        ? (avg >= 80 ? 'EE' : avg >= 60 ? 'ME' : avg >= 40 ? 'AE' : 'BE')
        : null;
      return { ...st, total: filled ? total : null, avg, grade };
    });

    const sorted = [...studentList].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    sorted.forEach((st, i) => { st.position = st.total !== null ? i + 1 : null; });
    const classSize = sorted.filter(s => s.total !== null).length;

    const studentIds = studentList.map(s => s.student_id);
    const parents    = await db.schoolQuery(schoolId,
      `SELECT pc.student_id, pc.phone, pc.name
       FROM parent_contacts pc
       WHERE pc.student_id = ANY($1)
         AND pc.phone IS NOT NULL
         AND pc.is_primary = true
       ORDER BY pc.student_id`,
      [studentIds]
    );

    const parentMap = {};
    parents.forEach(p => { parentMap[p.student_id] = p; });

    const schoolRow   = await db.queryOne(`SELECT short_name, name FROM schools WHERE id = $1`, [schoolId]);
    const schoolShort = schoolRow?.short_name || schoolRow?.name || 'School';

    const recipients = [];
    const skipped    = [];

    sorted.forEach(st => {
      const parent = parentMap[st.student_id];
      if (!parent?.phone) {
        skipped.push({ student: `${st.first_name} ${st.last_name}`, reason: 'No parent phone' });
        return;
      }
      if (st.total === null) {
        skipped.push({ student: `${st.first_name} ${st.last_name}`, reason: 'Incomplete results' });
        return;
      }

      const msg = `${schoolShort}: ${st.first_name} ${st.last_name}, ${exam.name}. Total:${st.total}/${maxTotal}, Avg:${st.avg}%, Grade:${st.grade}, Pos:${st.position}/${classSize}`;

      recipients.push({
        phoneNumber: parent.phone,
        message:     msg,
        reference:   `exam_${examId}_student_${st.student_id}`,
        student_id:  st.student_id,
        studentName: `${st.first_name} ${st.last_name}`,
      });
    });

    if (!recipients.length)
      throw new AppError('No students with parent phones and complete results found', 400);

    const bulkResult = await sms.sendBulkSMS(recipients);

    for (const r of bulkResult.results) {
      try {
        await db.schoolQueryOne(schoolId,
          `INSERT INTO sms_logs
             (student_id, phone, message, status, message_id, school_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [
            r.reference?.split('_student_')[1] || null,
            r.phoneNumber,
            recipients.find(rec => rec.phoneNumber === r.phoneNumber)?.message || '',
            r.success ? 'SENT' : 'FAILED',
            r.messageId || null,
            schoolId,
          ]
        );
      } catch { /* log failure is non-critical */ }
    }

    return {
      sent:           bulkResult.successful,
      failed:         bulkResult.failed,
      skipped:        skipped.length,
      skippedDetails: skipped,
      results:        bulkResult.results,
    };
  }
}

module.exports = new ExamsService();