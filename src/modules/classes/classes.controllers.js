/**
 * Classes Controller
 * req.schoolId passed to every service call for multi-tenancy
 */

const classesService = require('./classes.service');
const { successResponse, errorResponse } = require('../../shared/utils/response');

class ClassesController {

  async createClass(req, res) {
    try {
      const newClass = await classesService.createClass(req.body, req.schoolId);
      return successResponse(res, newClass, 'Class created successfully', 201);
    } catch (error) {
      return errorResponse(res, error.message, 400);
    }
  }

  async getAllClasses(req, res) {
    try {
      const filters = {
        grade_level:      req.query.grade_level,
        class_teacher_id: req.query.teacher_id
      };
      const classes = await classesService.getAllClasses(req.schoolId, filters);
      return successResponse(res, classes, 'Classes retrieved successfully');
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  async getClassById(req, res) {
    try {
      const classData = await classesService.getClassById(req.schoolId, req.params.id);
      return successResponse(res, classData, 'Class retrieved successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async updateClass(req, res) {
    try {
      const updatedClass = await classesService.updateClass(req.schoolId, req.params.id, req.body);
      return successResponse(res, updatedClass, 'Class updated successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 400;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async deleteClass(req, res) {
    try {
      const deletedClass = await classesService.deleteClass(req.schoolId, req.params.id);
      return successResponse(res, deletedClass, 'Class deleted successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 400;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async getClassStudents(req, res) {
    try {
      const students = await classesService.getClassStudents(req.schoolId, req.params.id);
      return successResponse(res, students, 'Class students retrieved successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async assignTeacher(req, res) {
    try {
      const { teacher_id } = req.body;
      if (!teacher_id) return errorResponse(res, 'Teacher ID is required', 400);
      const updatedClass = await classesService.assignTeacher(req.schoolId, req.params.id, teacher_id);
      return successResponse(res, updatedClass, 'Teacher assigned successfully');
    } catch (error) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async removeTeacher(req, res) {
    try {
      const updatedClass = await classesService.removeTeacher(req.schoolId, req.params.id);
      return successResponse(res, updatedClass, 'Teacher removed successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 400;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async getClassesByTeacher(req, res) {
    try {
      const classes = await classesService.getClassesByTeacher(req.schoolId, req.params.teacherId);
      return successResponse(res, classes, 'Teacher classes retrieved successfully');
    } catch (error) {
      const statusCode = error.message === 'Teacher not found' ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async getCapacityStatus(req, res) {
    try {
      const capacityStatus = await classesService.getCapacityStatus(req.schoolId, req.params.id);
      return successResponse(res, capacityStatus, 'Capacity status retrieved successfully');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  async canAcceptStudents(req, res) {
    try {
      const canAccept = await classesService.canAcceptStudents(req.schoolId, req.params.id);
      return successResponse(res, { can_accept: canAccept },
        canAccept ? 'Class can accept students' : 'Class is at capacity');
    } catch (error) {
      const statusCode = error.message === 'Class not found' ? 404 : 500;
      return errorResponse(res, error.message, statusCode);
    }
  }

  // ── Stubs ─────────────────────────────────────────────────────────────────
  async getClassRanking(req, res) {
    return successResponse(res, [], 'Class ranking retrieved successfully');
  }

  async getClassAnalytics(req, res) {
    return successResponse(res, {
      classId: parseInt(req.params.id), averageMarks: 0, passRate: 0, totalStudents: 0
    }, 'Class analytics retrieved successfully');
  }

  async getReportSummary(req, res) {
    return successResponse(res, { classId: parseInt(req.params.id), summary: {} }, 'Report summary generated successfully');
  }

  async getPerformanceComparison(req, res) {
    return successResponse(res, { classId: parseInt(req.params.id), comparison: [] }, 'Performance comparison retrieved successfully');
  }

  async exportResults(req, res) {
    const { format } = req.query;
    if (format === 'pdf' || format === 'excel')
      return res.status(501).json({ success: false, message: `${format.toUpperCase()} export not implemented yet` });
    return successResponse(res, [], 'Results exported successfully');
  }

  async getStatistics(req, res) {
    return successResponse(res, { totalStudents: 0, maleCount: 0, femaleCount: 0 }, 'Class statistics retrieved successfully');
  }

  async getGenderDistribution(req, res) {
    return successResponse(res, { male: 0, female: 0, total: 0 }, 'Gender distribution retrieved successfully');
  }

  async getAgeDistribution(req, res) {
    return successResponse(res, [], 'Age distribution retrieved successfully');
  }
}

module.exports = new ClassesController();