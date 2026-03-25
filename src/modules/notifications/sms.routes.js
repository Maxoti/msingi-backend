'use strict';

// src/modules/notifications/sms.routes.js

const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../../shared/middleware/auth');
const ctrl = require('./sms.controller');

// ── Rate limiter: max 15 SMS sends per minute per user ─────────────────────
// Use req.user.id as key when authenticated (avoids IPv6 issues entirely).
// Falls back to req.ip only when user is not set, which won't happen on
// protected routes since authenticate runs first.
const smsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req) => `user_${req.user?.id || 'anon'}`,
  skip: () => false,
  // Removed 'ipKeyGenerator' — not a recognised validate key in this version of express-rate-limit.
  // xForwardedForHeader: false suppresses the proxy trust warning since we use a custom keyGenerator.
  validate: { xForwardedForHeader: false },
  handler: (_req, res) =>
    res.status(429).json({ success: false, message: 'Too many SMS requests. Please try again later.' }),
});

// ── Single & Bulk ──────────────────────────────────────────────────────────
router.post('/send',                      authenticate, authorize('ADMIN', 'TEACHER'), smsRateLimiter, ctrl.sendSingle);
router.post('/send-bulk',                 authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendBulk);
router.post('/send-to-class',             authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendToClass);

// ── Domain senders ─────────────────────────────────────────────────────────
router.post('/fee-reminder',              authenticate, authorize('ADMIN'),            ctrl.sendFeeReminder);
router.post('/bulk-fee-reminders',        authenticate, authorize('ADMIN'),            ctrl.sendBulkFeeReminders);
router.post('/exam-results',              authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendExamResults);
router.post('/bulk-results-notification', authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendBulkResults);
router.post('/absence-alert',             authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendAbsenceAlert);
router.post('/late-arrival',             authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendLateArrival);
router.post('/announcement',              authenticate, authorize('ADMIN'),            ctrl.sendAnnouncement);
router.post('/emergency-alert',           authenticate, authorize('ADMIN'),            ctrl.sendEmergencyAlert);

// ── Templates ──────────────────────────────────────────────────────────────
router.get('/templates',                  authenticate, authorize('ADMIN', 'TEACHER'), ctrl.listTemplates);
router.post('/templates',                 authenticate, authorize('ADMIN'),            ctrl.createTemplate);
router.post('/send-template',             authenticate, authorize('ADMIN', 'TEACHER'), ctrl.sendTemplate);

// ── Delivery tracking — specific routes BEFORE parameterised /:messageId ──
router.get('/delivery-report',            authenticate, authorize('ADMIN'),            ctrl.getDeliveryReport);
router.get('/message/:messageId',         authenticate, authorize('ADMIN'),            ctrl.getMessageById);

// ── Balance — /balance-check BEFORE /balance to avoid prefix clash ─────────
router.get('/balance-check',              authenticate, authorize('ADMIN'),            ctrl.getBalanceCheck);
router.get('/balance',                    authenticate, authorize('ADMIN'),            ctrl.getBalance);

// ── Usage & analytics — /reports/* BEFORE /analytics to avoid conflicts ───
router.get('/reports/usage',              authenticate, authorize('ADMIN'),            ctrl.getUsageReport);
router.get('/reports/cost-breakdown',     authenticate, authorize('ADMIN'),            ctrl.getCostBreakdown);
router.get('/analytics',                  authenticate, authorize('ADMIN'),            ctrl.getAnalytics);
router.get('/usage',                      authenticate, authorize('ADMIN'),            ctrl.getUsage);
router.get('/export',                     authenticate, authorize('ADMIN'),            ctrl.exportLogs);

// ── Scheduling — /scheduled BEFORE /schedule/:id ──────────────────────────
router.post('/schedule',                  authenticate, authorize('ADMIN'),            ctrl.scheduleMessage);
router.get('/scheduled',                  authenticate, authorize('ADMIN'),            ctrl.listScheduled);
router.delete('/scheduled/:id',           authenticate, authorize('ADMIN'),            ctrl.cancelScheduled);

module.exports = router;