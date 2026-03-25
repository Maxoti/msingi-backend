const timetableService  = require('./timetable.service');
const { asyncHandler }  = require('../../shared/middleware/errorHandler');
const { successResponse } = require('../../shared/utils/response');

class TimetableController {
  createSlot = asyncHandler(async (req, res) => {
    const slot = await timetableService.createSlot(req.body, req.schoolId);
    successResponse(res, slot, 'Time slot created successfully', 201);
  });
  getAllSlots = asyncHandler(async (req, res) => {
    const slots = await timetableService.getAllSlots(req.schoolId);
    successResponse(res, slots, 'Time slots retrieved successfully');
  });
  updateSlot = asyncHandler(async (req, res) => {
    const slot = await timetableService.updateSlot(req.schoolId, req.params.id, req.body);
    successResponse(res, slot, 'Time slot updated successfully');
  });
  deleteSlot = asyncHandler(async (req, res) => {
    await timetableService.deleteSlot(req.schoolId, req.params.id);
    successResponse(res, null, 'Time slot deleted successfully');
  });
  createEntry = asyncHandler(async (req, res) => {
    const entry = await timetableService.createEntry(req.body, req.schoolId);
    successResponse(res, entry, 'Timetable entry created successfully', 201);
  });
  getClassTimetable = asyncHandler(async (req, res) => {
    const timetable = await timetableService.getClassTimetable(req.schoolId, req.params.classId, req.query.termId);
    successResponse(res, timetable, 'Class timetable retrieved successfully');
  });
  getTeacherTimetable = asyncHandler(async (req, res) => {
    const timetable = await timetableService.getTeacherTimetable(req.schoolId, req.params.staffId, req.query.termId);
    successResponse(res, timetable, 'Teacher timetable retrieved successfully');
  });
  updateEntry = asyncHandler(async (req, res) => {
    const entry = await timetableService.updateEntry(req.schoolId, req.params.id, req.body);
    successResponse(res, entry, 'Timetable entry updated successfully');
  });
  deleteEntry = asyncHandler(async (req, res) => {
    await timetableService.deleteEntry(req.schoolId, req.params.id);
    successResponse(res, null, 'Timetable entry deleted successfully');
  });
}

module.exports = new TimetableController();
