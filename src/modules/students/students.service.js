/**
 * Students Service
 * Business logic layer for student management
 * schoolId threaded through every operation for multi-tenancy
 */

const studentsRepository = require('./students.repository');
const db                 = require('../../shared/database/client');
const { AppError }       = require('../../shared/middleware/errorHandler');
const eventBus           = require('../events/event-bus');
const cache              = require('../../shared/cache/cache.service');

/* ============================================================
   SANITIZATION
   ============================================================ */
const stripTags = (val) =>
  typeof val === 'string' ? val.replace(/<[^>]*>/g, '').trim() : val;

/* ============================================================
   NORMALIZATION
   ============================================================ */
const normalizeStudentData = (data) => ({
  admission_no:             data.admissionNo              || data.admission_no,
  first_name:               stripTags(data.firstName      || data.first_name),
  last_name:                stripTags(data.lastName       || data.last_name),
  middle_name:              stripTags(data.middleName     || data.middle_name || data.otherNames || data.other_names),
  gender:                   data.gender,
  date_of_birth:            data.dateOfBirth              || data.date_of_birth,
  birth_certificate_number: data.birthCertificateNo       || data.birth_certificate_number,
  class_id:                 data.classId                  || data.class_id,
  admission_date:           data.admissionDate            || data.admission_date,
  phone:                    data.phone,
  email:                    data.email,
  address:                  data.address,
  county:                   data.county,
  sub_county:               data.subCounty                || data.sub_county,
  postal_code:              data.postalCode               || data.postal_code,
  blood_group:              data.bloodGroup               || data.blood_group,
  allergies:                data.allergies,
  medical_conditions:       data.medicalConditions        || data.medical_conditions,
  special_needs: data.specialNeeds !== undefined
    ? (typeof data.specialNeeds === 'string'
        ? data.specialNeeds !== '' && data.specialNeeds.toLowerCase() !== 'false'
        : Boolean(data.specialNeeds))
    : (data.special_needs || false),
  special_needs_category: typeof data.specialNeeds === 'string' && data.specialNeeds.length > 1
    ? data.specialNeeds
    : (data.specialNeedsCategory || data.special_needs_category || null),
  status:          data.status,
  is_active:       data.isActive   !== undefined ? data.isActive   : data.is_active,
  residence_type:  data.residenceType || data.residence_type,
  upi_number:      data.upiNumber     || data.upi_number,
  autoGenerateAdmissionNo: data.autoGenerateAdmissionNo || data.auto_generate_admission_no
});

/* ============================================================
   VALIDATION
   ============================================================ */
const validateStudentData = (data, isUpdate = false) => {
  const errors = [];

  if (!isUpdate) {
    if (!data.admission_no && !data.autoGenerateAdmissionNo) errors.push('Admission number is required');
    if (!data.first_name)    errors.push('First name is required');
    if (!data.last_name)     errors.push('Last name is required');
    if (!data.date_of_birth) errors.push('Date of birth is required');
    if (!data.gender)        errors.push('Gender is required');
    if (!data.class_id)      errors.push('Class ID is required');
    if (!data.admission_date) errors.push('Admission date is required');
  }

  if (data.first_name  && data.first_name.length  > 100) errors.push('First name must be 100 characters or less');
  if (data.last_name   && data.last_name.length   > 100) errors.push('Last name must be 100 characters or less');
  if (data.middle_name && data.middle_name.length > 100) errors.push('Middle name must be 100 characters or less');
  if (data.gender && !['MALE','FEMALE'].includes(data.gender)) errors.push('Gender must be MALE or FEMALE');
  if (data.status && !['ACTIVE','TRANSFERRED','COMPLETED','DROPPED'].includes(data.status)) errors.push('Invalid status');
  if (data.residence_type && !['BOARDING','DAY'].includes(data.residence_type)) errors.push('Residence type must be BOARDING or DAY');
  if (data.upi_number && data.upi_number.length !== 12) errors.push('UPI number must be exactly 12 characters');

  if (data.date_of_birth) {
    const dob   = new Date(data.date_of_birth);
    const today = new Date();
    if (dob >= today) errors.push('Date of birth must be in the past');
    const age = today.getFullYear() - dob.getFullYear();
    if (age < 3 || age > 25) errors.push('Student age must be between 3 and 25 years');
  }

  if (data.admission_date && new Date(data.admission_date) > new Date())
    errors.push('Admission date cannot be in the future');

  return errors;
};

/* ============================================================
   ADMISSION NUMBER GENERATION
   ============================================================ */
const generateAdmissionNo = async (schoolId) => {
  const year   = new Date().getFullYear();
  const prefix = `STD${year}`;
  const result = await db.schoolQueryOne(schoolId,
    `SELECT COUNT(*) AS cnt FROM students WHERE admission_no LIKE $1`,
    [`${prefix}%`]
  );
  const seq = (parseInt(result.cnt) + 1).toString().padStart(3, '0');
  let admissionNo = `${prefix}${seq}`;

  const exists = await studentsRepository.admissionNumberExists(schoolId, admissionNo);
  if (exists) admissionNo = `${prefix}${Date.now().toString().slice(-6)}`;

  return admissionNo;
};

/* ============================================================
   CORE CRUD
   ============================================================ */

const createStudent = async (studentData, schoolId) => {
  const normalized = normalizeStudentData(studentData);

  if (normalized.autoGenerateAdmissionNo && !normalized.admission_no) {
    normalized.admission_no = await generateAdmissionNo(schoolId);
  }

  const errors = validateStudentData(normalized);
  if (errors.length > 0) throw new AppError(errors.join(', '), 400);

  const admissionExists = await studentsRepository.admissionNumberExists(schoolId, normalized.admission_no);
  if (admissionExists) throw new AppError('Admission number already exists', 409);

  if (normalized.upi_number) {
    const upiExists = await studentsRepository.upiNumberExists(schoolId, normalized.upi_number);
    if (upiExists) throw new AppError('UPI number already exists', 409);
  }

  const student = await studentsRepository.create(normalized, schoolId);

  // ✅ Invalidate students cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.created', {
    studentId:   student.id,
    admissionNo: student.admissionNo,
    firstName:   student.firstName,
    lastName:    student.lastName,
    classId:     student.classId,
    school_id:   student.schoolId,
  });

  return student;
};

const getStudentById = async (schoolId, id) => {
  const student = await studentsRepository.findById(schoolId, id);
  if (!student) throw new AppError('Student not found', 404);
  return student;
};

const getStudentByAdmissionNo = async (schoolId, admission_no) => {
  const student = await studentsRepository.findByAdmissionNo(schoolId, admission_no);
  if (!student) throw new AppError('Student not found', 404);
  return student;
};

const getAllStudents = async (schoolId, filters = {}) => {
  const cacheKey = `students:${schoolId}:${JSON.stringify(filters)}`;

  // ✅ Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const repoFilters = { ...filters };

  if (filters.minAge) {
    repoFilters.maxDateOfBirth = new Date(
      new Date().setFullYear(new Date().getFullYear() - filters.minAge)
    ).toISOString().split('T')[0];
  }
  if (filters.maxAge) {
    repoFilters.minDateOfBirth = new Date(
      new Date().setFullYear(new Date().getFullYear() - filters.maxAge)
    ).toISOString().split('T')[0];
  }

  const data = await studentsRepository.findAll(schoolId, repoFilters);

  // ✅ Store in cache
  await cache.set(cacheKey, data, cache.TTL.students);

  return data;
};

const getStudentsByClass = async (schoolId, class_id, filters = {}) => {
  const cacheKey = `students:${schoolId}:class:${class_id}:${JSON.stringify(filters)}`;

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await studentsRepository.findByClass(schoolId, class_id, filters);
  await cache.set(cacheKey, data, cache.TTL.students);
  return data;
};

const updateStudent = async (schoolId, id, updateData) => {
  const normalized = normalizeStudentData(updateData);

  const existing = await studentsRepository.findById(schoolId, id);
  if (!existing) throw new AppError('Student not found', 404);

  if (normalized.admission_no && normalized.admission_no !== existing.admissionNo)
    throw new AppError('Admission number cannot be changed', 400);
  delete normalized.admission_no;

  const errors = validateStudentData(normalized, true);
  if (errors.length > 0) throw new AppError(errors.join(', '), 400);

  if (normalized.upi_number && normalized.upi_number !== existing.upiNumber) {
    const upiExists = await studentsRepository.upiNumberExists(schoolId, normalized.upi_number, id);
    if (upiExists) throw new AppError('UPI number already exists', 409);
  }

  const student = await studentsRepository.update(schoolId, id, normalized);

  // ✅ Invalidate cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.updated', {
    studentId: student.id,
    school_id: student.schoolId,
    updates:   updateData,
  });

  return student;
};

const deleteStudent = async (schoolId, id, hardDelete = false) => {
  const student = await studentsRepository.findById(schoolId, id);
  if (!student) throw new AppError('Student not found', 404);

  const safeCheck = async (sql, params) => {
    try { return await db.schoolQueryOne(schoolId, sql, params); }
    catch { return null; }
  };

  const [unpaidInvoice, examResult, attendanceRecord] = await Promise.all([
    safeCheck(`SELECT id FROM invoices WHERE student_id = $1 AND status IN ('UNPAID','PARTIAL') LIMIT 1`, [id]),
    safeCheck(`SELECT id FROM exam_results WHERE student_id = $1 LIMIT 1`, [id]),
    safeCheck(`SELECT id FROM attendance WHERE student_id = $1 LIMIT 1`, [id]),
  ]);

  if (unpaidInvoice)    throw new AppError('Cannot delete student with unpaid invoices', 409);
  if (examResult)       throw new AppError('Cannot delete student with exam results', 409);
  if (attendanceRecord) throw new AppError('Cannot delete student with attendance records', 409);

  const result = hardDelete
    ? await studentsRepository.hardDelete(schoolId, id)
    : await studentsRepository.softDelete(schoolId, id);

  // ✅ Invalidate cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.deleted', {
    studentId:   student.id,
    admissionNo: student.admissionNo,
    school_id:   student.schoolId,
    hardDelete,
  });

  return result;
};

const transferStudent = async (schoolId, student_id, new_class_id) => {
  const student = await studentsRepository.findById(schoolId, student_id);
  if (!student) throw new AppError('Student not found', 404);
  if (student.classId === new_class_id) throw new AppError('Student is already in this class', 400);

  const result = await studentsRepository.transferClass(schoolId, student_id, new_class_id);

  // ✅ Invalidate cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.transferred', {
    studentId:   student.id,
    admissionNo: student.admissionNo,
    fromClassId: student.classId,
    toClassId:   new_class_id,
    school_id:   student.schoolId,
  });

  return result;
};

const getStatistics = async (schoolId) => {
  const cacheKey = `students:${schoolId}:stats`;
  const cached   = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await studentsRepository.getStatistics(schoolId);
  await cache.set(cacheKey, data, cache.TTL.dashboard);
  return data;
};

const getCountByClass = async (schoolId) => {
  const cacheKey = `students:${schoolId}:count-by-class`;
  const cached   = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await studentsRepository.getCountByClass(schoolId);
  await cache.set(cacheKey, data, cache.TTL.students);
  return data;
};

/* ============================================================
   PARENTS / GUARDIANS
   ============================================================ */

const addParent = async (schoolId, studentId, parentData) => {
  const student = await studentsRepository.findById(schoolId, studentId);
  if (!student) throw new AppError('Student not found', 404);

  const result = await db.schoolQueryOne(schoolId,
    `INSERT INTO parent_contacts
       (student_id, relationship, name, phone, email, id_number, occupation, is_primary, school_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      studentId, parentData.relationship || 'GUARDIAN', parentData.name,
      parentData.phone, parentData.email || null,
      parentData.idNumber || parentData.id_number || null,
      parentData.occupation || null,
      parentData.isPrimary !== undefined ? Boolean(parentData.isPrimary) : false,
      schoolId
    ]
  );

  return {
    id: result.id, studentId: result.student_id,
    relationship: result.relationship, name: result.name,
    phone: result.phone, email: result.email, isPrimary: result.is_primary
  };
};

const getParents = async (schoolId, studentId) => {
  const student = await studentsRepository.findById(schoolId, studentId);
  if (!student) throw new AppError('Student not found', 404);

  const rows = await db.schoolQuery(schoolId,
    `SELECT * FROM parent_contacts WHERE student_id = $1 ORDER BY is_primary DESC, id ASC`,
    [studentId]
  );

  return rows.map(r => ({
    id: r.id, studentId: r.student_id, relationship: r.relationship,
    name: r.name, phone: r.phone, email: r.email, isPrimary: r.is_primary
  }));
};

const updateParent = async (schoolId, studentId, parentId, updateData) => {
  const student = await studentsRepository.findById(schoolId, studentId);
  if (!student) throw new AppError('Student not found', 404);

  try {
    const result = await db.schoolQueryOne(schoolId,
      `UPDATE parent_contacts SET
         phone      = COALESCE($1, phone),
         email      = COALESCE($2, email),
         name       = COALESCE($3, name),
         is_primary = COALESCE($4, is_primary)
       WHERE id = $5 AND student_id = $6 RETURNING *`,
      [
        updateData.phone || null, updateData.email || null, updateData.name || null,
        updateData.isPrimary !== undefined ? Boolean(updateData.isPrimary) : null,
        parentId, studentId
      ]
    );
    if (!result) throw new AppError('Parent not found', 404);
    return result;
  } catch (err) {
    if (err.message?.includes('does not exist')) return { id: parentId, ...updateData };
    throw err;
  }
};

const deleteParent = async (schoolId, studentId, parentId) => {
  const student = await studentsRepository.findById(schoolId, studentId);
  if (!student) throw new AppError('Student not found', 404);

  try {
    const result = await db.schoolQueryOne(schoolId,
      `DELETE FROM parent_contacts WHERE id = $1 AND student_id = $2 RETURNING *`,
      [parentId, studentId]
    );
    return result || { id: parentId };
  } catch (err) {
    if (err.message?.includes('does not exist')) return { id: parentId };
    throw err;
  }
};

/* ============================================================
   BULK OPERATIONS
   ============================================================ */

const bulkImportStudents = async (studentsData, schoolId) => {
  const normalizedStudents = studentsData.map(s => normalizeStudentData(s));
  const validationResults  = [];
  const validStudents      = [];

  for (let i = 0; i < normalizedStudents.length; i++) {
    const student = normalizedStudents[i];
    if (!student.admission_no) student.admission_no = await generateAdmissionNo(schoolId);

    const errors = validateStudentData(student);
    if (errors.length > 0) {
      validationResults.push({ row: i + 1, admission_no: student.admission_no, status: 'error', errors });
    } else {
      validStudents.push(student);
      validationResults.push({ row: i + 1, admission_no: student.admission_no, status: 'pending' });
    }
  }

  const hasErrors = validationResults.some(r => r.status === 'error');
  if (hasErrors) {
    return {
      success: false, imported: 0,
      failed: validationResults.filter(r => r.status === 'error').length,
      results: validationResults
    };
  }

  const admissionNumbers = validStudents.map(s => s.admission_no);
  const duplicates = admissionNumbers.filter((n, i) => admissionNumbers.indexOf(n) !== i);
  if (duplicates.length > 0)
    throw new AppError(`Duplicate admission numbers in import: ${duplicates.join(', ')}`, 400);

  try {
    const imported = await studentsRepository.bulkCreate(validStudents, schoolId);

    //  Invalidate cache after bulk import
    await cache.delPattern(`students:${schoolId}:*`);

    eventBus.emit('student.bulkImported', { school_id: schoolId, count: imported.length });
    return {
      success: true, imported: imported.length, failed: 0,
      results: validationResults.map(r => ({ ...r, status: 'success' }))
    };
  } catch (error) {
    if (error.code === '23505') throw new AppError('One or more students already exist', 409);
    throw error;
  }
};

const promoteStudents = async (schoolId, student_ids, new_class_id) => {
  const results = { success: [], failed: [] };

  for (const student_id of student_ids) {
    try {
      const updated = await studentsRepository.transferClass(schoolId, student_id, new_class_id);
      eventBus.emit('student.transferred', { studentId: student_id, toClassId: new_class_id });
      results.success.push({
        student_id,
        admissionNo: updated.admissionNo,
        name: `${updated.firstName} ${updated.lastName}`
      });
    } catch (error) {
      results.failed.push({ student_id, error: error.message });
    }
  }

  //  Invalidate cache after bulk promote
  await cache.delPattern(`students:${schoolId}:*`);

  return results;
};

/* ============================================================
   OTHER
   ============================================================ */

const searchStudents = async (schoolId, searchTerm, filters = {}) => {
  return await studentsRepository.findAll(schoolId, { ...filters, search: searchTerm });
};

const getStudentProfile = async (schoolId, id) => {
  const student = await getStudentById(schoolId, id);
  return { student };
};

const deactivateStudent = async (schoolId, id, reason) => {
  const student = await studentsRepository.findById(schoolId, id);
  if (!student) throw new AppError('Student not found', 404);

  const statusMap = { graduated: 'COMPLETED', transferred: 'TRANSFERRED', dropped: 'DROPPED' };
  const result = await studentsRepository.update(schoolId, id, {
    is_active: false,
    status: statusMap[reason] || 'COMPLETED'
  });

  //  Invalidate cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.deactivated', { studentId: student.id, school_id: student.schoolId, reason });
  return result;
};

const reactivateStudent = async (schoolId, id) => {
  const student = await studentsRepository.findById(schoolId, id);
  if (!student) throw new AppError('Student not found', 404);

  const result = await studentsRepository.update(schoolId, id, { is_active: true, status: 'ACTIVE' });

  //  Invalidate cache
  await cache.delPattern(`students:${schoolId}:*`);

  eventBus.emit('student.reactivated', { studentId: student.id, school_id: student.schoolId });
  return result;
};

/* ============================================================
   EXPORTS
   ============================================================ */
module.exports = {
  createStudent,
  getStudentById,
  getStudentByAdmissionNo,
  getAllStudents,
  getStudentsByClass,
  updateStudent,
  deleteStudent,
  transferStudent,
  getStatistics,
  getCountByClass,
  bulkImportStudents,
  promoteStudents,
  searchStudents,
  getStudentProfile,
  deactivateStudent,
  reactivateStudent,
  addParent,
  getParents,
  updateParent,
  deleteParent
};