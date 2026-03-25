/**
 * Attendance Routes
 * Defines API endpoints for attendance management
 */

const express = require('express');
const router = express.Router();
const attendanceController = require('./attendance.controllers');
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log(' [ROUTES] Attendance routes module loaded');

// Note: All routes require authentication
// Specific routes MUST come before dynamic :param routes to prevent conflicts

/* -------------------------------------------------------------------------- */
/*                           BULK OPERATIONS                                  */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/attendance/bulk
 * @desc    Bulk mark attendance for multiple students
 * @access  Private (ADMIN, TEACHER)
 */
router.post(
  '/bulk',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.bulkMarkAttendance
);

/* -------------------------------------------------------------------------- */
/*                           STATISTICS & REPORTS                             */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/attendance/low-attendance
 * @desc    Get students with low attendance across all classes
 * @access  Private (ADMIN, TEACHER)
 * @query   threshold, start_date, end_date
 */
router.get(
  '/low-attendance',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.getLowAttendanceStudents
);

/**
 * @route   GET /api/v1/attendance/school/:date
 * @desc    Get school-wide attendance for a specific date
 * @access  Private (ADMIN, TEACHER)
 */
router.get(
  '/school/:date',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.getSchoolAttendance
);

/* -------------------------------------------------------------------------- */
/*                           STUDENT STATISTICS                               */
/* -------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/attendance/students/:studentId/stats
 * @desc    Get student attendance statistics
 * @access  Private (All authenticated users)
 * @query   start_date, end_date (required)
 */
router.get(
  '/students/:studentId/stats',
  authenticate,
  attendanceController.getStudentAttendanceStats
);

/* -------------------------------------------------------------------------- */
/*                           CLASS OPERATIONS                                 */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/attendance/class/:classId
 * @desc    Mark attendance for entire class
 * @access  Private (ADMIN, TEACHER)
 */
router.post(
  '/class/:classId',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.markClassAttendance
);

/**
 * @route   GET /api/v1/attendance/classes/:classId/date/:date
 * @desc    Get class attendance for a specific date
 * @access  Private (ADMIN, TEACHER)
 */
router.get(
  '/classes/:classId/date/:date',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.getClassAttendanceByDate
);

/**
 * @route   GET /api/v1/attendance/classes/:classId/stats
 * @desc    Get class attendance statistics
 * @access  Private (ADMIN, TEACHER)
 * @query   start_date, end_date (required)
 */
router.get(
  '/classes/:classId/stats',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.getClassAttendanceStats
);

/**
 * @route   GET /api/v1/attendance/classes/:classId/absent/:date
 * @desc    Get absent students for a specific date
 * @access  Private (ADMIN, TEACHER)
 */
router.get(
  '/classes/:classId/absent/:date',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.getAbsentStudents
);

/* -------------------------------------------------------------------------- */
/*                           CRUD OPERATIONS                                  */
/* -------------------------------------------------------------------------- */

/**
 * @route   POST /api/v1/attendance
 * @desc    Mark attendance for a single student
 * @access  Private (ADMIN, TEACHER)
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.markAttendance
);

/**
 * @route   GET /api/v1/attendance
 * @desc    Get attendance records with filters and pagination
 * @access  Private (All authenticated users)
 * @query   student_id, class_id, date, start_date, end_date, status, page, limit
 */
router.get(
  '/',
  authenticate,
  attendanceController.getAttendance
);

/**
 * @route   GET /api/v1/attendance/:id
 * @desc    Get attendance record by ID
 * @access  Private (All authenticated users)
 * @note    Must be after all specific routes to prevent matching them
 */
router.get(
  '/:id',
  authenticate,
  attendanceController.getAttendanceById
);

/**
 * @route   PUT /api/v1/attendance/:id
 * @desc    Update attendance record
 * @access  Private (ADMIN, TEACHER)
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  attendanceController.updateAttendance
);

/**
 * @route   DELETE /api/v1/attendance/:id
 * @desc    Delete attendance record
 * @access  Private (ADMIN only)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  attendanceController.deleteAttendance
);

// Count and log total routes
const routeCount = router.stack.filter(r => r.route).length;
console.log(` [ROUTES] Total attendance routes registered: ${routeCount}`);

module.exports = router;