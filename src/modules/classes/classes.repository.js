/**
 * Classes Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
const db = require('../../shared/database/client');

class ClassesRepository {

  async create(classData, schoolId) {
    return db.queryOne(
      `INSERT INTO classes (name, grade_level, class_teacher_id, capacity, school_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [classData.name, classData.grade_level, classData.class_teacher_id || null, classData.capacity, schoolId]
    );
  }

  async findAll(schoolId, filters = {}) {
    const conditions = ['c.school_id = $1'];
    const values     = [schoolId];
    let   p          = 1;

    if (filters.grade_level)      { conditions.push(`c.grade_level = $${++p}`);      values.push(filters.grade_level); }
    if (filters.class_teacher_id) { conditions.push(`c.class_teacher_id = $${++p}`); values.push(filters.class_teacher_id); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    return db.queryAll(
      `SELECT c.*,
         s.first_name AS teacher_first_name, s.last_name AS teacher_last_name,
         s.email AS teacher_email,
         COUNT(DISTINCT st.id) AS student_count
       FROM classes c
       LEFT JOIN staff s     ON c.class_teacher_id = s.id
       LEFT JOIN students st ON st.class_id = c.id AND st.is_active = true
       ${where}
       GROUP BY c.id, s.id
       ORDER BY c.grade_level ASC, c.name ASC`,
      values
    );
  }

  async findById(schoolId, id) {
    return db.queryOne(
      `SELECT c.*,
         s.first_name AS teacher_first_name, s.last_name AS teacher_last_name,
         s.email AS teacher_email, s.phone AS teacher_phone,
         COUNT(DISTINCT st.id) AS student_count
       FROM classes c
       LEFT JOIN staff s     ON c.class_teacher_id = s.id
       LEFT JOIN students st ON st.class_id = c.id AND st.is_active = true
       WHERE c.id = $1 AND c.school_id = $2
       GROUP BY c.id, s.id`,
      [id, schoolId]
    );
  }

  async findByName(schoolId, name) {
    return db.queryOne(
      `SELECT * FROM classes WHERE name = $1 AND school_id = $2`,
      [name, schoolId]
    );
  }

  async update(schoolId, id, classData) {
    const fields = []; const values = []; let p = 0;
    if (classData.name !== undefined)            { fields.push(`name = $${++p}`);             values.push(classData.name); }
    if (classData.grade_level !== undefined)      { fields.push(`grade_level = $${++p}`);      values.push(classData.grade_level); }
    if (classData.class_teacher_id !== undefined) { fields.push(`class_teacher_id = $${++p}`); values.push(classData.class_teacher_id); }
    if (classData.capacity !== undefined)         { fields.push(`capacity = $${++p}`);         values.push(classData.capacity); }
    if (fields.length === 0) return null;
    values.push(id, schoolId);
    return db.queryOne(
      `UPDATE classes SET ${fields.join(', ')} WHERE id = $${p+1} AND school_id = $${p+2} RETURNING *`,
      values
    );
  }

  async delete(schoolId, id) {
    return db.queryOne(
      `DELETE FROM classes WHERE id = $1 AND school_id = $2 RETURNING *`,
      [id, schoolId]
    );
  }

  async getStudents(schoolId, classId) {
    return db.queryAll(
      `SELECT s.* FROM students s
       WHERE s.class_id = $1 AND s.school_id = $2 AND s.is_active = true
       ORDER BY s.last_name, s.first_name`,
      [classId, schoolId]
    );
  }

  async hasStudents(schoolId, classId) {
    const r = await db.queryOne(
      `SELECT COUNT(*) AS count FROM students
       WHERE class_id = $1 AND school_id = $2 AND is_active = true`,
      [classId, schoolId]
    );
    return parseInt(r.count) > 0;
  }

  async getCapacityStatus(schoolId, classId) {
    return db.queryOne(
      `SELECT c.capacity,
         COUNT(s.id)                    AS current_students,
         c.capacity - COUNT(s.id)       AS available_slots
       FROM classes c
       LEFT JOIN students s ON c.id = s.class_id AND s.school_id = $2 AND s.is_active = true
       WHERE c.id = $1 AND c.school_id = $2
       GROUP BY c.id`,
      [classId, schoolId]
    );
  }

  async assignTeacher(schoolId, classId, teacherId) {
    return db.queryOne(
      `UPDATE classes SET class_teacher_id = $1 WHERE id = $2 AND school_id = $3 RETURNING *`,
      [teacherId, classId, schoolId]
    );
  }

  async removeTeacher(schoolId, classId) {
    return db.queryOne(
      `UPDATE classes SET class_teacher_id = NULL WHERE id = $1 AND school_id = $2 RETURNING *`,
      [classId, schoolId]
    );
  }

  async findByTeacher(schoolId, teacherId) {
    return db.queryAll(
      `SELECT c.*, COUNT(DISTINCT s.id) AS student_count
       FROM classes c
       LEFT JOIN students s ON c.id = s.class_id AND s.is_active = true
       WHERE c.class_teacher_id = $1 AND c.school_id = $2
       GROUP BY c.id
       ORDER BY c.name ASC`,
      [teacherId, schoolId]
    );
  }
}

module.exports = new ClassesRepository();