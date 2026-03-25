/**
 * Classes Routes
 * Defines all routes for class management
 */

const express = require('express');
const router = express.Router();
const classesController = require('./classes.controllers');
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log('[ROUTES] Classes routes module loaded');

// Protected routes (require authentication for ALL routes below)
router.use(authenticate);

/* -------------------------------------------------------------------------- */
/*                    SPECIFIC ROUTES (MUST COME BEFORE /:id)                */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/classes/teacher/:teacherId
 * @desc    Get all classes assigned to a specific teacher
 * @access  Admin, Teacher
 */
router.get('/teacher/:teacherId', authorize('ADMIN', 'TEACHER'), classesController.getClassesByTeacher);

/* -------------------------------------------------------------------------- */
/*              ANALYTICS & REPORTING ROUTES (BEFORE /:id ROUTES)            */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/classes/:id/ranking
 * @desc    Get class ranking/leaderboard
 * @query   termId - Academic term for ranking
 * @access  Admin, Teacher
 */
router.get('/:id/ranking', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getClassRanking
);

/**
 * @route   GET /api/v1/classes/:id/analytics
 * @desc    Get class analytics (average, pass rate, etc.)
 * @query   termId - Academic term for analytics
 * @access  Admin, Teacher
 */
router.get('/:id/analytics', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getClassAnalytics
);

/**
 * @route   GET /api/v1/classes/:id/report-summary
 * @desc    Generate class report summary
 * @query   termId - Academic term
 * @access  Admin, Teacher
 */
router.get('/:id/report-summary', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getReportSummary
);

/**
 * @route   GET /api/v1/classes/:id/performance-comparison
 * @desc    Compare class performance across terms
 * @query   term1, term2 - Terms to compare
 * @access  Admin, Teacher
 */
router.get('/:id/performance-comparison', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getPerformanceComparison
);

/**
 * @route   GET /api/v1/classes/:id/export/results
 * @desc    Export class results
 * @query   termId - Academic term
 * @query   format - pdf, csv, or excel
 * @access  Admin, Teacher
 */
router.get('/:id/export/results', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.exportResults
);

/**
 * @route   GET /api/v1/classes/:id/statistics
 * @desc    Get class statistics
 * @access  Admin, Teacher
 */
router.get('/:id/statistics', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getStatistics
);

/**
 * @route   GET /api/v1/classes/:id/gender-distribution
 * @desc    Get gender distribution in class
 * @access  Admin, Teacher
 */
router.get('/:id/gender-distribution', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getGenderDistribution
);

/**
 * @route   GET /api/v1/classes/:id/age-distribution
 * @desc    Get age distribution in class
 * @access  Admin, Teacher
 */
router.get('/:id/age-distribution', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getAgeDistribution
);

/**
 * @route   GET /api/v1/classes/:id/capacity
 * @desc    Get class capacity status
 * @access  Admin, Teachers
 */
router.get('/:id/capacity', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getCapacityStatus
);

/**
 * @route   GET /api/v1/classes/:id/can-accept
 * @desc    Check if class can accept new students
 * @access  Admin
 */
router.get('/:id/can-accept', 
  authorize('ADMIN'), 
  classesController.canAcceptStudents
);

/**
 * @route   GET /api/v1/classes/:id/students
 * @desc    Get all students in a class
 * @access  Admin, Class Teacher
 */
router.get('/:id/students', 
  authorize('ADMIN', 'TEACHER'), 
  classesController.getClassStudents
);

/* -------------------------------------------------------------------------- */
/*                    ADMIN & TEACHER ROUTES (VIEW ACCESS)                    */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/classes
 * @desc    Get all classes with optional filters
 * @query   grade_level, teacher_id
 * @access  Admin, Teachers
 */
router.get('/', authorize('ADMIN', 'TEACHER'), classesController.getAllClasses);

/**
 * @route   GET /api/v1/classes/:id
 * @desc    Get class by ID
 * @access  Admin, Teachers
 */
router.get('/:id', authorize('ADMIN', 'TEACHER'), classesController.getClassById);

/* -------------------------------------------------------------------------- */
/*                       ADMIN-ONLY ROUTES (MODIFICATIONS)                    */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/classes
 * @desc    Create a new class
 * @access  Admin only
 */
router.post('/', authorize('ADMIN'), classesController.createClass);

/**
 * @route   PUT /api/v1/classes/:id
 * @desc    Update class
 * @access  Admin only
 */
router.put('/:id', authorize('ADMIN'), classesController.updateClass);

/**
 * @route   DELETE /api/v1/classes/:id
 * @desc    Delete class
 * @access  Admin only
 */
router.delete('/:id', authorize('ADMIN'), classesController.deleteClass);

/**
 * @route   POST /api/v1/classes/:id/teacher
 * @desc    Assign teacher to class
 * @access  Admin only
 */
router.post('/:id/teacher', authorize('ADMIN'), classesController.assignTeacher);

/**
 * @route   DELETE /api/v1/classes/:id/teacher
 * @desc    Remove teacher from class
 * @access  Admin only
 */
router.delete('/:id/teacher', authorize('ADMIN'), classesController.removeTeacher);

/* -------------------------------------------------------------------------- */
/*                              ROUTE COUNTER                                */
/* -------------------------------------------------------------------------- */

const routeCount = router.stack.filter(r => r.route).length;
console.log(`[ROUTES] Total classes routes registered: ${routeCount}`);

module.exports = router;