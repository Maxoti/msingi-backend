'use strict';

const express    = require('express');
const router     = express.Router();
const ctrl       = require('./auth.controllers');
const { authenticate, authorize } = require('../../shared/middleware/auth');
const db         = require('../../shared/database/client');

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/register',         ctrl.register);
router.post('/login',            ctrl.login);
router.post('/refresh',          ctrl.refreshToken);
router.post('/forgot-password',  ctrl.forgotPassword);
router.post('/reset-password',   ctrl.resetPassword);

// ── Protected ─────────────────────────────────────────────────────────────────
router.get('/me',                authenticate, ctrl.getProfile);
router.put('/profile',           authenticate, ctrl.updateProfile);
router.post('/change-password',  authenticate, ctrl.changePassword);
router.post('/logout',           authenticate, ctrl.logout);
router.post('/logout-all',       authenticate, ctrl.logoutAll);
router.post('/cleanup-tokens',   authenticate, ctrl.cleanupTokens);

// Sessions
router.get('/sessions',              authenticate, ctrl.listSessions);
router.delete('/sessions/:tokenId',  authenticate, ctrl.revokeSession);

module.exports = router;