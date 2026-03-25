/**
 * Subjects Controller
 * req.schoolId passed to every service call for multi-tenancy
 */

const subjectsService = require('./subjects.service');

const getAllSubjects = async (req, res, next) => {
  try {
    const { grade_level, category, is_active, page, limit } = req.query;
    const filters = {};
    if (grade_level)          filters.grade_level = grade_level;
    if (category)             filters.category    = category;
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (page)                 filters.page        = parseInt(page);
    if (limit)                filters.limit       = parseInt(limit);

    const result = await subjectsService.getAllSubjects(req.schoolId, filters);
    res.status(200).json({ success: true, data: result.subjects, pagination: result.pagination });
  } catch (error) { next(error); }
};

const getSubjectById = async (req, res, next) => {
  try {
    const subject = await subjectsService.getSubjectById(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, data: subject });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

const getSubjectByCode = async (req, res, next) => {
  try {
    const subject = await subjectsService.getSubjectByCode(req.schoolId, req.params.code.toUpperCase());
    res.status(200).json({ success: true, data: subject });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

const getSubjectsByGradeLevel = async (req, res, next) => {
  try {
    const subjects = await subjectsService.getSubjectsByGradeLevel(req.schoolId, req.params.gradeLevel);
    res.status(200).json({ success: true, data: subjects });
  } catch (error) {
    if (error.message.includes('Invalid grade level'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const getSubjectsByCategory = async (req, res, next) => {
  try {
    const subjects = await subjectsService.getSubjectsByCategory(req.schoolId, req.params.category);
    res.status(200).json({ success: true, data: subjects });
  } catch (error) { next(error); }
};

const getSubjectsForClass = async (req, res, next) => {
  try {
    const subjects = await subjectsService.getSubjectsForClass(req.schoolId, parseInt(req.params.classId));
    res.status(200).json({ success: true, data: subjects });
  } catch (error) { next(error); }
};

const getAllCategories = async (req, res, next) => {
  try {
    const categories = await subjectsService.getAllCategories(req.schoolId);
    res.status(200).json({ success: true, data: categories });
  } catch (error) { next(error); }
};

const getValidGradeLevels = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: subjectsService.getValidGradeLevels() });
  } catch (error) { next(error); }
};

const getValidCategories = async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: subjectsService.getValidCategories() });
  } catch (error) { next(error); }
};

const createSubject = async (req, res, next) => {
  try {
    const { name, code, description, grade_levels, lessons_per_week, category } = req.body;
    if (!name || !code)
      return res.status(400).json({ success: false, message: 'Name and code are required' });

    const newSubject = await subjectsService.createSubject(
      { name, code, description, grade_levels, lessons_per_week, category },
      req.schoolId
    );
    res.status(201).json({ success: true, message: 'Subject created successfully', data: newSubject });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('required') ||
        error.message.includes('Invalid') || error.message.includes('must be'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const updateSubject = async (req, res, next) => {
  try {
    if (Object.keys(req.body).length === 0)
      return res.status(400).json({ success: false, message: 'No fields to update' });

    const updatedSubject = await subjectsService.updateSubject(req.schoolId, parseInt(req.params.id), req.body);
    res.status(200).json({ success: true, message: 'Subject updated successfully', data: updatedSubject });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes('already exists') || error.message.includes('Invalid') ||
        error.message.includes('cannot be empty') || error.message.includes('must be'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const deleteSubject = async (req, res, next) => {
  try {
    await subjectsService.deleteSubject(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, message: 'Subject deleted successfully' });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

const deactivateSubject = async (req, res, next) => {
  try {
    const subject = await subjectsService.deactivateSubject(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, message: 'Subject deactivated successfully', data: subject });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes('already deactivated'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const activateSubject = async (req, res, next) => {
  try {
    const subject = await subjectsService.activateSubject(req.schoolId, parseInt(req.params.id));
    res.status(200).json({ success: true, message: 'Subject activated successfully', data: subject });
  } catch (error) {
    if (error.message === 'Subject not found')
      return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes('already active'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const getSubjectsStatistics = async (req, res, next) => {
  try {
    const stats = await subjectsService.getSubjectsStatistics(req.schoolId);
    res.status(200).json({ success: true, data: stats });
  } catch (error) { next(error); }
};

module.exports = {
  getAllSubjects, getSubjectById, getSubjectByCode,
  getSubjectsByGradeLevel, getSubjectsByCategory, getSubjectsForClass,
  getAllCategories, getValidGradeLevels, getValidCategories,
  createSubject, updateSubject, deleteSubject,
  deactivateSubject, activateSubject, getSubjectsStatistics
};