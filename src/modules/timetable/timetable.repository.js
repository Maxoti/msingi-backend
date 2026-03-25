const db = require('../../shared/database/client');

class TimetableRepository {

  async createSlot(data, schoolId) {
    return db.schoolQueryOne(schoolId,
      `INSERT INTO time_slots (school_id, name, start_time, end_time, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [schoolId, data.name, data.start_time, data.end_time, data.sort_order ?? 0]
    );
  }

  async getAllSlots(schoolId) {
    return db.schoolQuery(schoolId,
      `SELECT * FROM time_slots WHERE school_id = $1 ORDER BY sort_order ASC, start_time ASC`,
      [schoolId]
    );
  }

  async getSlotById(schoolId, id) {
    return db.schoolQueryOne(schoolId, `SELECT * FROM time_slots WHERE id = $1`, [id]);
  }

  async updateSlot(schoolId, id, data) {
    const fields = [], values = [];
    let p = 1;
    if (data.name       !== undefined) { fields.push(`name = $${p++}`);       values.push(data.name); }
    if (data.start_time !== undefined) { fields.push(`start_time = $${p++}`); values.push(data.start_time); }
    if (data.end_time   !== undefined) { fields.push(`end_time = $${p++}`);   values.push(data.end_time); }
    if (data.sort_order !== undefined) { fields.push(`sort_order = $${p++}`); values.push(data.sort_order); }
    if (!fields.length) return null;
    values.push(id);
    return db.schoolQueryOne(schoolId, `UPDATE time_slots SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`, values);
  }

  async deleteSlot(schoolId, id) {
    return db.schoolQueryOne(schoolId, `DELETE FROM time_slots WHERE id = $1 RETURNING *`, [id]);
  }

  async slotInUse(schoolId, id) {
    const row = await db.schoolQueryOne(schoolId,
      `SELECT COUNT(*) AS count FROM timetable_entries WHERE slot_id = $1`, [id]);
    return parseInt(row.count) > 0;
  }

  async createEntry(data, schoolId) {
    return db.schoolQueryOne(schoolId,
      `INSERT INTO timetable_entries (school_id, class_id, staff_id, slot_id, term_id, day_of_week, subject_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [schoolId, data.class_id, data.staff_id || null, data.slot_id, data.term_id, data.day_of_week, data.subject_name]
    );
  }

  async getEntryById(schoolId, id) {
    return db.schoolQueryOne(schoolId,
      `SELECT te.*, c.name AS class_name, ts.name AS slot_name, ts.start_time, ts.end_time,
              s.first_name || ' ' || s.last_name AS teacher_name,
              at.year || ' Term ' || at.term AS term_name
       FROM timetable_entries te
       JOIN classes c ON te.class_id = c.id
       JOIN time_slots ts ON te.slot_id = ts.id
       LEFT JOIN staff s ON te.staff_id = s.id
       JOIN academic_terms at ON te.term_id = at.id
       WHERE te.id = $1`, [id]
    );
  }

  async getByClass(schoolId, classId, termId) {
    return db.schoolQuery(schoolId,
      `SELECT te.*, ts.name AS slot_name, ts.start_time, ts.end_time, ts.sort_order,
              s.first_name || ' ' || s.last_name AS teacher_name, s.id AS teacher_id
       FROM timetable_entries te
       JOIN time_slots ts ON te.slot_id = ts.id
       LEFT JOIN staff s ON te.staff_id = s.id
       WHERE te.class_id = $1 AND te.term_id = $2
       ORDER BY te.day_of_week ASC, ts.sort_order ASC`,
      [classId, termId]
    );
  }

  async getByTeacher(schoolId, staffId, termId) {
    return db.schoolQuery(schoolId,
      `SELECT te.*, c.name AS class_name, ts.name AS slot_name, ts.start_time, ts.end_time, ts.sort_order
       FROM timetable_entries te
       JOIN classes c ON te.class_id = c.id
       JOIN time_slots ts ON te.slot_id = ts.id
       WHERE te.staff_id = $1 AND te.term_id = $2
       ORDER BY te.day_of_week ASC, ts.sort_order ASC`,
      [staffId, termId]
    );
  }

  async updateEntry(schoolId, id, data) {
    const fields = [], values = [];
    let p = 1;
    if (data.staff_id    !== undefined) { fields.push(`staff_id = $${p++}`);    values.push(data.staff_id); }
    if (data.subject_name !== undefined) { fields.push(`subject_name = $${p++}`); values.push(data.subject_name); }
    if (!fields.length) return null;
    values.push(id);
    return db.schoolQueryOne(schoolId, `UPDATE timetable_entries SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`, values);
  }

  async deleteEntry(schoolId, id) {
    return db.schoolQueryOne(schoolId, `DELETE FROM timetable_entries WHERE id = $1 RETURNING *`, [id]);
  }

  async checkClassConflict(schoolId, classId, slotId, dayOfWeek, termId, excludeId = null) {
    const q = `SELECT COUNT(*) AS count FROM timetable_entries
               WHERE class_id = $1 AND slot_id = $2 AND day_of_week = $3 AND term_id = $4
               ${excludeId ? `AND id != ${excludeId}` : ''}`;
    const row = await db.schoolQueryOne(schoolId, q, [classId, slotId, dayOfWeek, termId]);
    return parseInt(row.count) > 0;
  }

  async checkTeacherConflict(schoolId, staffId, slotId, dayOfWeek, termId, excludeId = null) {
    if (!staffId) return false;
    const q = `SELECT COUNT(*) AS count FROM timetable_entries
               WHERE staff_id = $1 AND slot_id = $2 AND day_of_week = $3 AND term_id = $4
               ${excludeId ? `AND id != ${excludeId}` : ''}`;
    const row = await db.schoolQueryOne(schoolId, q, [staffId, slotId, dayOfWeek, termId]);
    return parseInt(row.count) > 0;
  }
}

module.exports = new TimetableRepository();
