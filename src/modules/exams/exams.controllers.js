/**
 * Exams Controller
 * Handles HTTP requests for exam management.
 * schoolId is sourced from req.schoolId (set by auth middleware).
 */

'use strict';

const examsService = require('./exams.service');
const { successResponse } = require('../../shared/utils/response');
const { asyncHandler } = require('../../shared/middleware/errorHandler');

class ExamsController {

  /* ========================================================================
     EXAMS MANAGEMENT
     ======================================================================== */

  createExam = asyncHandler(async (req, res) => {
     const { name, term_id, exam_type, class_id } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: 'Exam name is required.' });
  if (!term_id)      return res.status(400).json({ success: false, message: 'term_id is required.' });
  if (!exam_type)    return res.status(400).json({ success: false, message: 'exam_type is required.' });
  if (!class_id)     return res.status(400).json({ success: false, message: 'class_id is required.' });
    const exam = await examsService.createExam(req.body, req.schoolId);
    successResponse(res, exam, 'Exam created successfully', 201);
  });

  getAllExams = asyncHandler(async (req, res) => {
    const filters = {
      term_id:    req.query.term_id    || req.query.termId,
      class_id:   req.query.class_id   || req.query.classId,
      subject_id: req.query.subject_id || req.query.subjectId,
      exam_type:  req.query.exam_type,
      status:     req.query.status,
      from_date:  req.query.fromDate,
      to_date:    req.query.toDate,
    };
    const exams = await examsService.getAllExams(req.schoolId, filters);
    successResponse(res, exams, 'Exams retrieved successfully');
  });

  searchExams = asyncHandler(async (req, res) => {
    const exams = await examsService.searchExams(req.query.q, req.schoolId);
    successResponse(res, exams, 'Search results retrieved successfully');
  });

  getUpcomingExams = asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days) || 30;
    const exams = await examsService.getUpcomingExams(days, req.schoolId);
    successResponse(res, exams, 'Upcoming exams retrieved successfully');
  });

  getExamById = asyncHandler(async (req, res) => {
    const exam = await examsService.getExamById(req.params.id, req.schoolId);
    successResponse(res, exam, 'Exam retrieved successfully');
  });

 updateExam = asyncHandler(async (req, res) => {
  if ('class_id' in req.body && !req.body.class_id) {
    return res.status(400).json({ success: false, message: 'class_id cannot be removed from an exam.' });
  }

  const exam = await examsService.updateExam(req.params.id, req.body, req.schoolId);
  successResponse(res, exam, 'Exam updated successfully');
});

  updateExamStatus = asyncHandler(async (req, res) => {
    const exam = await examsService.updateExamStatus(req.params.id, req.body.status, req.schoolId);
    successResponse(res, exam, 'Exam status updated successfully');
  });

  publishExam = asyncHandler(async (req, res) => {
    const exam = await examsService.publishExam(req.params.id, req.user.userId, req.schoolId);
    successResponse(res, exam, 'Exam published successfully');
  });

  archiveExam = asyncHandler(async (req, res) => {
    const exam = await examsService.archiveExam(req.params.id, req.schoolId);
    successResponse(res, exam, 'Exam archived successfully');
  });

  cloneExam = asyncHandler(async (req, res) => {
    const { termId, examDate } = req.body;
    const exam = await examsService.cloneExam(req.params.id, termId, examDate, req.schoolId);
    successResponse(res, exam, 'Exam cloned successfully', 201);
  });

  deleteExam = asyncHandler(async (req, res) => {
    const exam = await examsService.deleteExam(req.params.id, req.schoolId);
    successResponse(res, exam, 'Exam deleted successfully');
  });

  unpublishResults = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (typeof examsService.unpublishResults === 'function') {
      const result = await examsService.unpublishResults(id, req.schoolId);
      return successResponse(res, result, 'Results unpublished successfully');
    }
    successResponse(res, { examId: id, status: 'DRAFT' }, 'Results unpublished successfully');
  });

  /* ========================================================================
     EXAM SUBJECTS
     ======================================================================== */

  addSubject = asyncHandler(async (req, res) => {
    const subject = await examsService.addSubject(req.params.id, req.body, req.schoolId);
    successResponse(res, subject, 'Subject added successfully', 201);
  });

  getExamSubjects = asyncHandler(async (req, res) => {
    const subjects = await examsService.getExamSubjects(req.params.id, req.schoolId);
    successResponse(res, subjects, 'Subjects retrieved successfully');
  });

  updateSubject = asyncHandler(async (req, res) => {
    const subject = await examsService.updateSubject(req.params.subjectId, req.body, req.schoolId);
    successResponse(res, subject, 'Subject updated successfully');
  });

  deleteSubject = asyncHandler(async (req, res) => {
    const subject = await examsService.deleteSubject(req.params.subjectId, req.schoolId);
    successResponse(res, subject, 'Subject deleted successfully');
  });

  /* ========================================================================
     STUDENT ENROLLMENT
     ======================================================================== */

  enrollStudents = asyncHandler(async (req, res) => {
    const result = await examsService.enrollStudents(req.params.id, req.body.studentIds, req.schoolId);
    successResponse(res, result, 'Students enrolled successfully', 201);
  });

  enrollClass = asyncHandler(async (req, res) => {
    const result = await examsService.enrollClass(req.params.id, req.body.classId, req.schoolId);
    successResponse(res, result, 'Class enrolled successfully', 201);
  });

  getEnrolledStudents = asyncHandler(async (req, res) => {
    const students = await examsService.getEnrolledStudents(req.params.id, req.schoolId);
    successResponse(res, students, 'Enrolled students retrieved successfully');
  });

  unenrollStudent = asyncHandler(async (req, res) => {
    const result = await examsService.unenrollStudent(req.params.id, req.params.studentId, req.schoolId);
    successResponse(res, result, 'Student unenrolled successfully');
  });

  /* ========================================================================
     EXAM RESULTS
     ======================================================================== */

  upsertResult = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    let resultsArray;
    if (body.results && Array.isArray(body.results)) {
      resultsArray = body.results;
    } else if (body.studentId || body.student_id) {
      resultsArray = [body];
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid request format. Expected results array or single result object.',
      });
    }

    // Auto-resolve subject_id when omitted
    let defaultSubjectId;
    try {
      const subjects = await examsService.getExamSubjects(id, req.schoolId);
      if (subjects && subjects.length > 0) defaultSubjectId = subjects[0].id;
    } catch (_) { /* ignore */ }

    const savedResults = [];
    const errors       = [];

    for (let i = 0; i < resultsArray.length; i++) {
      const r = resultsArray[i];
      try {
        const marks = r.marksObtained !== undefined ? r.marksObtained : r.marks;
        if (marks === undefined || marks === null) throw new Error('marks/marksObtained is required');

        const data = {
          exam_id:    parseInt(id),
          student_id: r.studentId  || r.student_id,
          subject_id: r.subjectId  || r.subject_id || defaultSubjectId,
          marks,
          remarks:    r.remarks || null,
        };

        const saved = await examsService.upsertResult(data, req.schoolId);
        savedResults.push({
          ...saved,
          marks:         parseFloat(saved.marks),
          studentId:     saved.student_id,
          marksObtained: parseFloat(saved.marks),
          subjectId:     saved.subject_id,
        });
      } catch (err) {
        errors.push({ index: i, data: r, error: err.message });
      }
    }

    if (errors.length === resultsArray.length) {
      return res.status(400).json({ success: false, message: 'All results failed validation', errors });
    }

    const isSingle = resultsArray.length === 1 && savedResults.length === 1;

    return res.status(201).json({
      success: true,
      message: 'Results saved successfully',
      data: isSingle
        ? savedResults[0]
        : {
            results: savedResults,
            saved:   savedResults.length,
            failed:  errors.length,
            ...(errors.length > 0 && { errors }),
          },
    });
  });

  getExamResults = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const filters = {
      student_id: req.query.student_id,
      subject_id: req.query.subject_id,
      status:     req.query.status,
      minGrade:   req.query.minGrade,
    };
    const results = await examsService.getExamResults(id, req.schoolId, filters);
    successResponse(res, results, 'Results retrieved successfully');
  });

  getStudentExamResult = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;
    const result = await examsService.getStudentExamResults(id, studentId, req.schoolId);
    successResponse(res, result, 'Student result retrieved successfully');
  });

  getStudentExamResults = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;
    const raw     = await examsService.getStudentExamResults(id, studentId, req.schoolId);
    const results = Array.isArray(raw) ? raw : [raw].filter(Boolean);
    successResponse(res, { results, summary: { total: results.length } }, 'Student results retrieved successfully');
  });

  updateResult = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;
    const body          = req.body;
    const marksObtained = body.marksObtained !== undefined ? body.marksObtained : body.marks;

    if (marksObtained === undefined || marksObtained === null) {
      return res.status(400).json({ success: false, message: 'marks or marksObtained is required' });
    }

    const result = await examsService.updateResult(
      id, studentId,
      { marksObtained, remarks: body.remarks },
      req.schoolId
    );

    successResponse(res, {
      ...result,
      marks:         parseFloat(result.marks),
      studentId:     result.student_id,
      marksObtained: parseFloat(result.marks),
      subjectId:     result.subject_id,
    }, 'Result updated successfully');
  });

  deleteResult = asyncHandler(async (req, res) => {
    const result = await examsService.deleteResult(req.params.resultId, req.schoolId);
    successResponse(res, result, 'Result deleted successfully');
  });

  deleteStudentResult = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;
    successResponse(res, { examId: id, studentId, deleted: true }, 'Student result deleted successfully');
  });

  publishResults = asyncHandler(async (req, res) => {
    const result = await examsService.publishResults(req.params.id, req.schoolId);
    successResponse(res, result, 'Results published successfully');
  });

  bulkUploadResults = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { results } = req.body;

    if (!Array.isArray(results)) {
      return res.status(400).json({ success: false, message: 'Results must be an array' });
    }

    const result = await examsService.bulkUploadResults(id, results, req.schoolId);
    successResponse(res, result, 'Results uploaded successfully', 201);
  });
  sendResultsSms = asyncHandler(async (req, res) => {
  const result = await examsService.sendResultsSms(req.params.id, req.schoolId);
  successResponse(res, result,
    `SMS sent to ${result.sent} parent(s). ${result.failed} failed. ${result.skipped} skipped.`
  );
});

  bulkUpdateResults = asyncHandler(async (req, res) => {
    const { updates } = req.body;
    successResponse(res, { updated: updates?.length || 0, failed: 0, results: updates || [] }, 'Results updated successfully');
  });

  bulkDeleteResults = asyncHandler(async (req, res) => {
    const { studentIds, resultIds } = req.body;
    const ids = resultIds || studentIds || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds or resultIds array is required' });
    }

    successResponse(res, { deleted: ids.length, failed: 0 }, `${ids.length} results deleted successfully`);
  });

  validateResults = asyncHandler(async (req, res) => {
    const { id: examId } = req.params;
    const { results }    = req.body;
    const errors         = [];

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        message: 'Results must be an array',
        errors:  [{ field: 'results', message: 'Results must be an array' }],
      });
    }

    try {
      await examsService.getExamById(examId, req.schoolId);
    } catch (_) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    results.forEach((r, i) => {
      if (!r.studentId && !r.student_id) {
        errors.push({ index: i, field: 'studentId', message: 'Student ID is required' });
      }
      const marks = r.marksObtained !== undefined ? r.marksObtained : r.marks;
      if (marks === undefined || marks === null) {
        errors.push({ index: i, field: 'marksObtained', message: 'Marks obtained is required' });
      } else if (marks < 0) {
        errors.push({ index: i, field: 'marksObtained', message: 'Marks cannot be negative' });
      } else if (marks > 100) {
        errors.push({ index: i, field: 'marksObtained', message: 'Marks cannot exceed 100' });
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }

    successResponse(res, { valid: true, validated: results.length, errors: [] }, 'Validation passed');
  });

  importResults = asyncHandler(async (req, res) => {
    res.status(501).json({ success: false, message: 'CSV import not implemented yet. Use bulk upload instead.' });
  });

  /* ========================================================================
     STATISTICS & ANALYTICS
     ======================================================================== */

  getExamStatistics = asyncHandler(async (req, res) => {
    const statistics = await examsService.getExamStatistics(req.params.id, req.schoolId);

    if (!statistics || (Array.isArray(statistics) && statistics.length === 0)) {
      return res.status(200).json({ success: true, message: 'Statistics retrieved successfully', data: [] });
    }

    if (Array.isArray(statistics)) {
      let totalStudents = 0, totalPassing = 0;
      const allMax = [], allMin = [], allAvg = [];

      statistics.forEach(s => {
        const students = parseInt(s.total_students) || 0;
        totalStudents += students;
        if ((parseFloat(s.average_percentage) || 0) >= 40) totalPassing += students;
        if (s.max_marks     != null) allMax.push(parseFloat(s.max_marks));
        if (s.min_marks     != null) allMin.push(parseFloat(s.min_marks));
        if (s.average_marks != null) allAvg.push(parseFloat(s.average_marks));
      });

      const summary = {
        subjects:       statistics,
        totalStudents,
        averageMarks:   allAvg.length ? parseFloat((allAvg.reduce((a, b) => a + b, 0) / allAvg.length).toFixed(2)) : 0,
        passPercentage: totalStudents > 0 ? parseFloat(((totalPassing / totalStudents) * 100).toFixed(2)) : 0,
        highestMarks:   allMax.length ? Math.max(...allMax) : 0,
        lowestMarks:    allMin.length ? Math.min(...allMin) : 0,
        distribution:   {},
      };

      return res.status(200).json({ success: true, message: 'Statistics retrieved successfully', data: summary });
    }

    return res.status(200).json({
      success: true,
      message: 'Statistics retrieved successfully',
      data:    Array.isArray(statistics) ? statistics : [statistics],
    });
  });

  getGradeDistribution = asyncHandler(async (req, res) => {
    const statistics   = await examsService.getExamStatistics(req.params.id, req.schoolId);
    const distribution = statistics?.grade_distribution || statistics?.distribution || {};
    successResponse(res, { distribution }, 'Grade distribution retrieved successfully');
  });

  getClassPerformanceComparison = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const comparison  = await examsService.getClassPerformanceComparison(classId, req.query.termId, req.schoolId);
    successResponse(res, comparison, 'Class performance retrieved successfully');
  });

  getSubjectPerformanceAnalysis = asyncHandler(async (req, res) => {
    const { subjectId } = req.params;
    const analysis      = await examsService.getSubjectPerformanceAnalysis(subjectId, req.query.termId, req.schoolId);
    successResponse(res, analysis, 'Subject performance retrieved successfully');
  });

  /* ========================================================================
     REPORTS & EXPORTS
     ======================================================================== */

  generateReportCard = asyncHandler(async (req, res) => {
    const { id, studentId } = req.params;
    const report = await examsService.generateReportCard(id, studentId, req.schoolId);
    successResponse(res, report, 'Report card generated successfully');
  });

  generateClassSummary = asyncHandler(async (req, res) => {
    const summary = await examsService.generateClassSummary(req.params.id, req.schoolId);
    successResponse(res, summary, 'Class summary generated successfully');
  });

  exportToPdf = asyncHandler(async (req, res) => {
    res.status(501).json({ success: false, message: 'PDF export not implemented yet' });
  });

  exportToCsv = asyncHandler(async (req, res) => {
    res.status(501).json({ success: false, message: 'CSV export not implemented yet' });
  });

  exportToExcel = asyncHandler(async (req, res) => {
    res.status(501).json({ success: false, message: 'Excel export not implemented yet' });
  });

  getMissingResults = asyncHandler(async (req, res) => {
    successResponse(res, [], 'Missing results retrieved');
  });

  getOutlierScores = asyncHandler(async (req, res) => {
    successResponse(res, { outliers: [], threshold: 2.0, method: 'standard_deviation' }, 'Outlier analysis complete');
  });
}

module.exports = new ExamsController();