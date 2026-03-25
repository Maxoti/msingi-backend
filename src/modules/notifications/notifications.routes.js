// src/modules/notifications/notifications.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../shared/middleware/auth');
const notificationController = require('./notifications.controller');

// ============================================================
// CRITICAL: Route Order Matters!
// ============================================================
// Specific paths MUST come BEFORE parameterized paths like /:id
// Otherwise /:id will match everything (e.g., /stats becomes id="stats")

// ============================================================
// NOTIFICATION QUEUE ROUTES
// ============================================================

/**
 * POST /api/v1/notifications
 * Create a new notification (queue an SMS)
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  notificationController.createNotification
);

/**
 * GET /api/v1/notifications
 * List all notifications with filtering
 */
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  notificationController.getNotifications
);

/**
 * GET /api/v1/notifications/stats
 * Get notification queue statistics
 * MUST come before /:id
 */
router.get(
  '/stats',
  authenticate,
  authorize('ADMIN'),
  notificationController.getNotificationStats
);

/**
 * POST /api/v1/notifications/retry-all
 * Retry all failed notifications
 * MUST come before /:id
 */
router.post(
  '/retry-all',
  authenticate,
  authorize('ADMIN'),
  notificationController.retryAllFailedNotifications
);

// ============================================================
// SMS LOGS ROUTES - MUST COME BEFORE /:id ROUTE!
// ============================================================

/**
 * GET /api/v1/notifications/sms-logs/stats
 * Get SMS logs statistics
 * MUST come before /:id and /sms-logs/:id
 */
router.get(
  '/sms-logs/stats',
  authenticate,
  authorize('ADMIN'),
  notificationController.getSmsLogStats
);

/**
 * GET /api/v1/notifications/sms-logs
 * List SMS logs with filtering
 * MUST come before /:id
 */
router.get(
  '/sms-logs',
  authenticate,
  authorize('ADMIN'),
  notificationController.getSmsLogs
);

/**
 * GET /api/v1/notifications/sms-logs/:id
 * Get a specific SMS log by ID
 * MUST come before the main /:id route
 */
router.get(
  '/sms-logs/:id',
  authenticate,
  authorize('ADMIN'),
  notificationController.getSmsLogById
);

// ============================================================
// PARAMETERIZED ROUTES - MUST COME AFTER ALL SPECIFIC ROUTES
// ============================================================

/**
 * POST /api/v1/notifications/retry/:id
 * Retry a specific failed notification
 * This must come before GET /:id to avoid conflicts
 */
router.post(
  '/retry/:id',
  authenticate,
  authorize('ADMIN'),
  notificationController.retryNotification
);

/**
 * GET /api/v1/notifications/:id
 * Get a specific notification by ID
 * This catches anything not matched above
 */
router.get(
  '/:id',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  notificationController.getNotificationById
);

/**
 * PUT /api/v1/notifications/:id
 * Update a notification (e.g., change status, priority)
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'TEACHER'),
  notificationController.updateNotification
);

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification (only if PENDING or FAILED)
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  notificationController.deleteNotification
);

module.exports = router;