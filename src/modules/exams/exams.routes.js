/**
 * Exams Routes
 * CRITICAL: Specific routes MUST come before dynamic /:id routes
 */

const express = require('express');
const router = express.Router();
const examsController = require('./exams.controllers');
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log('[ROUTES] Exams routes module loaded');

router.use(authenticate);

/* -------------------------------------------------------------------------- */
/*                         STATIC ROUTES                                      */
/* -------------------------------------------------------------------------- */

router.get('/search',   authorize('ADMIN', 'TEACHER'), examsController.searchExams);
router.get('/upcoming', authorize('ADMIN', 'TEACHER'), examsController.getUpcomingExams);
router.get('/',         authorize('ADMIN', 'TEACHER'), examsController.getAllExams);
router.post('/',        authorize('ADMIN'),             examsController.createExam);

/* -------------------------------------------------------------------------- */
/*                    SPECIFIC NESTED STATIC ROUTES                           */
/* -------------------------------------------------------------------------- */

router.get('/statistics/class/:classId',     authorize('ADMIN', 'TEACHER'), examsController.getClassPerformanceComparison);
router.get('/statistics/subject/:subjectId', authorize('ADMIN', 'TEACHER'), examsController.getSubjectPerformanceAnalysis);
router.delete('/subjects/:subjectId',        authorize('ADMIN'),             examsController.deleteSubject);
router.put('/subjects/:subjectId',           authorize('ADMIN'),             examsController.updateSubject);
router.delete('/results/:resultId',          authorize('ADMIN'),             examsController.deleteResult);

/* -------------------------------------------------------------------------- */
/*           SPECIFIC /:id NESTED ROUTES — MUST come before /:id             */
/* -------------------------------------------------------------------------- */

router.post('/:id/unpublish',          authorize('ADMIN'),             examsController.unpublishResults);
router.post('/:id/publish',            authorize('ADMIN'),             examsController.publishExam);
router.post('/:id/archive',            authorize('ADMIN'),             examsController.archiveExam);
router.post('/:id/clone',              authorize('ADMIN'),             examsController.cloneExam);

router.post('/:id/results/validate',   authorize('ADMIN', 'TEACHER'), examsController.validateResults);
router.post('/:id/results/import',     authorize('ADMIN', 'TEACHER'), examsController.importResults);

// ✅ ADMIN ONLY — test expects 403 for TEACHER attempting bulk upload
router.post('/:id/results/bulk',       authorize('ADMIN'),             examsController.bulkUploadResults);
router.put('/:id/results/bulk',        authorize('ADMIN'),             examsController.bulkUpdateResults);
router.delete('/:id/results/bulk',     authorize('ADMIN'),             examsController.bulkDeleteResults);

router.post('/:id/results/publish',    authorize('ADMIN'),             examsController.publishResults);

router.get('/:id/missing-results',     authorize('ADMIN', 'TEACHER'), examsController.getMissingResults);
router.get('/:id/outliers',            authorize('ADMIN', 'TEACHER'), examsController.getOutlierScores);
router.get('/:id/grade-distribution',  authorize('ADMIN', 'TEACHER'), examsController.getGradeDistribution);
router.get('/:id/report/class-summary',authorize('ADMIN', 'TEACHER'), examsController.generateClassSummary);
router.get('/:id/export/pdf',          authorize('ADMIN', 'TEACHER'), examsController.exportToPdf);
router.get('/:id/export/csv',          authorize('ADMIN', 'TEACHER'), examsController.exportToCsv);
router.get('/:id/export/excel',        authorize('ADMIN', 'TEACHER'), examsController.exportToExcel);
router.post('/:id/results/send-sms', authorize('ADMIN'), examsController.sendResultsSms);

router.post('/:id/enrollments/class',          authorize('ADMIN'),             examsController.enrollClass);
router.get('/:id/students/:studentId/results', authorize('ADMIN', 'TEACHER'), examsController.getStudentExamResults);
router.get('/:id/report/:studentId',           authorize('ADMIN', 'TEACHER'), examsController.generateReportCard);
router.delete('/:id/enrollments/:studentId',   authorize('ADMIN'),             examsController.unenrollStudent);

/* -------------------------------------------------------------------------- */
/*                    GENERAL /:id ROUTES — LAST                             */
/* -------------------------------------------------------------------------- */

router.get('/:id',                     authorize('ADMIN', 'TEACHER'), examsController.getExamById);
router.put('/:id',                     authorize('ADMIN'),             examsController.updateExam);
router.delete('/:id',                  authorize('ADMIN'),             examsController.deleteExam);
router.patch('/:id/status',            authorize('ADMIN'),             examsController.updateExamStatus);

router.get('/:id/subjects',            authorize('ADMIN', 'TEACHER'), examsController.getExamSubjects);
router.post('/:id/subjects',           authorize('ADMIN'),             examsController.addSubject);

router.get('/:id/results',             authorize('ADMIN', 'TEACHER'), examsController.getExamResults);
router.post('/:id/results',            authorize('ADMIN', 'TEACHER'), examsController.upsertResult);
router.get('/:id/results/:studentId',  authorize('ADMIN', 'TEACHER'), examsController.getStudentExamResult);
router.put('/:id/results/:studentId',  authorize('ADMIN', 'TEACHER'), examsController.updateResult);
router.delete('/:id/results/:studentId', authorize('ADMIN'),          examsController.deleteStudentResult);

router.get('/:id/statistics',          authorize('ADMIN', 'TEACHER'), examsController.getExamStatistics);

router.get('/:id/enrollments',         authorize('ADMIN', 'TEACHER'), examsController.getEnrolledStudents);
router.post('/:id/enrollments',        authorize('ADMIN'),             examsController.enrollStudents);

console.log('[ROUTES] Total exams routes registered:', router.stack.length);

module.exports = router;