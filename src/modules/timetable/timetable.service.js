const timetableRepository = require('./timetable.repository');
const { AppError } = require('../../shared/middleware/errorHandler');

const DAYS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday' };

class TimetableService {

  async createSlot(data, schoolId) {
    if (!data.name)       throw new AppError('Slot name is required', 400);
    if (!data.start_time) throw new AppError('Start time is required', 400);
    if (!data.end_time)   throw new AppError('End time is required', 400);
    if (data.start_time >= data.end_time) throw new AppError('Start time must be before end time', 400);
    return timetableRepository.createSlot(data, schoolId);
  }

  async getAllSlots(schoolId) {
    return timetableRepository.getAllSlots(schoolId);
  }

  async updateSlot(schoolId, id, data) {
    const slot = await timetableRepository.getSlotById(schoolId, id);
    if (!slot) throw new AppError('Time slot not found', 404);
    if (data.start_time && data.end_time && data.start_time >= data.end_time)
      throw new AppError('Start time must be before end time', 400);
    return timetableRepository.updateSlot(schoolId, id, data);
  }

  async deleteSlot(schoolId, id) {
    const slot = await timetableRepository.getSlotById(schoolId, id);
    if (!slot) throw new AppError('Time slot not found', 404);
    const inUse = await timetableRepository.slotInUse(schoolId, id);
    if (inUse) throw new AppError('Cannot delete a time slot that is used in the timetable', 400);
    return timetableRepository.deleteSlot(schoolId, id);
  }

  async createEntry(data, schoolId) {
    if (!data.class_id)    throw new AppError('class_id is required', 400);
    if (!data.slot_id)     throw new AppError('slot_id is required', 400);
    if (!data.term_id)     throw new AppError('term_id is required', 400);
    if (!data.day_of_week) throw new AppError('day_of_week is required (1=Mon to 5=Fri)', 400);
    if (!data.subject_name) throw new AppError('subject_name is required', 400);
    if (data.day_of_week < 1 || data.day_of_week > 5)
      throw new AppError('day_of_week must be between 1 (Monday) and 5 (Friday)', 400);

    const classConflict = await timetableRepository.checkClassConflict(
      schoolId, data.class_id, data.slot_id, data.day_of_week, data.term_id);
    if (classConflict)
      throw new AppError(`This class already has a subject on ${DAYS[data.day_of_week]} during this period`, 409);

    const teacherConflict = await timetableRepository.checkTeacherConflict(
      schoolId, data.staff_id, data.slot_id, data.day_of_week, data.term_id);
    if (teacherConflict)
      throw new AppError(`This teacher is already assigned to another class on ${DAYS[data.day_of_week]} during this period`, 409);

    return timetableRepository.createEntry(data, schoolId);
  }

  async getClassTimetable(schoolId, classId, termId) {
    if (!termId) throw new AppError('term_id is required', 400);
    const entries = await timetableRepository.getByClass(schoolId, classId, termId);
    return this._formatAsGrid(entries);
  }

  async getTeacherTimetable(schoolId, staffId, termId) {
    if (!termId) throw new AppError('term_id is required', 400);
    const entries = await timetableRepository.getByTeacher(schoolId, staffId, termId);
    return this._formatAsGrid(entries);
  }

  async updateEntry(schoolId, id, data) {
    const entry = await timetableRepository.getEntryById(schoolId, id);
    if (!entry) throw new AppError('Timetable entry not found', 404);
    if (data.staff_id && data.staff_id !== entry.staff_id) {
      const conflict = await timetableRepository.checkTeacherConflict(
        schoolId, data.staff_id, entry.slot_id, entry.day_of_week, entry.term_id, id);
      if (conflict)
        throw new AppError(`This teacher is already assigned to another class on ${DAYS[entry.day_of_week]} during this period`, 409);
    }
    return timetableRepository.updateEntry(schoolId, id, data);
  }

  async deleteEntry(schoolId, id) {
    const entry = await timetableRepository.getEntryById(schoolId, id);
    if (!entry) throw new AppError('Timetable entry not found', 404);
    return timetableRepository.deleteEntry(schoolId, id);
  }

  _formatAsGrid(entries) {
    const slots = [...new Map(entries.map(e => [e.slot_id, {
      id: e.slot_id, name: e.slot_name,
      start_time: e.start_time, end_time: e.end_time, sort_order: e.sort_order,
    }])).values()].sort((a, b) => a.sort_order - b.sort_order);

    const grid = {};
    for (let d = 1; d <= 5; d++) {
      grid[d] = { day: DAYS[d], slots: {} };
      slots.forEach(s => { grid[d].slots[s.id] = null; });
    }

    entries.forEach(e => {
      grid[e.day_of_week].slots[e.slot_id] = {
        id: e.id, subject_name: e.subject_name,
        teacher_name: e.teacher_name || null,
        teacher_id:   e.teacher_id || e.staff_id || null,
        class_name:   e.class_name || null,
      };
    });

    return { slots, grid };
  }
}

module.exports = new TimetableService();
