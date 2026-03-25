/**
 * Exams Repository
 * Multitenancy: schoolId passed explicitly on every method.
 * All queries use db.schoolQuery / db.schoolQueryOne / db.withSchoolContext
 * so RLS session context is always set — never db.query on tenant tables.
 */

const db = require('../../shared/database/client');

class ExamsRepository {
  /* ========================================================================
     EXAMS CRUD
     ======================================================================== */

  async create(examData, schoolId) {
    return db.schoolQueryOne(schoolId,
      `INSERT INTO exams (name, term_id, exam_type, class_id, status, school_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        examData.name,
        examData.term_id,
        examData.exam_type,
        examData.class_id  || null,
        examData.status    || 'DRAFT',
        schoolId,
      ]
    );
  }

  async findAll(schoolId, filters = {}) {
    let query = `
      SELECT
        e.*,
        e.class_id,
        c.name                              AS class_name,
        at.year || ' Term ' || at.term      AS term_name,
        at.year                             AS term_year,
        at.term                             AS term_number,
        u.username                          AS published_by_username,
        COUNT(DISTINCT es.id)               AS subject_count,
        COUNT(DISTINCT er.id)               AS result_count
      FROM exams e
      LEFT JOIN classes          c  ON e.class_id  = c.id
      LEFT JOIN academic_terms   at ON e.term_id   = at.id
      LEFT JOIN users            u  ON e.published_by = u.id
      LEFT JOIN exam_subjects    es ON e.id = es.exam_id
      LEFT JOIN exam_results     er ON e.id = er.exam_id
    `;

    const conditions = [];
    const values     = [];
    let   p          = 1;

    if (filters.term_id) {
      conditions.push(`e.term_id = $${p++}`);
      values.push(filters.term_id);
    }
    if (filters.exam_type) {
      conditions.push(`e.exam_type = $${p++}`);
      values.push(filters.exam_type);
    }
    if (filters.status) {
      conditions.push(`e.status = $${p++}`);
      values.push(filters.status);
    }
    if (filters.class_id) {
      conditions.push(`e.class_id = $${p++}`);
      values.push(filters.class_id);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    query += ' GROUP BY e.id, c.id, at.id, u.id ORDER BY e.created_at DESC';

    const rows = await db.schoolQuery(schoolId, query, values);
    return rows;
  }

  async findById(id, schoolId) {
    return db.schoolQueryOne(schoolId,
      `SELECT
         e.*,
         e.class_id,
         c.name                             AS class_name,
         at.year || ' Term ' || at.term     AS term_name,
         at.year                            AS term_year,
         at.term                            AS term_number,
         at.start_date                      AS term_start_date,
         at.end_date                        AS term_end_date,
         u.username                         AS published_by_username,
         COUNT(DISTINCT es.id)              AS subject_count,
         COUNT(DISTINCT er.student_id)      AS students_count
       FROM exams e
       LEFT JOIN classes         c  ON e.class_id  = c.id
       LEFT JOIN academic_terms  at ON e.term_id   = at.id
       LEFT JOIN users           u  ON e.published_by = u.id
       LEFT JOIN exam_subjects   es ON e.id = es.exam_id
       LEFT JOIN exam_results    er ON e.id = er.exam_id
       WHERE e.id = $1
       GROUP BY e.id, c.id, at.id, u.id`,
      [id]
    );
  }

  async update(id, examData, schoolId) {
    const fields = [];
    const values = [];
    let   p      = 1;

    const allowed = ['name', 'term_id', 'exam_type', 'class_id', 'status'];
    allowed.forEach(key => {
      if (examData[key] !== undefined) {
        fields.push(`${key} = $${p++}`);
        values.push(examData[key]);
      }
    });

    if (!fields.length) return null;

    values.push(id);
    return db.schoolQueryOne(schoolId,
      `UPDATE exams SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
  }

  async publish(examId, userId, schoolId) {
    return db.schoolQueryOne(schoolId,
      `UPDATE exams
       SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, published_by = $1
       WHERE id = $2
       RETURNING *`,
      [userId, examId]
    );
  }

  async archive(examId, schoolId) {
    return db.schoolQueryOne(schoolId,
      `UPDATE exams SET status = 'ARCHIVED' WHERE id = $1 RETURNING *`,
      [examId]
    );
  }

  async delete(id, schoolId) {
    return db.schoolQueryOne(schoolId,
      `DELETE FROM exams WHERE id = $1 RETURNING *`,
      [id]
    );
  }

  /* ========================================================================
     EXAM SUBJECTS
     ======================================================================== */

  async addSubject(examId, subjectData, schoolId) {
    return db.schoolQueryOne(schoolId,
      `INSERT INTO exam_subjects (exam_id, subject_name, max_marks, school_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [examId, subjectData.subject_name, subjectData.max_marks, schoolId]
    );
  }

  async getSubjects(examId, schoolId) {
    return db.schoolQuery(schoolId,
      `SELECT
         es.*,
         COUNT(er.id)   AS results_count,
         AVG(er.marks)  AS average_marks
       FROM exam_subjects es
       LEFT JOIN exam_results er ON es.id = er.subject_id
       WHERE es.exam_id = $1
       GROUP BY es.id
       ORDER BY es.subject_name ASC`,
      [examId]
    );
  }

  async updateSubject(subjectId, subjectData, schoolId) {
    const fields = [];
    const values = [];
    let   p      = 1;

    if (subjectData.subject_name !== undefined) { fields.push(`subject_name = $${p++}`); values.push(subjectData.subject_name); }
    if (subjectData.max_marks    !== undefined) { fields.push(`max_marks = $${p++}`);    values.push(subjectData.max_marks); }

    if (!fields.length) return null;

    values.push(subjectId);
    return db.schoolQueryOne(schoolId,
      `UPDATE exam_subjects SET ${fields.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );
  }

  async deleteSubject(subjectId, schoolId) {
    return db.schoolQueryOne(schoolId,
      `DELETE FROM exam_subjects WHERE id = $1 RETURNING *`,
      [subjectId]
    );
  }

  async findSubjectById(subjectId, schoolId) {
    return db.schoolQueryOne(schoolId,
      `SELECT * FROM exam_subjects WHERE id = $1`,
      [subjectId]
    );
  }

  /* ========================================================================
     EXAM RESULTS
     ======================================================================== */

  async upsertResult(resultData, schoolId) {
    return db.schoolQueryOne(schoolId,
      `INSERT INTO exam_results
         (exam_id, student_id, subject_id, marks, grade, remarks, school_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (exam_id, student_id, subject_id)
       DO UPDATE SET marks = $4, grade = $5, remarks = $6
       RETURNING *`,
      [
        resultData.exam_id,
        resultData.student_id,
        resultData.subject_id,
        resultData.marks,
        resultData.grade   || null,
        resultData.remarks || null,
        schoolId,
      ]
    );
  }

  async getResults(examId, schoolId, filters = {}) {
    let   query  = `
      SELECT
        er.*,
        s.first_name,
        s.last_name,
        s.admission_no,
        es.subject_name,
        es.max_marks,
        c.name AS class_name
      FROM exam_results er
      JOIN students      s  ON er.student_id = s.id
      JOIN exam_subjects es ON er.subject_id = es.id
      LEFT JOIN classes  c  ON s.class_id    = c.id
      WHERE er.exam_id = $1
    `;
    const values = [examId];
    let   p      = 2;

    if (filters.student_id) { query += ` AND er.student_id = $${p++}`; values.push(filters.student_id); }
    if (filters.subject_id) { query += ` AND er.subject_id = $${p++}`; values.push(filters.subject_id); }

    query += ' ORDER BY s.last_name, s.first_name, es.subject_name';

    return db.schoolQuery(schoolId, query, values);
  }

  async getStudentResults(examId, studentId, schoolId) {
    return db.schoolQuery(schoolId,
      `SELECT
         er.*,
         es.subject_name,
         es.max_marks,
         ROUND((er.marks / es.max_marks * 100)::numeric, 2) AS percentage
       FROM exam_results er
       JOIN exam_subjects es ON er.subject_id = es.id
       WHERE er.exam_id = $1 AND er.student_id = $2
       ORDER BY es.subject_name ASC`,
      [examId, studentId]
    );
  }

  async getExamStatistics(examId, schoolId) {
    return db.schoolQuery(schoolId,
      `SELECT
         es.subject_name,
         es.max_marks,
         COUNT(er.id)                                                  AS total_students,
         ROUND(AVG(er.marks)::numeric, 2)                             AS average_marks,
         ROUND(MIN(er.marks)::numeric, 2)                             AS min_marks,
         ROUND(MAX(er.marks)::numeric, 2)                             AS max_marks,
         ROUND((AVG(er.marks) / es.max_marks * 100)::numeric, 2)     AS average_percentage
       FROM exam_subjects es
       LEFT JOIN exam_results er ON es.id = er.subject_id
       WHERE es.exam_id = $1
       GROUP BY es.id, es.subject_name, es.max_marks
       ORDER BY es.subject_name ASC`,
      [examId]
    );
  }

  async deleteResult(resultId, schoolId) {
    return db.schoolQueryOne(schoolId,
      `DELETE FROM exam_results WHERE id = $1 RETURNING *`,
      [resultId]
    );
  }

  async hasResults(examId, schoolId) {
    const row = await db.schoolQueryOne(schoolId,
      `SELECT COUNT(*) AS count FROM exam_results WHERE exam_id = $1`,
      [examId]
    );
    return parseInt(row.count) > 0;
  }

  async bulkInsertResults(results, schoolId) {
    return db.withSchoolContext(schoolId, async (client) => {
      const values       = [];
      const valueClauses = [];
      let   p            = 1;

      results.forEach(r => {
        valueClauses.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6})`);
        values.push(r.exam_id, r.student_id, r.subject_id, r.marks, r.grade || null, r.remarks || null, schoolId);
        p += 7;
      });

      const res = await client.query(
        `INSERT INTO exam_results (exam_id, student_id, subject_id, marks, grade, remarks, school_id)
         VALUES ${valueClauses.join(', ')}
         ON CONFLICT (exam_id, student_id, subject_id)
         DO UPDATE SET marks = EXCLUDED.marks, grade = EXCLUDED.grade, remarks = EXCLUDED.remarks
         RETURNING *`,
        values
      );
      return res.rows;
    });
  }
}

module.exports = new ExamsRepository();