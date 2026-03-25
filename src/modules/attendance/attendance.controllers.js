/**
 * Attendance Controller
 * req.schoolId is set by the authenticate middleware and flows to every service call
 */

const attendanceService = require('./attendance.service');

const markAttendance = async (req, res, next) => {
  try {
    const { student_id, class_id, date, status, remarks } = req.body;

    if (!student_id || !class_id || !date || !status) {
      return res.status(400).json({
        success: false,
        message: 'student_id, class_id, date, and status are required'
      });
    }

    const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: PRESENT, ABSENT, LATE, EXCUSED'
      });
    }

    const attendance = await attendanceService.markAttendance(
      { student_id, class_id, date, status, remarks, marked_by: req.user.userId },
      req.schoolId   // ← was missing
    );

    res.status(201).json({ success: true, message: 'Attendance marked successfully', data: attendance });
  } catch (error) {
    next(error);
  }
};

const bulkMarkAttendance = async (req, res, next) => {
  try {
    const { attendance_records } = req.body;

    if (!attendance_records || !Array.isArray(attendance_records)) {
      return res.status(400).json({ success: false, message: 'attendance_records array is required' });
    }

    const results = await attendanceService.bulkMarkAttendance(
      attendance_records,
      req.user.userId,
      req.schoolId   // ← was missing
    );

    res.status(201).json({
      success: true,
      message: `Attendance marked for ${results.length} student(s)`,
      data: { count: results.length, records: results }
    });
  } catch (error) {
    next(error);
  }
};

const markClassAttendance = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { date, student_statuses } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: 'date is required' });
    }
    if (!student_statuses || typeof student_statuses !== 'object') {
      return res.status(400).json({ success: false, message: 'student_statuses object is required' });
    }

    const results = await attendanceService.markClassAttendance(
      parseInt(classId),
      date,
      student_statuses,
      req.user.userId,
      req.schoolId   // ← was missing
    );

    res.status(201).json({
      success: true,
      message: 'Class attendance marked successfully',
      data: { count: results.length, records: results }
    });
  } catch (error) {
    next(error);
  }
};

const getAttendance = async (req, res, next) => {
  try {
    const { student_id, class_id, date, start_date, end_date, status, page, limit } = req.query;

    const result = await attendanceService.getAttendance(
      {
        student_id: student_id ? parseInt(student_id) : undefined,
        class_id:   class_id   ? parseInt(class_id)   : undefined,
        date,
        start_date,
        end_date,
        status,
        page:  page  ? parseInt(page)  : 1,
        limit: limit ? parseInt(limit) : 50,
      },
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: result.records, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
};

const getAttendanceById = async (req, res, next) => {
  try {
    const attendance = await attendanceService.getAttendanceById(
      parseInt(req.params.id),
      req.schoolId   // ← was missing
    );
    res.status(200).json({ success: true, data: attendance });
  } catch (error) {
    if (error.message === 'Attendance record not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const getStudentAttendanceStats = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'start_date and end_date are required' });
    }

    const stats = await attendanceService.getStudentAttendanceStats(
      parseInt(studentId),
      start_date,
      end_date,
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const getClassAttendanceByDate = async (req, res, next) => {
  try {
    const { classId, date } = req.params;

    const result = await attendanceService.getClassAttendanceByDate(
      parseInt(classId),
      date,
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getClassAttendanceStats = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'start_date and end_date are required' });
    }

    const stats = await attendanceService.getClassAttendanceStats(
      parseInt(classId),
      start_date,
      end_date,
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

const getAbsentStudents = async (req, res, next) => {
  try {
    const { classId, date } = req.params;

    const result = await attendanceService.getAbsentStudents(
      parseInt(classId),
      date,
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getSchoolAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getSchoolAttendance(
      req.params.date,
      req.schoolId   // ← was missing
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const getLowAttendanceStudents = async (req, res, next) => {
  try {
    const { threshold, start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'start_date and end_date are required' });
    }

    const result = await attendanceService.getLowAttendanceStudents(
      start_date,
      end_date,
      threshold ? parseFloat(threshold) : 75,
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const updateAttendance = async (req, res, next) => {
  try {
    const { status, remarks } = req.body;

    const updated = await attendanceService.updateAttendance(
      parseInt(req.params.id),
      { status, remarks },
      req.schoolId   // ← was missing
    );

    res.status(200).json({ success: true, message: 'Attendance updated successfully', data: updated });
  } catch (error) {
    if (error.message === 'Attendance record not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

const deleteAttendance = async (req, res, next) => {
  try {
    await attendanceService.deleteAttendance(
      parseInt(req.params.id),
      req.schoolId   // ← was missing
    );
    res.status(200).json({ success: true, message: 'Attendance record deleted successfully' });
  } catch (error) {
    if (error.message === 'Attendance record not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

module.exports = {
  markAttendance,
  bulkMarkAttendance,
  markClassAttendance,
  getAttendance,
  getAttendanceById,
  getStudentAttendanceStats,
  getClassAttendanceByDate,
  getClassAttendanceStats,
  getAbsentStudents,
  getSchoolAttendance,
  getLowAttendanceStudents,
  updateAttendance,
  deleteAttendance
};