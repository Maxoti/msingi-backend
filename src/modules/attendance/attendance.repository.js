/**
 * Attendance Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */
const db = require('../../shared/database/client');

const markAttendance = async ({ student_id, class_id, date, status, remarks, marked_by }, schoolId) =>
  db.queryOne(
    `INSERT INTO attendance (student_id,class_id,date,status,remarks,marked_by,school_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (student_id,date) DO UPDATE SET status=EXCLUDED.status,remarks=EXCLUDED.remarks,marked_by=EXCLUDED.marked_by
     RETURNING id,student_id,class_id,date,status,remarks,marked_by,school_id,created_at`,
    [student_id, class_id, date, status, remarks??null, marked_by, schoolId]
  );

const bulkMarkAttendance = async (records, schoolId) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const results = [];
    for (const r of records) {
      const res = await client.query(
        `INSERT INTO attendance (student_id,class_id,date,status,remarks,marked_by,school_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (student_id,date) DO UPDATE SET status=EXCLUDED.status,remarks=EXCLUDED.remarks,marked_by=EXCLUDED.marked_by
         RETURNING *`,
        [r.student_id, r.class_id, r.date, r.status, r.remarks??null, r.marked_by??null, schoolId]
      );
      results.push(res.rows[0]);
    }
    await client.query('COMMIT');
    return results;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

const findAttendance = async (filters = {}, schoolId) => {
  const { student_id, class_id, date, start_date, end_date, status, page=1, limit=50 } = filters;
  const conditions = ['a.school_id = $1'];
  const params = [schoolId];
  let p = 1;

  if (student_id) { conditions.push(`a.student_id=$${++p}`); params.push(student_id); }
  if (class_id)   { conditions.push(`a.class_id=$${++p}`);   params.push(class_id); }
  if (date)       { conditions.push(`a.date=$${++p}`);        params.push(date); }
  if (start_date) { conditions.push(`a.date>=$${++p}`);       params.push(start_date); }
  if (end_date)   { conditions.push(`a.date<=$${++p}`);       params.push(end_date); }
  if (status)     { conditions.push(`a.status=$${++p}`);      params.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const offset = (page-1)*limit;

  const [records, cr] = await Promise.all([
    db.queryAll(
      `SELECT a.*, s.first_name||' '||s.last_name AS student_name, s.admission_no,
       c.name AS class_name, u.username AS marked_by_name
       FROM attendance a LEFT JOIN students s ON a.student_id=s.id
       LEFT JOIN classes c ON a.class_id=c.id LEFT JOIN users u ON a.marked_by=u.id
       ${where} ORDER BY a.date DESC, a.id DESC LIMIT $${++p} OFFSET $${++p}`,
      [...params, limit, offset]
    ),
    db.queryOne(`SELECT COUNT(*) AS total FROM attendance a ${where}`, params),
  ]);

  const total = parseInt(cr.total);
  return { records, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } };
};

const findById = (schoolId, id) =>
  db.queryOne(
    `SELECT a.*, s.first_name||' '||s.last_name AS student_name, s.admission_no,
     c.name AS class_name, u.username AS marked_by_name
     FROM attendance a LEFT JOIN students s ON a.student_id=s.id
     LEFT JOIN classes c ON a.class_id=c.id LEFT JOIN users u ON a.marked_by=u.id
     WHERE a.id=$1 AND a.school_id=$2`,
    [id, schoolId]
  );

const getStudentAttendance = (schoolId, student_id, start_date, end_date) =>
  db.queryAll(
    `SELECT a.*, c.name AS class_name FROM attendance a LEFT JOIN classes c ON a.class_id=c.id
     WHERE a.student_id=$1 AND a.school_id=$2 AND a.date BETWEEN $3 AND $4 ORDER BY a.date DESC`,
    [student_id, schoolId, start_date, end_date]
  );

const getClassAttendanceByDate = (schoolId, class_id, date) =>
  db.queryAll(
    `SELECT a.*, s.first_name||' '||s.last_name AS student_name, s.admission_no
     FROM attendance a JOIN students s ON a.student_id=s.id
     WHERE a.class_id=$1 AND a.date=$2 AND a.school_id=$3 ORDER BY s.admission_no`,
    [class_id, date, schoolId]
  );

const getStudentAttendanceStats = (schoolId, student_id, start_date, end_date) =>
  db.queryOne(
    `SELECT COUNT(*) AS total_days,
     COUNT(*) FILTER (WHERE status='PRESENT') AS present_days,
     COUNT(*) FILTER (WHERE status='ABSENT')  AS absent_days,
     COUNT(*) FILTER (WHERE status='LATE')    AS late_days,
     COUNT(*) FILTER (WHERE status='EXCUSED') AS excused_days,
     ROUND(COUNT(*) FILTER (WHERE status='PRESENT')::DECIMAL/NULLIF(COUNT(*),0)*100,2) AS attendance_percentage
     FROM attendance WHERE student_id=$1 AND school_id=$2 AND date BETWEEN $3 AND $4`,
    [student_id, schoolId, start_date, end_date]
  );

const getClassAttendanceStats = (schoolId, class_id, start_date, end_date) =>
  db.queryOne(
    `SELECT COUNT(DISTINCT student_id) AS total_students, COUNT(DISTINCT date) AS total_days,
     COUNT(*) AS total_records,
     COUNT(*) FILTER (WHERE status='PRESENT') AS present_count,
     COUNT(*) FILTER (WHERE status='ABSENT')  AS absent_count,
     COUNT(*) FILTER (WHERE status='LATE')    AS late_count,
     COUNT(*) FILTER (WHERE status='EXCUSED') AS excused_count,
     ROUND(COUNT(*) FILTER (WHERE status='PRESENT')::DECIMAL/NULLIF(COUNT(*),0)*100,2) AS overall_attendance_percentage
     FROM attendance WHERE class_id=$1 AND school_id=$2 AND date BETWEEN $3 AND $4`,
    [class_id, schoolId, start_date, end_date]
  );

const getAttendanceDefaulters = (schoolId, class_id, start_date, end_date, threshold=75) =>
  db.queryAll(
    `SELECT s.id AS student_id, s.first_name||' '||s.last_name AS student_name, s.admission_no,
     COUNT(*) AS total_days, COUNT(*) FILTER (WHERE a.status='PRESENT') AS present_days,
     COUNT(*) FILTER (WHERE a.status='ABSENT') AS absent_days,
     ROUND(COUNT(*) FILTER (WHERE a.status='PRESENT')::DECIMAL/NULLIF(COUNT(*),0)*100,2) AS attendance_percentage
     FROM students s LEFT JOIN attendance a ON s.id=a.student_id AND a.school_id=$1 AND a.date BETWEEN $3 AND $4
     WHERE s.class_id=$2 AND s.school_id=$1 AND s.is_active=TRUE
     GROUP BY s.id,s.first_name,s.last_name,s.admission_no
     HAVING ROUND(COUNT(*) FILTER (WHERE a.status='PRESENT')::DECIMAL/NULLIF(COUNT(*),0)*100,2) < $5
     ORDER BY attendance_percentage ASC`,
    [schoolId, class_id, start_date, end_date, threshold]
  );

const updateAttendance = (schoolId, id, updates) =>
  db.queryOne(
    `UPDATE attendance SET status=COALESCE($2,status), remarks=COALESCE($3,remarks)
     WHERE id=$1 AND school_id=$4 RETURNING *`,
    [id, updates.status??null, updates.remarks??null, schoolId]
  );

const deleteAttendance = (schoolId, id) =>
  db.queryOne('DELETE FROM attendance WHERE id=$1 AND school_id=$2 RETURNING *', [id, schoolId]);

module.exports = {
  markAttendance, bulkMarkAttendance, findAttendance, findById,
  getStudentAttendance, getClassAttendanceByDate, getStudentAttendanceStats,
  getClassAttendanceStats, getAttendanceDefaulters, updateAttendance, deleteAttendance,
};