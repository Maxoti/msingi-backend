/**
 * Students Routes - Complete Implementation
 */

const express = require('express');
const router = express.Router();
const studentsController = require('./students.controller');
const { authenticate, authorize } = require('../../shared/middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

console.log('[ROUTES] Students routes module loaded');

// ============================================================================
// BULK & IMPORT/EXPORT OPERATIONS (Must come first - no parameters)
// ============================================================================



router.post('/bulk-import', authenticate, upload.single('file'), studentsController.bulkImportStudents);
router.post('/import',      authenticate, upload.single('file'), studentsController.bulkImportStudents);
router.get('/export', authenticate, studentsController.exportStudents);
router.post('/bulk-promote', authenticate, studentsController.bulkPromoteStudents);
router.post('/promote', authenticate, studentsController.promoteStudents); // Alias
router.post('/bulk-update-status', authenticate, studentsController.bulkUpdateStatus);

// ============================================================================
// SEARCH & STATISTICS (before dynamic routes)
// ============================================================================

router.get('/search', authenticate, studentsController.searchStudents);
router.get('/advanced-search', authenticate, studentsController.advancedSearch);
router.get('/my-children', authenticate, studentsController.getMyChildren); // For parents
router.get('/statistics/overview', authenticate, studentsController.getStatistics);
router.get('/statistics/by-class', authenticate, studentsController.getCountByClass);
router.get('/statistics', authenticate, studentsController.getStatistics);

// ============================================================================
// SPECIFIC LOOKUP ROUTES (before /:id)
// ============================================================================

router.get('/admission/:admission_no', authenticate, studentsController.getStudentByAdmissionNo);
router.get('/class/:class_id', authenticate, studentsController.getStudentsByClass);

// ============================================================================
// ANALYTICS & REPORTING ROUTES (before /:id routes)
// ============================================================================

/**
 * @route   GET /api/v1/students/:id/results
 * @desc    Get student results for all subjects
 * @query   termId - Filter by academic term
 * @access  Admin, Teacher, Student (own results)
 */
router.get('/:id/results', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getStudentResults
);

/**
 * @route   GET /api/v1/students/:id/report-card
 * @desc    Generate student report card
 * @query   termId - Academic term for report
 * @access  Admin, Teacher, Student (own report)
 */
router.get('/:id/report-card', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getReportCard
);

/**
 * @route   GET /api/v1/students/:id/report-card/pdf
 * @desc    Export report card as PDF
 * @query   termId - Academic term for report
 * @access  Admin, Teacher, Student (own report)
 */
router.get('/:id/report-card/pdf', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getReportCardPdf
);

/**
 * @route   GET /api/v1/students/:id/overall-competency
 * @desc    Get overall CBC competency level
 * @query   termId - Academic term
 * @access  Admin, Teacher
 */
router.get('/:id/overall-competency', 
  authenticate, 
  authorize('ADMIN', 'TEACHER'), 
  studentsController.getOverallCompetency
);

/**
 * @route   GET /api/v1/students/:id/subject-performance
 * @desc    Get subject-wise performance analysis
 * @query   termId - Academic term
 * @access  Admin, Teacher, Student (own performance)
 */
router.get('/:id/subject-performance', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getSubjectPerformance
);

/**
 * @route   GET /api/v1/students/:id/performance-trend
 * @desc    Get performance trends over time
 * @query   terms - Number of terms to analyze
 * @access  Admin, Teacher, Student (own trends)
 */
router.get('/:id/performance-trend', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getPerformanceTrend
);

/**
 * @route   GET /api/v1/students/:id/rank
 * @desc    Get student's rank in class
 * @query   termId - Academic term
 * @access  Admin, Teacher, Student (own rank)
 */
router.get('/:id/rank', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getStudentRank
);

/**
 * @route   GET /api/v1/students/:id/transcript
 * @desc    Export student transcript
 * @query   format - pdf or excel
 * @access  Admin, Teacher, Student (own transcript)
 */
router.get('/:id/transcript', 
  authenticate, 
  authorize('ADMIN', 'TEACHER', 'STUDENT'), 
  studentsController.getTranscript
);

/**
 * @route   GET /api/v1/students/:id/progress-tracker
 * @desc    Track learner progress across terms (CBC)
 * @query   subjectId - Subject to track
 * @access  Admin, Teacher
 */
router.get('/:id/progress-tracker', 
  authenticate, 
  authorize('ADMIN', 'TEACHER'), 
  studentsController.getProgressTracker
);

// ============================================================================
// STUDENT STATUS MANAGEMENT (before general /:id routes)
// ============================================================================

router.patch('/:id/status', authenticate, studentsController.updateStatus);
router.post('/:id/suspend', authenticate, studentsController.suspendStudent);
router.post('/:id/withdraw', authenticate, studentsController.withdrawStudent);
router.post('/:id/graduate', authenticate, studentsController.graduateStudent);
router.post('/:id/promote', authenticate, studentsController.promoteStudent);
router.post('/:id/retain', authenticate, studentsController.retainStudent);
router.get('/:id/status-history', authenticate, studentsController.getStatusHistory);
router.get('/:id/promotion-eligibility', authenticate, studentsController.getPromotionEligibility);

// ============================================================================
// CLASS TRANSFER
// ============================================================================

router.post('/:id/transfer', authenticate, studentsController.transferStudent);
router.get('/:id/transfer-history', authenticate, studentsController.getTransferHistory);

// ============================================================================
// STUDENT UPDATES (Specific Sections)
// ============================================================================

router.patch('/:id/medical', authenticate, studentsController.updateMedical);
router.patch('/:id/contact', authenticate, studentsController.updateContact);
router.get('/:id/history', authenticate, studentsController.getUpdateHistory);

// ============================================================================
// PARENT/GUARDIAN MANAGEMENT
// ============================================================================

router.post('/:id/parents', authenticate, studentsController.addParent);
router.get('/:id/parents', authenticate, studentsController.getParents);
router.put('/:id/parents/:parentId', authenticate, studentsController.updateParent);
router.delete('/:id/parents/:parentId', authenticate, studentsController.deleteParent);

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

router.post('/:id/documents', authenticate, studentsController.uploadDocument);
router.get('/:id/documents', authenticate, studentsController.getDocuments);
router.delete('/:id/documents/:docId', authenticate, studentsController.deleteDocument);

// ============================================================================
// REPORTS & SUMMARIES
// ============================================================================

router.get('/:id/academic-summary', authenticate, studentsController.getAcademicSummary);
router.get('/:id/attendance-summary', authenticate, studentsController.getAttendanceSummary);
router.get('/:id/fee-summary', authenticate, studentsController.getFeeSummary);
router.get('/:id/profile-report', authenticate, studentsController.getProfileReport);
router.get('/:id/export', authenticate, studentsController.exportStudentData);

// ============================================================================
// LEGACY ROUTES (for backward compatibility)
// ============================================================================

router.post('/:id/deactivate', authenticate, studentsController.deactivateStudent);
router.post('/:id/reactivate', authenticate, studentsController.reactivateStudent);

// ============================================================================
// STUDENT CRUD (Must come last - catches any /:id not matched above)
// ============================================================================

router.post('/', authenticate, studentsController.createStudent);
router.get('/', authenticate, studentsController.getAllStudents);
router.get('/:id', authenticate, studentsController.getStudentById);
router.get('/:id/profile', authenticate, studentsController.getStudentProfile);
router.put('/:id', authenticate, studentsController.updateStudent);
router.delete('/:id', authenticate, studentsController.deleteStudent);

// ============================================================================
// ROUTE COUNTER
// ============================================================================

const routeCount = router.stack.filter(r => r.route).length;
console.log(`[ROUTES] Total students routes registered: ${routeCount}`);

module.exports = router;