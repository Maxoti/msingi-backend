/**
 * Students Controller
 * Handles HTTP requests and responses for student management
 * req.schoolId is passed to every service call for multi-tenancy
 */

const studentsService = require('./students.service');

const createStudent = async (req, res, next) => {
  try {
    const student = await studentsService.createStudent(req.body, req.schoolId);
    res.status(201).json({ success: true, message: 'Student created successfully', data: student });
  } catch (error) { next(error); }
};

const getAllStudents = async (req, res, next) => {
  try {
    const {
      class_id, classId, status, gender, residence_type, is_active,
      search, page, limit, sort_by, sort_order, minAge, maxAge, admittedFrom, admittedTo
    } = req.query;

    const filters = {
      class_id:      class_id || classId ? parseInt(class_id || classId) : undefined,
      status, gender, residence_type,
      is_active:     is_active !== undefined ? is_active === 'true' : undefined,
      search,
      page:          page  ? parseInt(page)  : 1,
      limit:         limit ? parseInt(limit) : 50,
      sort_by, sort_order,
      minAge:        minAge ? parseInt(minAge) : undefined,
      maxAge:        maxAge ? parseInt(maxAge) : undefined,
      admittedFrom, admittedTo
    };
    console.log('[STUDENTS] req.schoolId =', req.schoolId, typeof req.schoolId);

    const result = await studentsService.getAllStudents(req.schoolId, filters);
    res.status(200).json({ success: true, data: result.students, pagination: result.pagination });
  } catch (error) { next(error); }
};

const getStudentById = async (req, res, next) => {
  try {
    const student = await studentsService.getStudentById(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, data: student });
  } catch (error) { next(error); }
};

const getStudentByAdmissionNo = async (req, res, next) => {
  try {
    const student = await studentsService.getStudentByAdmissionNo(req.schoolId, req.params.admission_no);
    res.status(200).json({ success: true, data: student });
  } catch (error) { next(error); }
};

const getStudentsByClass = async (req, res, next) => {
  try {
    const { is_active, status } = req.query;
    const filters = {
      is_active: is_active !== undefined ? is_active === 'true' : true,
      status:    status || 'ACTIVE'
    };
    const students = await studentsService.getStudentsByClass(req.schoolId, parseInt(req.params.class_id), filters);
    res.status(200).json({ success: true, data: students });
  } catch (error) { next(error); }
};

const updateStudent = async (req, res, next) => {
  try {
    const student = await studentsService.updateStudent(req.schoolId, parseInt(req.params.id), req.body);
    res.status(200).json({ success: true, message: 'Student updated successfully', data: student });
  } catch (error) { next(error); }
};

const deleteStudent = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    if (!userRole || !['ADMIN','SUPER_ADMIN'].includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Only administrators can delete students' });
    }
    const { hard_delete } = req.query;
    const student = await studentsService.deleteStudent(req.schoolId, parseInt(req.params.id), hard_delete === 'true');
    res.status(200).json({
      success: true,
      message: hard_delete === 'true' ? 'Student permanently deleted' : 'Student deactivated successfully',
      data: student
    });
  } catch (error) { next(error); }
};

const transferStudent = async (req, res, next) => {
  try {
    const classId = req.body.new_class_id || req.body.newClassId;
    if (!classId) return res.status(400).json({ success: false, message: 'New class ID is required' });
    const student = await studentsService.transferStudent(req.schoolId, parseInt(req.params.id), parseInt(classId));
    res.status(200).json({ success: true, message: 'Student transferred successfully', data: student });
  } catch (error) { next(error); }
};

const getStatistics = async (req, res, next) => {
  try {
    const statistics = await studentsService.getStatistics(req.schoolId);
    res.status(200).json({ success: true, data: statistics });
  } catch (error) { next(error); }
};

const getCountByClass = async (req, res, next) => {
  try {
    const counts = await studentsService.getCountByClass(req.schoolId);
    res.status(200).json({ success: true, data: counts });
  } catch (error) { next(error); }
};

const bulkImportStudents = async (req, res, next) => {
  try {
    let students = req.body?.students;

    if (!students && req.file) {
      const csvContent = req.file.buffer.toString('utf8');
      const lines      = csvContent.split('\n').filter(l => l.trim());
      const headers    = lines[0].split(',').map(h => h.trim());
      students = lines.slice(1)
        .map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj = {};
          headers.forEach((h, i) => { obj[h] = values[i]; });
          return obj;
        })
        .filter(s => s.admissionNo || s.admission_no || s.firstName || s.first_name);
    }

    if (!students || !Array.isArray(students) || students.length === 0)
      return res.status(400).json({ success: false, message: 'Students array or CSV file is required' });
    if (students.length > 500)
      return res.status(400).json({ success: false, message: 'Maximum 500 students can be imported at once' });

    const result     = await studentsService.bulkImportStudents(students, req.schoolId);
    const statusCode = result.success ? 201 : 400;
    res.status(statusCode).json({
      success: result.success,
      message: result.success
        ? `Successfully imported ${result.imported} students`
        : `Import failed: ${result.failed} errors`,
      data: result
    });
  } catch (error) { next(error); }
};

const promoteStudents = async (req, res, next) => {
  try {
    const { student_ids, studentIds, new_class_id, newClassId, currentClassId, current_class_id } = req.body;
    let ids     = student_ids || studentIds;
    const toClass = new_class_id || newClassId;

    if (!ids && (currentClassId || current_class_id)) {
      const students = await studentsService.getStudentsByClass(req.schoolId, parseInt(currentClassId || current_class_id));
      ids = students.map(s => s.id);
    }

    if (!ids || ids.length === 0)
      return res.status(200).json({ success: true, message: 'No students to promote', data: { success: [], failed: [] } });
    if (!toClass)
      return res.status(400).json({ success: false, message: 'New class ID is required' });

    const results = await studentsService.promoteStudents(req.schoolId, ids.map(id => parseInt(id)), parseInt(toClass));
    res.status(200).json({
      success: true,
      message: `Promoted ${results.success.length} students, ${results.failed.length} failed`,
      data: results
    });
  } catch (error) { next(error); }
};

const searchStudents = async (req, res, next) => {
  try {
    const { q, class_id, status, page, limit } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });

    const filters = {
      class_id: class_id ? parseInt(class_id) : undefined,
      status,
      page:  page  ? parseInt(page)  : 1,
      limit: limit ? parseInt(limit) : 50
    };

    const result = await studentsService.searchStudents(req.schoolId, q, filters);
    res.status(200).json({ success: true, data: result.students, pagination: result.pagination });
  } catch (error) { next(error); }
};

const getStudentProfile = async (req, res, next) => {
  try {
    const profile = await studentsService.getStudentProfile(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, data: profile });
  } catch (error) { next(error); }
};

const deactivateStudent = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason)
      return res.status(400).json({ success: false, message: 'Deactivation reason is required' });
    if (!['graduated','transferred','dropped'].includes(reason))
      return res.status(400).json({ success: false, message: 'Invalid reason. Must be: graduated, transferred, or dropped' });

    const student = await studentsService.deactivateStudent(req.schoolId, parseInt(req.params.id), reason);
    res.status(200).json({ success: true, message: 'Student deactivated successfully', data: student });
  } catch (error) { next(error); }
};

const reactivateStudent = async (req, res, next) => {
  try {
    const student = await studentsService.reactivateStudent(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, message: 'Student reactivated successfully', data: student });
  } catch (error) { next(error); }
};

// Parents
const addParent = async (req, res, next) => {
  try {
    const parent = await studentsService.addParent(req.schoolId, parseInt(req.params.id), req.body);
    res.status(201).json({ success: true, data: parent });
  } catch (error) { next(error); }
};

const getParents = async (req, res, next) => {
  try {
    const parents = await studentsService.getParents(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, data: parents });
  } catch (error) { next(error); }
};

const updateParent = async (req, res, next) => {
  try {
    const parent = await studentsService.updateParent(req.schoolId, parseInt(req.params.id), parseInt(req.params.parentId), req.body);
    res.status(200).json({ success: true, data: parent });
  } catch (error) { next(error); }
};

const deleteParent = async (req, res, next) => {
  try {
    await studentsService.deleteParent(req.schoolId, parseInt(req.params.id), parseInt(req.params.parentId));
    res.status(200).json({ success: true, message: 'Parent contact deleted' });
  } catch (error) { next(error); }
};

// ── Stubs ────────────────────────────────────────────────────────────────────
const getStudentResults     = async (req, res) => res.status(200).json({ success: true, data: [] });
const getReportCard         = async (req, res) => res.status(200).json({ success: true, data: { student: { id: parseInt(req.params.id) }, results: [] } });
const getReportCardPdf      = async (req, res) => res.status(501).json({ success: false, message: 'PDF export not implemented yet' });
const getOverallCompetency  = async (req, res) => res.status(200).json({ success: true, data: { overallCompetency: 'ME' } });
const getSubjectPerformance = async (req, res) => res.status(200).json({ success: true, data: [] });
const getPerformanceTrend   = async (req, res) => res.status(200).json({ success: true, data: { trends: [] } });
const getStudentRank        = async (req, res) => res.status(200).json({ success: true, data: { rank: 1 } });
const getTranscript         = async (req, res) => res.status(200).json({ success: true, data: { transcript: [] } });
const getProgressTracker    = async (req, res) => res.status(200).json({ success: true, data: { progressData: [] } });
const advancedSearch        = async (req, res) => res.status(200).json({ success: true, data: [] });
const getMyChildren         = async (req, res) => res.status(200).json({ success: true, data: [] });
const exportStudents        = async (req, res) => res.status(501).json({ success: false, message: 'Export not implemented' });
const bulkPromoteStudents   = (req, res, next) => promoteStudents(req, res, next);
const bulkUpdateStatus      = async (req, res) => res.status(200).json({ success: true, data: { updated: req.body?.studentIds?.length || 0 } });
const updateStatus          = async (req, res) => res.status(200).json({ success: true, data: { isActive: true } });
const suspendStudent        = async (req, res) => res.status(200).json({ success: true, message: 'Student suspended' });
const withdrawStudent       = async (req, res) => res.status(200).json({ success: true, message: 'Student withdrawn' });
const graduateStudent       = async (req, res) => res.status(200).json({ success: true, message: 'Student graduated' });
const promoteStudent        = async (req, res) => res.status(200).json({ success: true, message: 'Student promoted' });
const retainStudent         = async (req, res) => res.status(200).json({ success: true, message: 'Student retained' });
const getStatusHistory      = async (req, res) => res.status(200).json({ success: true, data: [] });
const getPromotionEligibility = async (req, res) => res.status(200).json({ success: true, data: { eligible: true } });
const getTransferHistory    = async (req, res) => res.status(200).json({ success: true, data: [] });
const updateMedical         = async (req, res) => res.status(200).json({ success: true, message: 'Medical information updated' });
const updateContact         = async (req, res) => res.status(200).json({ success: true, message: 'Contact information updated' });
const getUpdateHistory      = async (req, res) => res.status(200).json({ success: true, data: [] });
const uploadDocument        = async (req, res) => res.status(501).json({ success: false, message: 'Document upload not implemented' });
const getDocuments          = async (req, res) => res.status(200).json({ success: true, data: [] });
const deleteDocument        = async (req, res) => res.status(200).json({ success: true, message: 'Document deleted' });
const getAcademicSummary    = async (req, res) => res.status(200).json({ success: true, data: {} });
const getAttendanceSummary  = async (req, res) => res.status(200).json({ success: true, data: {} });
const getFeeSummary         = async (req, res) => res.status(200).json({ success: true, data: {} });
const getProfileReport      = async (req, res) => res.status(200).json({ success: true, data: {} });
const exportStudentData     = async (req, res) => res.status(501).json({ success: false, message: 'Student export not implemented' });

module.exports = {
  createStudent, getAllStudents, getStudentById, getStudentByAdmissionNo,
  getStudentsByClass, updateStudent, deleteStudent, transferStudent,
  getStatistics, getCountByClass, bulkImportStudents, promoteStudents,
  searchStudents, getStudentProfile, deactivateStudent, reactivateStudent,
  addParent, getParents, updateParent, deleteParent,
  getStudentResults, getReportCard, getReportCardPdf, getOverallCompetency,
  getSubjectPerformance, getPerformanceTrend, getStudentRank, getTranscript,
  getProgressTracker, advancedSearch, getMyChildren, exportStudents,
  bulkPromoteStudents, bulkUpdateStatus, updateStatus, suspendStudent,
  withdrawStudent, graduateStudent, promoteStudent, retainStudent,
  getStatusHistory, getPromotionEligibility, getTransferHistory,
  updateMedical, updateContact, getUpdateHistory, uploadDocument,
  getDocuments, deleteDocument, getAcademicSummary, getAttendanceSummary,
  getFeeSummary, getProfileReport, exportStudentData
};