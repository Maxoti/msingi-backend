/**
 * Attendance Service
 * schoolId flows from controller through every method down to the repository
 */

const attendanceRepository = require('./attendance.repository');
const db = require('../../shared/database/client');

const markAttendance = async (attendanceData, schoolId) => {
  const { student_id, class_id, date, status, remarks, marked_by } = attendanceData;

  const errors = [];
  if (!student_id) errors.push('Student ID is required');
  if (!class_id)   errors.push('Class ID is required');
  if (!date)       errors.push('Date is required');
  if (!status)     errors.push('Status is required');
  if (!marked_by)  errors.push('Marked by user ID is required');

  const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  if (status && !validStatuses.includes(status)) {
    errors.push('Status must be PRESENT, ABSENT, LATE, or EXCUSED');
  }

  if (date) {
    const attendanceDate = new Date(date);
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }));
    if (isNaN(attendanceDate.getTime())) errors.push('Invalid date format');
    else if (attendanceDate > today)      errors.push('Cannot mark attendance for future dates');
  }

  if (errors.length > 0) throw new Error(errors.join(', '));

  // Validate student exists — uses schoolQueryOne so RLS is active
  const student = await db.schoolQueryOne(schoolId,
    'SELECT id, class_id FROM students WHERE id = $1', [student_id]
  );
  if (!student) throw new Error('Student not found');
  if (student.class_id !== class_id) throw new Error('Student does not belong to the specified class');

  return attendanceRepository.markAttendance(
    { student_id, class_id, date, status, remarks: remarks || null, marked_by },
    schoolId
  );
};

const bulkMarkAttendance = async (attendanceRecords, marked_by, schoolId) => {
  if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) {
    throw new Error('Attendance records array is required');
  }
  if (!marked_by) throw new Error('Marked by user ID is required');

  const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  for (const record of attendanceRecords) {
    if (!record.student_id) throw new Error('Student ID is required for all records');
    if (!record.class_id)   throw new Error('Class ID is required for all records');
    if (!record.date)       throw new Error('Date is required for all records');
    if (!record.status || !validStatuses.includes(record.status)) {
      throw new Error('Valid status is required for all records');
    }
    record.marked_by = marked_by;
  }

 // ✅ After — compare using Nairobi date
const date = new Date(attendanceRecords[0].date);
const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }));
if (date > today) throw new Error('Cannot mark attendance for future dates');

  return attendanceRepository.bulkMarkAttendance(attendanceRecords, schoolId);
};

const markClassAttendance = async (classId, date, studentStatuses, markedBy, schoolId) => {
  const attendanceRecords = Object.entries(studentStatuses).map(([studentId, status]) => ({
    student_id: parseInt(studentId),
    class_id:   classId,
    date,
    status,
    marked_by:  markedBy
  }));

  return attendanceRepository.bulkMarkAttendance(attendanceRecords, schoolId);
};

const getAttendance = async (filters, schoolId) => {
  return attendanceRepository.findAttendance(filters, schoolId);
};

const getAttendanceById = async (id, schoolId) => {
  const attendance = await attendanceRepository.findById(id, schoolId);
  if (!attendance) throw new Error('Attendance record not found');
  return attendance;
};

const getStudentAttendanceStats = async (studentId, startDate, endDate, schoolId) => {
  const stats = await attendanceRepository.getStudentAttendanceStats(studentId, startDate, endDate, schoolId);
  return {
    student_id:            studentId,
    start_date:            startDate,
    end_date:              endDate,
    total_days:            parseInt(stats.total_days)            || 0,
    present_count:         parseInt(stats.present_days)          || 0,
    absent_count:          parseInt(stats.absent_days)           || 0,
    late_count:            parseInt(stats.late_days)             || 0,
    excused_count:         parseInt(stats.excused_days)          || 0,
    attendance_percentage: parseFloat(stats.attendance_percentage) || 0
  };
};

const getStudentAttendance = async (student_id, start_date, end_date, schoolId) => {
  if (!student_id) throw new Error('Student ID is required');

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    end_date   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }

  const [records, stats] = await Promise.all([
    attendanceRepository.getStudentAttendance(student_id, start_date, end_date, schoolId),
    attendanceRepository.getStudentAttendanceStats(student_id, start_date, end_date, schoolId)
  ]);

  return {
    student_id, start_date, end_date,
    statistics: {
      total_days:            parseInt(stats.total_days   || 0),
      present_days:          parseInt(stats.present_days || 0),
      absent_days:           parseInt(stats.absent_days  || 0),
      late_days:             parseInt(stats.late_days    || 0),
      excused_days:          parseInt(stats.excused_days || 0),
      attendance_percentage: parseFloat(stats.attendance_percentage || 0)
    },
    records
  };
};

const getClassAttendanceByDate = async (class_id, date, schoolId) => {
  if (!class_id) throw new Error('Class ID is required');
  if (!date)     throw new Error('Date is required');

  const [records, allStudents] = await Promise.all([
    attendanceRepository.getClassAttendanceByDate( schoolId,class_id, date,),
    db.schoolQuery(schoolId,
      `SELECT id, first_name || ' ' || last_name AS student_name, admission_no
       FROM students WHERE class_id = $1 AND is_active = TRUE ORDER BY admission_no`,
      [class_id]
    )
  ]);

  const markedMap = Object.fromEntries(records.map(r => [r.student_id, r]));

  const students = allStudents.map(s =>
    markedMap[s.id] ?? {
      student_id: s.id, student_name: s.student_name,
      admission_no: s.admission_no, class_id, date, status: null, remarks: null
    }
  );

  return {
    class_id, date,
    total_students:  allStudents.length,
    marked_count:    records.length,
    unmarked_count:  allStudents.length - records.length,
    present_count:   records.filter(r => r.status === 'PRESENT').length,
    absent_count:    records.filter(r => r.status === 'ABSENT').length,
    late_count:      records.filter(r => r.status === 'LATE').length,
    excused_count:   records.filter(r => r.status === 'EXCUSED').length,
    students
  };
};

const getClassAttendanceStats = async (class_id, start_date, end_date, schoolId) => {
  if (!class_id) throw new Error('Class ID is required');

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    end_date   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }

  return db.withSchoolContext(schoolId, async (client) => {
    const [totalRes, dailyRes] = await Promise.all([
      client.query(
        `SELECT COUNT(*) AS total FROM students WHERE class_id = $1 AND is_active = TRUE`,
        [class_id]
      ),
      client.query(
        `SELECT
           a.date,
           COUNT(a.id)                                    AS marked_count,
           COUNT(a.id) FILTER (WHERE a.status='PRESENT')  AS present_count,
           COUNT(a.id) FILTER (WHERE a.status='ABSENT')   AS absent_count,
           COUNT(a.id) FILTER (WHERE a.status='LATE')     AS late_count,
           COUNT(a.id) FILTER (WHERE a.status='EXCUSED')  AS excused_count
         FROM attendance a
         WHERE a.class_id = $1 AND a.date BETWEEN $2 AND $3
         GROUP BY a.date ORDER BY a.date`,
        [class_id, start_date, end_date]
      )
    ]);

    const totalStudents = parseInt(totalRes.rows[0].total || 0);
    return dailyRes.rows.map(row => ({
      date:            row.date,
      class_id,
      total_students:  totalStudents,
      marked_count:    parseInt(row.marked_count),
      present_count:   parseInt(row.present_count),
      absent_count:    parseInt(row.absent_count),
      late_count:      parseInt(row.late_count),
      excused_count:   parseInt(row.excused_count),
      unmarked_count:  totalStudents - parseInt(row.marked_count),
      attendance_rate: totalStudents > 0
        ? parseFloat(((parseInt(row.present_count) / totalStudents) * 100).toFixed(2))
        : 0
    }));
  });
};

const getClassAttendanceSummary = async (class_id, start_date, end_date, schoolId) => {
  if (!class_id) throw new Error('Class ID is required');

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    end_date   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }

  const stats = await attendanceRepository.getClassAttendanceStats(class_id, start_date, end_date, schoolId);
  return {
    class_id, start_date, end_date,
    total_students:               parseInt(stats.total_students               || 0),
    total_days:                   parseInt(stats.total_days                   || 0),
    total_records:                parseInt(stats.total_records                || 0),
    present_count:                parseInt(stats.present_count                || 0),
    absent_count:                 parseInt(stats.absent_count                 || 0),
    late_count:                   parseInt(stats.late_count                   || 0),
    excused_count:                parseInt(stats.excused_count                || 0),
    overall_attendance_percentage: parseFloat(stats.overall_attendance_percentage || 0)
  };
};

const getAbsentStudents = async (classId, date, schoolId) => {
  return db.schoolQuery(schoolId,
    `SELECT
       s.id AS student_id,
       s.first_name || ' ' || s.last_name AS student_name,
       s.admission_no,
       a.status,
       a.remarks
     FROM students s
     LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $2
     WHERE s.class_id = $1
       AND s.is_active = TRUE
       AND (a.status = 'ABSENT' OR a.status IS NULL)
     ORDER BY s.admission_no`,
    [classId, date]
  );
};

const getSchoolAttendance = async (date, schoolId) => {
  return db.withSchoolContext(schoolId, async (client) => {
    const [summary, classes] = await Promise.all([
      client.query(
        `SELECT
           COUNT(DISTINCT s.id)                                              AS total_students,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'PRESENT')         AS present_count,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ABSENT')          AS absent_count,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'LATE')            AS late_count,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'EXCUSED')         AS excused_count
         FROM students s
         LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1
         WHERE s.is_active = TRUE`,
        [date]
      ),
      client.query(
        `SELECT
           c.id AS class_id, c.name AS class_name,
           COUNT(DISTINCT s.id)                                              AS total_students,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'PRESENT')         AS present_count,
           COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ABSENT')          AS absent_count,
           ROUND(
             COUNT(DISTINCT a.id) FILTER (WHERE a.status='PRESENT')::DECIMAL
             / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 2
           )                                                                 AS attendance_percentage
         FROM classes c
         LEFT JOIN students s  ON c.id = s.class_id AND s.is_active = TRUE
         LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1
         GROUP BY c.id, c.name ORDER BY c.name`,
        [date]
      )
    ]);

    const s = summary.rows[0];
    return {
      date,
      summary: {
        total_students: parseInt(s.total_students) || 0,
        present_count:  parseInt(s.present_count)  || 0,
        absent_count:   parseInt(s.absent_count)   || 0,
        late_count:     parseInt(s.late_count)     || 0,
        excused_count:  parseInt(s.excused_count)  || 0,
      },
      classes: classes.rows
    };
  });
};

const getLowAttendanceStudents = async (startDate, endDate, threshold = 75, schoolId) => {
  return db.schoolQuery(schoolId,
    `SELECT
       s.id AS student_id,
       s.first_name || ' ' || s.last_name AS student_name,
       s.admission_no,
       c.name AS class_name,
       COUNT(*)                                               AS total_days,
       COUNT(*) FILTER (WHERE a.status = 'PRESENT')          AS present_days,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT')           AS absent_days,
       ROUND(
         COUNT(*) FILTER (WHERE a.status = 'PRESENT')::DECIMAL
         / NULLIF(COUNT(*), 0) * 100, 2
       )                                                      AS attendance_percentage
     FROM students s
     JOIN classes c ON s.class_id = c.id
     LEFT JOIN attendance a ON s.id = a.student_id AND a.date BETWEEN $1 AND $2
     WHERE s.is_active = TRUE
     GROUP BY s.id, s.first_name, s.last_name, s.admission_no, c.name
     HAVING ROUND(
       COUNT(*) FILTER (WHERE a.status = 'PRESENT')::DECIMAL
       / NULLIF(COUNT(*), 0) * 100, 2
     ) < $3
     ORDER BY attendance_percentage ASC`,
    [startDate, endDate, threshold]
  );
};

const getAttendanceDefaulters = async (class_id, start_date, end_date, threshold = 75, schoolId) => {
  if (!class_id) throw new Error('Class ID is required');

  if (!start_date || !end_date) {
    const now = new Date();
    start_date = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    end_date   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  }

  const defaulters = await attendanceRepository.getAttendanceDefaulters(
    class_id, start_date, end_date, threshold, schoolId
  );
  return { class_id, start_date, end_date, threshold, total_defaulters: defaulters.length, defaulters };
};

const updateAttendance = async (id, updates, schoolId) => {
  const { status, remarks } = updates;

  const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
  if (status && !validStatuses.includes(status)) {
    throw new Error('Status must be PRESENT, ABSENT, LATE, or EXCUSED');
  }

  const existing = await attendanceRepository.findById(id, schoolId);
  if (!existing) throw new Error('Attendance record not found');

  return attendanceRepository.updateAttendance(id, { status, remarks }, schoolId);
};

const deleteAttendance = async (id, schoolId) => {
  const existing = await attendanceRepository.findById(id, schoolId);
  if (!existing) throw new Error('Attendance record not found');
  return attendanceRepository.deleteAttendance(id, schoolId);
};

const getAttendanceSummaryReport = async (filters, schoolId) => {
  const { class_id, start_date, end_date } = filters;
  if (!class_id || !start_date || !end_date) {
    throw new Error('Class ID, start date, and end date are required');
  }

  const [classStats, defaulters, dailySummary] = await Promise.all([
    getClassAttendanceSummary(class_id, start_date, end_date, schoolId),
    getAttendanceDefaulters(class_id, start_date, end_date, 75, schoolId),
    db.schoolQuery(schoolId,
      `SELECT
         date,
         COUNT(*)                                              AS total_marked,
         COUNT(*) FILTER (WHERE status = 'PRESENT')           AS present,
         COUNT(*) FILTER (WHERE status = 'ABSENT')            AS absent,
         COUNT(*) FILTER (WHERE status = 'LATE')              AS late,
         COUNT(*) FILTER (WHERE status = 'EXCUSED')           AS excused,
         ROUND(
           COUNT(*) FILTER (WHERE status = 'PRESENT')::DECIMAL
           / NULLIF(COUNT(*), 0) * 100, 2
         )                                                     AS daily_percentage
       FROM attendance
       WHERE class_id = $1 AND date BETWEEN $2 AND $3
       GROUP BY date ORDER BY date DESC`,
      [class_id, start_date, end_date]
    )
  ]);

  return { class_statistics: classStats, daily_summary: dailySummary, low_attendance_students: defaulters };
};

module.exports = {
  markAttendance,
  bulkMarkAttendance,
  markClassAttendance,
  getAttendance,
  getAttendanceById,
  getStudentAttendanceStats,
  getStudentAttendance,
  getClassAttendanceByDate,
  getClassAttendanceStats,
  getClassAttendanceSummary,
  getAbsentStudents,
  getSchoolAttendance,
  getLowAttendanceStudents,
  getAttendanceDefaulters,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummaryReport
};