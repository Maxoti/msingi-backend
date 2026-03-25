/**
 * Classes Service
 * schoolId threaded through every operation for multi-tenancy
 */

const classesRepository = require('./classes.repository');
const staffRepository   = require('../staff/staff.repository');
const { AppError }      = require('../../shared/middleware/errorHandler');
const cache             = require('../../shared/cache/cache.service');

class ClassesService {

  async createClass(classData, schoolId) {
    if (!classData.name)                               throw new AppError('Class name is required', 400);
    if (!classData.capacity || classData.capacity < 1) throw new AppError('Valid capacity is required', 400);

    const existingClass = await classesRepository.findByName(schoolId, classData.name);
    if (existingClass) throw new AppError('Class with this name already exists', 400);

    if (classData.class_teacher_id) {
      const teacher = await staffRepository.findById(schoolId, classData.class_teacher_id);
      if (!teacher) throw new AppError('Teacher not found', 404);
    }

    const result = await classesRepository.create(classData, schoolId);

    // ✅ Invalidate cache
    await cache.delPattern(`classes:${schoolId}:*`);

    return result;
  }

  async getAllClasses(schoolId, filters = {}) {
    const cacheKey = `classes:${schoolId}:${JSON.stringify(filters)}`;

    // ✅ Try cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const classes = await classesRepository.findAll(schoolId, filters);
    const data = classes.map(cls => ({
      ...cls,
      is_full:             parseInt(cls.student_count) >= cls.capacity,
      capacity_percentage: cls.capacity > 0
        ? Math.round((parseInt(cls.student_count) / cls.capacity) * 100)
        : 0
    }));

    // ✅ Store in cache
    await cache.set(cacheKey, data, cache.TTL.classes);

    return data;
  }

  async getClassById(schoolId, id) {
    const cacheKey = `classes:${schoolId}:id:${id}`;

    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const classData = await classesRepository.findById(schoolId, id);
    if (!classData) throw new AppError('Class not found', 404);

    const capacityStatus = await classesRepository.getCapacityStatus(schoolId, id);
    const data = {
      ...classData,
      capacity_status: capacityStatus,
      is_full: parseInt(classData.student_count) >= classData.capacity
    };

    await cache.set(cacheKey, data, cache.TTL.classes);
    return data;
  }

  async updateClass(schoolId, id, updateData) {
    const existingClass = await classesRepository.findById(schoolId, id);
    if (!existingClass) throw new AppError('Class not found', 404);

    if (updateData.name && updateData.name !== existingClass.name) {
      const nameExists = await classesRepository.findByName(schoolId, updateData.name);
      if (nameExists) throw new AppError('Class with this name already exists', 400);
    }

    if (updateData.class_teacher_id) {
      const teacher = await staffRepository.findById(schoolId, updateData.class_teacher_id);
      if (!teacher) throw new AppError('Teacher not found', 404);
    }

    if (updateData.capacity && updateData.capacity < parseInt(existingClass.student_count))
      throw new AppError(`Cannot reduce capacity below current student count (${existingClass.student_count})`, 400);

    const result = await classesRepository.update(schoolId, id, updateData);

    // ✅ Invalidate cache
    await cache.delPattern(`classes:${schoolId}:*`);

    return result;
  }

  async deleteClass(schoolId, id) {
    const existingClass = await classesRepository.findById(schoolId, id);
    if (!existingClass) throw new AppError('Class not found', 404);

    const hasStudents = await classesRepository.hasStudents(schoolId, id);
    if (hasStudents) throw new AppError('Cannot delete class with enrolled students. Please reassign students first.', 400);

    const result = await classesRepository.delete(schoolId, id);

    // ✅ Invalidate cache
    await cache.delPattern(`classes:${schoolId}:*`);

    return result;
  }

  async getClassStudents(schoolId, classId) {
    const classData = await classesRepository.findById(schoolId, classId);
    if (!classData) throw new AppError('Class not found', 404);
    return classesRepository.getStudents(schoolId, classId);
  }

  async assignTeacher(schoolId, classId, teacherId) {
    const classData = await classesRepository.findById(schoolId, classId);
    if (!classData) throw new AppError('Class not found', 404);

    const teacher = await staffRepository.findById(schoolId, teacherId);
    if (!teacher) throw new AppError('Teacher not found', 404);

    const result = await classesRepository.assignTeacher(schoolId, classId, teacherId);

    // ✅ Invalidate cache
    await cache.delPattern(`classes:${schoolId}:*`);

    return result;
  }

  async removeTeacher(schoolId, classId) {
    const classData = await classesRepository.findById(schoolId, classId);
    if (!classData) throw new AppError('Class not found', 404);
    if (!classData.class_teacher_id) throw new AppError('Class does not have an assigned teacher', 400);

    const result = await classesRepository.removeTeacher(schoolId, classId);

    // ✅ Invalidate cache
    await cache.delPattern(`classes:${schoolId}:*`);

    return result;
  }

  async getClassesByTeacher(schoolId, teacherId) {
    const teacher = await staffRepository.findById(schoolId, teacherId);
    if (!teacher) throw new AppError('Teacher not found', 404);
    return classesRepository.findByTeacher(schoolId, teacherId);
  }

  async getCapacityStatus(schoolId, classId) {
    const classData = await classesRepository.findById(schoolId, classId);
    if (!classData) throw new AppError('Class not found', 404);

    const capacityStatus = await classesRepository.getCapacityStatus(schoolId, classId);
    return {
      ...capacityStatus,
      is_full: parseInt(capacityStatus.current_students) >= capacityStatus.capacity,
      capacity_percentage: capacityStatus.capacity > 0
        ? Math.round((parseInt(capacityStatus.current_students) / capacityStatus.capacity) * 100)
        : 0
    };
  }

  async canAcceptStudents(schoolId, classId) {
    const capacityStatus = await this.getCapacityStatus(schoolId, classId);
    return !capacityStatus.is_full && capacityStatus.available_slots > 0;
  }
}

module.exports = new ClassesService();