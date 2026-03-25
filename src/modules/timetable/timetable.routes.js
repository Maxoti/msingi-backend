const express    = require('express');
const router     = express.Router();
const controller = require('./timetable.controller');
const { authenticate, authorize } = require('../../shared/middleware/auth');

router.use(authenticate);

router.get('/slots',       authorize('ADMIN', 'TEACHER'), controller.getAllSlots);
router.post('/slots',      authorize('ADMIN'),             controller.createSlot);
router.put('/slots/:id',   authorize('ADMIN'),             controller.updateSlot);
router.delete('/slots/:id', authorize('ADMIN'),            controller.deleteSlot);

router.post('/',                 authorize('ADMIN'),             controller.createEntry);
router.get('/class/:classId',   authorize('ADMIN', 'TEACHER'), controller.getClassTimetable);
router.get('/teacher/:staffId', authorize('ADMIN', 'TEACHER'), controller.getTeacherTimetable);
router.put('/:id',              authorize('ADMIN'),             controller.updateEntry);
router.delete('/:id',           authorize('ADMIN'),             controller.deleteEntry);

module.exports = router;
