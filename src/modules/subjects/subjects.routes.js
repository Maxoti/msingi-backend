const express = require('express');
const router = express.Router();
const subjectsController = require('./subjects.controllers'); 
const { authenticate, authorize } = require('../../shared/middleware/auth');

console.log('[ROUTES] Subjects routes module loaded');

// Metadata routes
router.get('/grade-levels',     authenticate, subjectsController.getValidGradeLevels);
router.get('/valid-categories', authenticate, subjectsController.getValidCategories);
router.get('/categories',       authenticate, subjectsController.getAllCategories);
router.get('/statistics',       authenticate, authorize('ADMIN'), subjectsController.getSubjectsStatistics);

// Query routes (must come before /:id)
router.get('/code/:code',           authenticate, subjectsController.getSubjectByCode);
router.get('/grade/:gradeLevel',    authenticate, subjectsController.getSubjectsByGradeLevel);
router.get('/category/:category',   authenticate, subjectsController.getSubjectsByCategory);
router.get('/class/:classId',       authenticate, subjectsController.getSubjectsForClass);

// CRUD routes
router.get('/',    authenticate, subjectsController.getAllSubjects);
router.get('/:id', authenticate, subjectsController.getSubjectById);
router.post('/',   authenticate, authorize('ADMIN'), subjectsController.createSubject);
router.put('/:id', authenticate, authorize('ADMIN'), subjectsController.updateSubject);
router.delete('/:id', authenticate, authorize('ADMIN'), subjectsController.deleteSubject);

// Action routes
router.post('/:id/deactivate', authenticate, authorize('ADMIN'), subjectsController.deactivateSubject);
router.post('/:id/activate',   authenticate, authorize('ADMIN'), subjectsController.activateSubject);

// FIX: removed getSubjectReport, getToppers, getCompetencyRubrics — not in controller

const routeCount = router.stack.filter(r => r.route).length;
console.log(`[ROUTES] Total subjects routes registered: ${routeCount}`);

module.exports = router;