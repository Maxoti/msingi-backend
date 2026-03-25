/**
 * Subjects Service
 * schoolId threaded through every operation for multi-tenancy
 */

const subjectsRepository = require('./subjects.repository');

const VALID_GRADE_LEVELS = [
  'GRADE_1','GRADE_2','GRADE_3',
  'GRADE_4','GRADE_5','GRADE_6',
  'GRADE_7','GRADE_8','GRADE_9'
];

const VALID_CATEGORIES = [
  'LANGUAGES','MATHEMATICS','SCIENCES','SOCIAL_STUDIES',
  'RELIGIOUS_EDUCATION','CREATIVE_ARTS','TECHNICAL',
  'AGRICULTURE','ENVIRONMENTAL','PASTORAL'
];

const getAllSubjects = async (schoolId, filters = {}) =>
  subjectsRepository.findAll(schoolId, filters);

const getSubjectById = async (schoolId, id) => {
  const subject = await subjectsRepository.findById(schoolId, id);
  if (!subject) throw new Error('Subject not found');
  return subject;
};

const getSubjectByCode = async (schoolId, code) => {
  const subject = await subjectsRepository.findByCode(schoolId, code);
  if (!subject) throw new Error('Subject not found');
  return subject;
};

const getSubjectsByGradeLevel = async (schoolId, gradeLevel) => {
  if (!VALID_GRADE_LEVELS.includes(gradeLevel))
    throw new Error(`Invalid grade level. Must be one of: ${VALID_GRADE_LEVELS.join(', ')}`);
  return subjectsRepository.findByGradeLevel(schoolId, gradeLevel);
};

const getSubjectsByCategory = async (schoolId, category) =>
  subjectsRepository.findByCategory(schoolId, category);

const getSubjectsForClass = async (schoolId, classId) => {
  if (!classId) throw new Error('Class ID is required');
  return subjectsRepository.findByClassId(schoolId, classId);
};

const getAllCategories = async (schoolId) =>
  subjectsRepository.getAllCategories(schoolId);

const createSubject = async (subjectData, schoolId) => {
  const { name, code, description, grade_levels, lessons_per_week, category } = subjectData;
  const errors = [];

  if (!name || name.trim().length === 0) errors.push('Subject name is required');
  if (!code || code.trim().length === 0) errors.push('Subject code is required');
  if (code && code.length > 20) errors.push('Subject code must be 20 characters or less');

  if (grade_levels?.length > 0) {
    const invalid = grade_levels.filter(l => !VALID_GRADE_LEVELS.includes(l));
    if (invalid.length > 0) errors.push(`Invalid grade levels: ${invalid.join(', ')}`);
  }
  if (lessons_per_week !== undefined && lessons_per_week !== null) {
    if (!Number.isInteger(lessons_per_week) || lessons_per_week < 1 || lessons_per_week > 10)
      errors.push('Lessons per week must be an integer between 1 and 10');
  }
  if (category && !VALID_CATEGORIES.includes(category))
    errors.push(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);

  if (errors.length > 0) throw new Error(errors.join(', '));

  if (await subjectsRepository.codeExists(schoolId, code))
    throw new Error(`Subject with code "${code}" already exists`);
  if (await subjectsRepository.nameExists(schoolId, name))
    throw new Error(`Subject with name "${name}" already exists`);

  return subjectsRepository.create({
    name: name.trim(), code: code.trim().toUpperCase(),
    description: description ? description.trim() : null,
    grade_levels: grade_levels || [], lessons_per_week, category, is_active: true
  }, schoolId);
};

const updateSubject = async (schoolId, id, updates) => {
  const existing = await subjectsRepository.findById(schoolId, id);
  if (!existing) throw new Error('Subject not found');

  const { name, code, description, grade_levels, lessons_per_week, category, is_active } = updates;
  const errors = [];

  if (name !== undefined && name.trim().length === 0) errors.push('Subject name cannot be empty');
  if (code !== undefined && code.trim().length === 0) errors.push('Subject code cannot be empty');
  if (code && code.length > 20) errors.push('Subject code must be 20 characters or less');
  if (grade_levels?.length > 0) {
    const invalid = grade_levels.filter(l => !VALID_GRADE_LEVELS.includes(l));
    if (invalid.length > 0) errors.push(`Invalid grade levels: ${invalid.join(', ')}`);
  }
  if (lessons_per_week !== undefined && lessons_per_week !== null) {
    if (!Number.isInteger(lessons_per_week) || lessons_per_week < 1 || lessons_per_week > 10)
      errors.push('Lessons per week must be an integer between 1 and 10');
  }
  if (category && !VALID_CATEGORIES.includes(category))
    errors.push(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`);
  if (errors.length > 0) throw new Error(errors.join(', '));

  if (code && code !== existing.code && await subjectsRepository.codeExists(schoolId, code, id))
    throw new Error(`Subject with code "${code}" already exists`);
  if (name && name !== existing.name && await subjectsRepository.nameExists(schoolId, name, id))
    throw new Error(`Subject with name "${name}" already exists`);

  const updateData = {};
  if (name !== undefined)             updateData.name             = name.trim();
  if (code !== undefined)             updateData.code             = code.trim().toUpperCase();
  if (description !== undefined)      updateData.description      = description ? description.trim() : null;
  if (grade_levels !== undefined)     updateData.grade_levels     = grade_levels;
  if (lessons_per_week !== undefined) updateData.lessons_per_week = lessons_per_week;
  if (category !== undefined)         updateData.category         = category;
  if (is_active !== undefined)        updateData.is_active        = is_active;

  return subjectsRepository.update(schoolId, id, updateData);
};

const deleteSubject = async (schoolId, id) => {
  const subject = await subjectsRepository.findById(schoolId, id);
  if (!subject) throw new Error('Subject not found');
  return subjectsRepository.deleteSubject(schoolId, id);
};

const deactivateSubject = async (schoolId, id) => {
  const subject = await subjectsRepository.findById(schoolId, id);
  if (!subject) throw new Error('Subject not found');
  if (!subject.is_active) throw new Error('Subject is already deactivated');
  return subjectsRepository.deactivate(schoolId, id);
};

const activateSubject = async (schoolId, id) => {
  const subject = await subjectsRepository.findById(schoolId, id);
  if (!subject) throw new Error('Subject not found');
  if (subject.is_active) throw new Error('Subject is already active');
  return subjectsRepository.activate(schoolId, id);
};

const getSubjectsStatistics = async (schoolId) =>
  subjectsRepository.getStatistics(schoolId);

const getValidGradeLevels = () => VALID_GRADE_LEVELS;
const getValidCategories  = () => VALID_CATEGORIES;

module.exports = {
  getAllSubjects, getSubjectById, getSubjectByCode,
  getSubjectsByGradeLevel, getSubjectsByCategory, getSubjectsForClass,
  getAllCategories, createSubject, updateSubject, deleteSubject,
  deactivateSubject, activateSubject, getSubjectsStatistics,
  getValidGradeLevels, getValidCategories,
  VALID_GRADE_LEVELS, VALID_CATEGORIES
};