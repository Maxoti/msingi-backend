/**
 * Students Repository
 * Multitenancy: explicit WHERE school_id on every query - no RLS dependency
 */

const db = require('../../shared/database/client');

const mapStudent = (row) => {
  if (!row) return null;
  return {
    id: row.id, admissionNo: row.admission_no, firstName: row.first_name,
    lastName: row.last_name, middleName: row.middle_name || null,
    dateOfBirth: row.date_of_birth, gender: row.gender,
    upiNumber: row.upi_number || null, birthCertificateNumber: row.birth_certificate_number || null,
    county: row.county || null, subCounty: row.sub_county || null,
    specialNeeds: row.special_needs || false, specialNeedsCategory: row.special_needs_category || null,
    classId: row.class_id, className: row.class_name || null, gradeLevel: row.grade_level || null,
    admissionDate: row.admission_date, residenceType: row.residence_type || null,
    status: row.status, isActive: row.is_active, schoolId: row.school_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
    fullName: row.full_name || `${row.first_name} ${row.last_name}`
  };
};

const coerceBool = (val) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
  return Boolean(val);
};

const create = async (studentData, schoolId) => {
  const { admission_no, first_name, last_name, middle_name, date_of_birth, gender,
    upi_number, birth_certificate_number, county, sub_county, special_needs,
    special_needs_category, class_id, admission_date, residence_type, status = 'ACTIVE' } = studentData;
  const row = await db.queryOne(
    `INSERT INTO students (admission_no,first_name,last_name,middle_name,date_of_birth,gender,
      upi_number,birth_certificate_number,county,sub_county,special_needs,special_needs_category,
      class_id,admission_date,residence_type,status,school_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [admission_no, first_name, last_name, middle_name||null, date_of_birth, gender,
     upi_number||null, birth_certificate_number||null, county||null, sub_county||null,
     coerceBool(special_needs), special_needs_category||null, class_id, admission_date,
     residence_type||null, status, schoolId]
  );
  return mapStudent(row);
};

const findById = async (schoolId, id) => {
  const row = await db.queryOne(
    `SELECT s.*, c.name AS class_name, c.grade_level FROM students s
     LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = $1 AND s.school_id = $2`,
    [id, schoolId]
  );
  return mapStudent(row);
};

const findByAdmissionNo = async (schoolId, admission_no) => {
  const row = await db.queryOne(
    `SELECT s.*, c.name AS class_name, c.grade_level FROM students s
     LEFT JOIN classes c ON s.class_id = c.id WHERE s.admission_no = $1 AND s.school_id = $2`,
    [admission_no, schoolId]
  );
  return mapStudent(row);
};

const findByUPI = async (schoolId, upi_number) => {
  const row = await db.queryOne(
    `SELECT s.*, c.name AS class_name FROM students s
     LEFT JOIN classes c ON s.class_id = c.id WHERE s.upi_number = $1 AND s.school_id = $2`,
    [upi_number, schoolId]
  );
  return mapStudent(row);
};

const findAll = async (schoolId, filters = {}) => {
  const { class_id, status, gender, residence_type, is_active=true, search,
    page = 1, limit = 50, sort_by = 'admission_no', sort_order = 'ASC' } = filters;

  const conditions = ['s.school_id = $1'];
  const values = [schoolId];
  let p = 1;

  if (class_id)   { conditions.push(`s.class_id = $${++p}`);      values.push(class_id); }
  if (status)     { conditions.push(`s.status = $${++p}`);         values.push(status); }
  if (gender)     { conditions.push(`s.gender = $${++p}`);         values.push(gender); }
  if (residence_type) { conditions.push(`s.residence_type = $${++p}`); values.push(residence_type); }
  if (is_active !== undefined) { conditions.push(`s.is_active = $${++p}`); values.push(is_active); }
  if (search) {
    conditions.push(`(s.admission_no ILIKE $${++p} OR s.first_name ILIKE $${p} OR s.last_name ILIKE $${p} OR s.upi_number ILIKE $${p})`);
    values.push(`%${search}%`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const allowed = ['admission_no','first_name','last_name','date_of_birth','admission_date','status'];
  const col = allowed.includes(sort_by) ? sort_by : 'admission_no';
  const dir = sort_order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const cr = await db.queryOne(`SELECT COUNT(*) AS total FROM students s ${where}`, values);
  const total = parseInt(cr.total);

  values.push(parseInt(limit), offset);
  const rows = await db.queryAll(
    `SELECT s.*, c.name AS class_name, c.grade_level, CONCAT(s.first_name,' ',s.last_name) AS full_name
     FROM students s LEFT JOIN classes c ON s.class_id = c.id
     ${where} ORDER BY s.${col} ${dir} LIMIT $${p+1} OFFSET $${p+2}`,
    values
  );
  return { students: rows.map(mapStudent), pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total/parseInt(limit)) } };
};

const findByClass = async (schoolId, class_id, filters = {}) => {
  const { is_active = true, status = 'ACTIVE' } = filters;
  const rows = await db.queryAll(
    `SELECT s.*, c.name AS class_name, c.grade_level, CONCAT(s.first_name,' ',s.last_name) AS full_name
     FROM students s LEFT JOIN classes c ON s.class_id = c.id
     WHERE s.class_id = $1 AND s.is_active = $2 AND s.status = $3 AND s.school_id = $4
     ORDER BY s.admission_no ASC`,
    [class_id, is_active, status, schoolId]
  );
  return rows.map(mapStudent);
};

const update = async (schoolId, id, updateData) => {
  const fields = [], values = [];
  let p = 0;
  const allowed = ['first_name','last_name','middle_name','date_of_birth','gender','upi_number',
    'birth_certificate_number','county','sub_county','special_needs','special_needs_category',
    'class_id','residence_type','status','is_active'];
  for (const [key, value] of Object.entries(updateData)) {
    if (allowed.includes(key) && value !== undefined) {
      const v = (key === 'special_needs' || key === 'is_active') ? coerceBool(value) : value;
      fields.push(`${key} = $${++p}`); values.push(v);
    }
  }
  if (!fields.length) throw new Error('No valid fields to update');
  fields.push(`updated_at = $${++p}`); values.push(new Date());
  values.push(id, schoolId);
  const row = await db.queryOne(
    `UPDATE students SET ${fields.join(', ')} WHERE id = $${p+1} AND school_id = $${p+2} RETURNING *`, values
  );
  return mapStudent(row);
};

const softDelete = async (schoolId, id) => mapStudent(await db.queryOne(
  `UPDATE students SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND school_id = $2 RETURNING *`, [id, schoolId]
));

const hardDelete = async (schoolId, id) => mapStudent(await db.queryOne(
  `DELETE FROM students WHERE id = $1 AND school_id = $2 RETURNING *`, [id, schoolId]
));

const getStatistics = (schoolId) => db.queryOne(
  `SELECT COUNT(*) AS total_students, COUNT(*) FILTER (WHERE is_active=true) AS active_students,
   COUNT(*) FILTER (WHERE status='ACTIVE') AS current_students,
   COUNT(*) FILTER (WHERE gender='MALE') AS male_students, COUNT(*) FILTER (WHERE gender='FEMALE') AS female_students,
   COUNT(*) FILTER (WHERE residence_type='BOARDING') AS boarding_students,
   COUNT(*) FILTER (WHERE residence_type='DAY') AS day_students,
   COUNT(*) FILTER (WHERE special_needs=true) AS special_needs_students,
   COUNT(DISTINCT class_id) AS classes_with_students FROM students WHERE school_id = $1`, [schoolId]
);

const getCountByClass = (schoolId) => db.queryAll(
  `SELECT c.id AS class_id, c.name AS class_name, c.grade_level,
   COUNT(s.id) AS student_count, COUNT(s.id) FILTER (WHERE s.gender='MALE') AS male_count,
   COUNT(s.id) FILTER (WHERE s.gender='FEMALE') AS female_count
   FROM classes c LEFT JOIN students s ON c.id=s.class_id AND s.is_active=true AND s.status='ACTIVE' AND s.school_id=$1
   WHERE c.school_id=$1 GROUP BY c.id,c.name,c.grade_level ORDER BY c.grade_level,c.name`, [schoolId]
);

const bulkCreate = async (studentsData, schoolId) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const created = [];
    for (const d of studentsData) {
      const r = await client.query(
        `INSERT INTO students (admission_no,first_name,last_name,middle_name,date_of_birth,gender,
         upi_number,birth_certificate_number,county,sub_county,special_needs,special_needs_category,
         class_id,admission_date,residence_type,status,school_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [d.admission_no,d.first_name,d.last_name,d.middle_name||null,d.date_of_birth,d.gender,
         d.upi_number||null,d.birth_certificate_number||null,d.county||null,d.sub_county||null,
         coerceBool(d.special_needs),d.special_needs_category||null,d.class_id,d.admission_date,
         d.residence_type||null,d.status||'ACTIVE',schoolId]
      );
      created.push(mapStudent(r.rows[0]));
    }
    await client.query('COMMIT');
    return created;
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};

const transferClass = async (schoolId, student_id, new_class_id) => mapStudent(await db.queryOne(
  `UPDATE students SET class_id=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND school_id=$3 RETURNING *`,
  [new_class_id, student_id, schoolId]
));

const admissionNumberExists = async (schoolId, admission_no, exclude_id=null) => {
  let q = `SELECT EXISTS(SELECT 1 FROM students WHERE admission_no=$1 AND school_id=$2`;
  const v = [admission_no, schoolId];
  if (exclude_id) { q += ` AND id!=$3`; v.push(exclude_id); }
  const r = await db.queryOne(q + `) AS exists`, v);
  return r.exists === true || r.exists === 'true';
};

const upiNumberExists = async (schoolId, upi_number, exclude_id=null) => {
  let q = `SELECT EXISTS(SELECT 1 FROM students WHERE upi_number=$1 AND school_id=$2`;
  const v = [upi_number, schoolId];
  if (exclude_id) { q += ` AND id!=$3`; v.push(exclude_id); }
  const r = await db.queryOne(q + `) AS exists`, v);
  return r.exists === true || r.exists === 'true';
};

module.exports = {
  create, findById, findByAdmissionNo, findByUPI, findAll, findByClass,
  update, softDelete, hardDelete, getStatistics, getCountByClass,
  bulkCreate, transferClass, admissionNumberExists, upiNumberExists
};