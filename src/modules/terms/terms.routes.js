/**
 * Terms Routes
 * API routes for academic terms management
 */

const express = require('express');
const router = express.Router();
const termsController = require('./terms.controller');
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log('[ROUTES] Terms routes module loaded');

// All routes require authentication
router.use(authenticate);

/* -------------------------------------------------------------------------- */
/*                    ADMIN & TEACHER ROUTES (VIEW ACCESS)                    */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/terms
 * @desc    Get all academic terms with pagination
 * @access  Admin, Teacher
 */
router.get('/', authorize('ADMIN', 'TEACHER'), termsController.getAllTerms);

/**
 * @route   GET /api/v1/terms/active
 * @desc    Get currently active term
 * @access  Admin, Teacher
 */
router.get('/active', authorize('ADMIN', 'TEACHER'), termsController.getActiveTerm);

/**
 * @route   GET /api/v1/terms/current
 * @desc    Get term for specific date (defaults to today)
 * @access  Admin, Teacher
 */
router.get('/current', authorize('ADMIN', 'TEACHER'), termsController.getCurrentTerm);

/**
 * @route   GET /api/v1/terms/years
 * @desc    Get all years that have terms
 * @access  Admin, Teacher
 */
router.get('/years', authorize('ADMIN', 'TEACHER'), termsController.getAllYears);

/**
 * @route   GET /api/v1/terms/year/:year
 * @desc    Get all terms for a specific year
 * @access  Admin, Teacher
 */
router.get('/year/:year', authorize('ADMIN', 'TEACHER'), termsController.getTermsByYear);

/**
 * @route   GET /api/v1/terms/:id
 * @desc    Get term by ID
 * @access  Admin, Teacher
 */
router.get('/:id', authorize('ADMIN', 'TEACHER'), termsController.getTermById);

/**
 * @route   GET /api/v1/terms/:id/statistics
 * @desc    Get term statistics (exams, students, etc.)
 * @access  Admin, Teacher
 */
router.get('/:id/statistics', authorize('ADMIN', 'TEACHER'), termsController.getTermStatistics);

/* -------------------------------------------------------------------------- */
/*                        ADMIN-ONLY ROUTES (MODIFICATIONS)                   */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/terms
 * @desc    Create a new academic term
 * @access  Admin only
 */
router.post('/', authorize('ADMIN'), termsController.createTerm);

/**
 * @route   PUT /api/v1/terms/:id
 * @desc    Update an academic term
 * @access  Admin only
 */
router.put('/:id', authorize('ADMIN'), termsController.updateTerm);

/**
 * @route   POST /api/v1/terms/:id/activate
 * @desc    Activate a term (deactivates others)
 * @access  Admin only
 */
router.post('/:id/activate', authorize('ADMIN'), termsController.setActiveTerm);

/**
 * @route   DELETE /api/v1/terms/:id
 * @desc    Delete an academic term
 * @access  Admin only
 */
router.delete('/:id', authorize('ADMIN'), termsController.deleteTerm);

console.log('[ROUTES] Total terms routes registered:', router.stack.length);

module.exports = router;