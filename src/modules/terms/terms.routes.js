/**
 * Academic Terms Routes
 *
 * Mount point: /api/v1/terms
 * Auth:        All routes require a valid JWT (router-level middleware)
 * Multi-tenancy: req.schoolId is injected by authenticate()
 *
 * Route ordering rules (Express matches top-to-bottom):
 *   1. Static segments before parameterised ones  (/active before /:id)
 *   2. More-specific paths before less-specific   (/:id/statistics before /:id)
 *   3. Write operations use semantically correct HTTP verbs
 *      POST   → create a new resource
 *      PATCH  → partial update of an existing resource
 *      DELETE → remove a resource
 *      (PUT is intentionally absent — full-replacement semantics don't apply here)
 */

'use strict';

const { Router } = require('express');
const { authenticate, authorize } = require('../../shared/middleware/auth');
const ctrl = require('./terms.controller');

const router = Router();

// ── Auth guard (applies to every route below) ─────────────────────────────────
router.use(authenticate);

// ── Shorthand role sets ───────────────────────────────────────────────────────
const adminOnly      = authorize('ADMIN');
const adminOrTeacher = authorize('ADMIN', 'TEACHER');

// ═══════════════════════════════════════════════════════════════════════════════
// READ  (GET)  —  Admin + Teacher
// Static/specific routes MUST come before /:id to avoid being swallowed by it
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/terms
router.get('/',                adminOrTeacher, ctrl.getAllTerms);

// GET /api/v1/terms/active
router.get('/active',          adminOrTeacher, ctrl.getActiveTerm);

// GET /api/v1/terms/current?date=YYYY-MM-DD
router.get('/current',         adminOrTeacher, ctrl.getCurrentTerm);

// GET /api/v1/terms/years
router.get('/years',           adminOrTeacher, ctrl.getAllYears);

// GET /api/v1/terms/year/2026
router.get('/year/:year',      adminOrTeacher, ctrl.getTermsByYear);

// GET /api/v1/terms/42/statistics   ← must be before /:id
router.get('/:id/statistics',  adminOrTeacher, ctrl.getTermStatistics);

// GET /api/v1/terms/42
router.get('/:id',             adminOrTeacher, ctrl.getTermById);

// ═══════════════════════════════════════════════════════════════════════════════
// WRITE  —  Admin only
// Specific sub-routes (/:id/activate) before the bare /:id handlers
// ═══════════════════════════════════════════════════════════════════════════════

// POST   /api/v1/terms
router.post('/',               adminOnly, ctrl.createTerm);

// PATCH  /api/v1/terms/42/activate   ← must be before PATCH /:id
router.patch('/:id/activate',  adminOnly, ctrl.setActiveTerm);

// PATCH  /api/v1/terms/42
router.patch('/:id',           adminOnly, ctrl.updateTerm);

// DELETE /api/v1/terms/42
router.delete('/:id',          adminOnly, ctrl.deleteTerm);

module.exports = router;