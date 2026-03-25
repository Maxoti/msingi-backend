/**
 * Staff Routes
 * Defines all routes for staff management
 */

const express = require('express');
const router = express.Router();

const staffController = require('./staff.controller');
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log(' [ROUTES] Staff routes module loaded');
// DEBUG: Check what's in staffController
console.log(' Staff Controller keys:', Object.keys(staffController));
console.log(' staffController.createStaff type:', typeof staffController.createStaff);
console.log(' staffController.createStaff value:', staffController.createStaff);

console.log('[ROUTES] Staff routes module loaded');

// Protected routes (require authentication for ALL routes below)
router.use(authenticate);

/* -------------------------------------------------------------------------- */
/*                          STAFF MEMBER ROUTES (OWN PROFILE)                 */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/staff/me/profile
 * @desc    Get own profile
 * @access  Staff (authenticated)
 */
router.get('/me/profile', staffController.getMyProfile);

/**
 * @route   PUT /api/v1/staff/me/profile
 * @desc    Update own profile
 * @access  Staff (authenticated)
 */
router.put('/me/profile', staffController.updateMyProfile);

/**
 * @route   PUT /api/v1/staff/:id/password
 * @desc    Update own password
 * @access  Staff (own account only)
 */
router.put('/:id/password', staffController.updatePassword);

/* -------------------------------------------------------------------------- */
/*                    ADMIN & STAFF ROUTES (VIEW ACCESS)                      */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/staff
 * @desc    Get all staff members with pagination and filters
 * @access  Admin, Staff
 */
router.get('/', authorize('ADMIN', 'STAFF'), staffController.getAllStaff);

/**
 * @route   GET /api/v1/staff/stats/overview
 * @desc    Get staff statistics
 * @access  Admin
 */
router.get('/stats/overview', authorize('ADMIN'), staffController.getStaffStats);

/**
 * @route   GET /api/v1/staff/department/:department
 * @desc    Get staff by department
 * @access  Admin, Staff
 */
router.get('/department/:department', authorize('ADMIN', 'STAFF'), staffController.getStaffByDepartment);

/**
 * @route   GET /api/v1/staff/employee/:employeeNumber
 * @desc    Get staff by employee number
 * @access  Admin, Staff
 */
router.get('/employee/:employeeNumber', authorize('ADMIN', 'STAFF'), staffController.getStaffByEmployeeNumber);

/**
 * @route   GET /api/v1/staff/:id
 * @desc    Get staff by ID
 * @access  Admin, Staff
 */
router.get('/:id', authorize('ADMIN', 'STAFF'), staffController.getStaffById);

/* -------------------------------------------------------------------------- */
/*                       ADMIN-ONLY ROUTES (MODIFICATIONS)                    */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/staff
 * @desc    Create new staff member
 * @access  Admin only
 */
router.post('/', authorize('ADMIN'), staffController.createStaff); // ✅ FIXED

/**
 * @route   PUT /api/v1/staff/:id
 * @desc    Update staff member
 * @access  Admin only
 */
router.put('/:id', authorize('ADMIN'), staffController.updateStaff);

/**
 * @route   POST /api/v1/staff/:id/deactivate
 * @desc    Deactivate staff member
 * @access  Admin only
 */
router.post('/:id/deactivate', authorize('ADMIN'), staffController.deactivateStaff);

/**
 * @route   POST /api/v1/staff/:id/reactivate
 * @desc    Reactivate staff member
 * @access  Admin only
 */
router.post('/:id/reactivate', authorize('ADMIN'), staffController.reactivateStaff);

/**
 * @route   POST /api/v1/staff/:id/reset-password
 * @desc    Reset staff password (admin only)
 * @access  Admin only
 */
router.post('/:id/reset-password', authorize('ADMIN'), staffController.resetPassword);

/**
 * @route   DELETE /api/v1/staff/:id
 * @desc    Delete staff member permanently
 * @access  Admin only
 */
router.delete('/:id', authorize('ADMIN'), staffController.deleteStaff);

console.log(' [ROUTES] Total routes registered:', router.stack.length);

module.exports = router;