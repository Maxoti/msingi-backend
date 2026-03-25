/**
 * Test Helpers
 * Centralized utilities for test setup and teardown.
 *
 * MULTI-TENANT DESIGN NOTES
 * ─────────────────────────
 * Every public table carries a school_id FK → schools(id).
 * A BEFORE INSERT trigger (stamp_school_id) fires when school_id IS NULL and
 * tries to read it from the JWT / session variable — which doesn't exist in
 * tests. We therefore always pass school_id explicitly so the trigger is
 * never invoked.
 *
 * Unique constraints are composite per school, e.g.
 *   (school_id, username), (school_id, admission_no), (school_id, year, term)
 * so ON CONFLICT (username) would always fail. We use DELETE → INSERT instead.
 *
 * DEPENDENCY ORDER (outermost → innermost)
 * ─────────────────────────────────────────
 *   schools
 *   └── users
 *   └── classes
 *   └── academic_terms
 *       ├── invoices  (RESTRICT)  → invoice_items, payments  (CASCADE)
 *       └── exams     (RESTRICT)  → exam_subjects, exam_results, exam_enrollments (CASCADE)
 *   └── students  (needs class_id)
 *       └── invoices (needs student_id + term_id)
 */

'use strict';

const db     = require('../../src/shared/database/client');
const bcrypt = require('bcrypt');

// db.queryOne, db.queryAll, db.queryCount, db.transaction are all available
// from client.js — no local wrappers needed.

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Delete all rows that reference a set of academic_term IDs via ON DELETE RESTRICT
 * before the term row itself can be deleted.
 *
 * RESTRICT tables (must be manually deleted first):
 *   - invoices  (invoices_term_id_fkey)
 *   - exams     (exams_term_id_fkey)
 *
 * CASCADE tables cleaned up automatically when parent rows are deleted:
 *   - invoice_items, payments           → cascade from invoices
 *   - exam_subjects, exam_results,
 *     exam_enrollments                  → cascade from exams
 */
async function _clearTermDependencies(schoolId, year, term) {
  await db.query(
    `DELETE FROM invoices
     WHERE term_id IN (
       SELECT id FROM academic_terms
       WHERE school_id = $1 AND year = $2 AND term = $3
     )`,
    [schoolId, year, term]
  );
  await db.query(
    `DELETE FROM exams
     WHERE term_id IN (
       SELECT id FROM academic_terms
       WHERE school_id = $1 AND year = $2 AND term = $3
     )`,
    [schoolId, year, term]
  );
}

// ─── School ──────────────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test school row.
 * The schools table is the root tenant — everything else hangs off it.
 *
 * @param {string} slug   - URL-safe unique identifier, e.g. 'test-school'
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {Promise<object>} The inserted school row.
 */
async function createTestSchool(slug, opts = {}) {
  const { name = 'Test School' } = opts;

  try {
    await db.query('DELETE FROM schools WHERE slug = $1', [slug]);

    return await db.queryOne(
      `INSERT INTO schools (name, slug, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING *`,
      [name, slug]
    );
  } catch (error) {
    console.error(`Failed to create test school "${slug}":`, error.message);
    throw error;
  }
}

// ─── Users ───────────────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test user scoped to a school.
 *
 * @param {number} schoolId
 * @param {string} username
 * @param {string} email
 * @param {string} password   - plain-text; will be hashed
 * @param {string} [role]     - 'ADMIN' | 'TEACHER' | 'ACCOUNTANT'
 * @returns {Promise<object>}
 */
async function createTestUser(schoolId, username, email, password, role = 'ADMIN') {
  try {
    // Composite unique indexes: (school_id, username) and (school_id, email)
    await db.query(
      'DELETE FROM users WHERE school_id = $1 AND (username = $2 OR email = $3)',
      [schoolId, username, email]
    );

    const passwordHash = await bcrypt.hash(password, 10);

    return await db.queryOne(
      `INSERT INTO users (school_id, username, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, school_id, username, email, role, is_active`,
      [schoolId, username, email, passwordHash, role]
    );
  } catch (error) {
    console.error(`Failed to create test user "${username}":`, error.message);
    throw error;
  }
}

// ─── Classes ─────────────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test class scoped to a school.
 *
 * @param {number} schoolId
 * @param {string} name
 * @param {number} gradeLevel
 * @param {number} [capacity]
 * @returns {Promise<object>}
 */
async function createTestClass(schoolId, name, gradeLevel, capacity = 40) {
  try {
    // Must remove students first — students.class_id has ON DELETE RESTRICT
    await db.query(
      `DELETE FROM students
       WHERE class_id IN (
         SELECT id FROM classes WHERE school_id = $1 AND name = $2
       )`,
      [schoolId, name]
    );
    await db.query(
      'DELETE FROM classes WHERE school_id = $1 AND name = $2',
      [schoolId, name]
    );

    return await db.queryOne(
      `INSERT INTO classes (school_id, name, grade_level, capacity)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [schoolId, name, gradeLevel, capacity]
    );
  } catch (error) {
    console.error(`Failed to create test class "${name}":`, error.message);
    throw error;
  }
}

// ─── Academic terms ───────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test academic term scoped to a school.
 *
 * @param {number} schoolId
 * @param {number} year
 * @param {number} term        - 1 | 2 | 3
 * @param {string} startDate   - 'YYYY-MM-DD'
 * @param {string} endDate     - 'YYYY-MM-DD'
 * @returns {Promise<object>}
 */
async function createTestTerm(schoolId, year, term, startDate, endDate) {
  try {
    await _clearTermDependencies(schoolId, year, term);
    await db.query(
      'DELETE FROM academic_terms WHERE school_id = $1 AND year = $2 AND term = $3',
      [schoolId, year, term]
    );

    return await db.queryOne(
      `INSERT INTO academic_terms (school_id, year, term, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [schoolId, year, term, startDate, endDate]
    );
  } catch (error) {
    console.error(`Failed to create test term ${year}-${term}:`, error.message);
    throw error;
  }
}

// ─── Students ─────────────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test student scoped to a school.
 *
 * @param {number} schoolId
 * @param {string} admissionNo
 * @param {string} firstName
 * @param {string} lastName
 * @param {number} classId
 * @param {object} [opts]
 * @param {string} [opts.gender]         - 'MALE' | 'FEMALE'
 * @param {string} [opts.dateOfBirth]    - 'YYYY-MM-DD'
 * @param {string} [opts.admissionDate]  - 'YYYY-MM-DD'
 * @returns {Promise<object>}
 */
async function createTestStudent(
  schoolId, admissionNo, firstName, lastName, classId, opts = {}
) {
  const {
    gender        = 'MALE',
    dateOfBirth   = '2010-01-01',
    admissionDate = new Date().toISOString().split('T')[0],
  } = opts;

  try {
    await db.query(
      'DELETE FROM students WHERE school_id = $1 AND admission_no = $2',
      [schoolId, admissionNo]
    );

    return await db.queryOne(
      `INSERT INTO students
         (school_id, admission_no, first_name, last_name, gender,
          date_of_birth, admission_date, class_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING *`,
      [schoolId, admissionNo, firstName, lastName,
       gender, dateOfBirth, admissionDate, classId]
    );
  } catch (error) {
    console.error(`Failed to create test student "${admissionNo}":`, error.message);
    throw error;
  }
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * Create (or recreate) a test invoice for a student + term.
 * Existing invoice items and payments are removed first (CASCADE handles items
 * and payments when the invoice is deleted).
 *
 * @param {number}   schoolId
 * @param {number}   studentId
 * @param {number}   termId
 * @param {number}   totalAmount
 * @param {Array<{description: string, amount: number}>} [items]
 * @returns {Promise<object>} The inserted invoice row.
 */
async function createTestInvoice(schoolId, studentId, termId, totalAmount, items = []) {
  try {
    // Unique index: (school_id, student_id, term_id)
    const existing = await db.queryOne(
      'SELECT id FROM invoices WHERE school_id = $1 AND student_id = $2 AND term_id = $3',
      [schoolId, studentId, termId]
    );

    if (existing) {
      // invoice_items and payments cascade from invoices on delete
      await db.query('DELETE FROM invoices WHERE id = $1', [existing.id]);
    }

    const invoice = await db.queryOne(
      `INSERT INTO invoices (school_id, student_id, term_id, total_amount, status, due_date)
       VALUES ($1, $2, $3, $4, 'UNPAID', CURRENT_DATE + INTERVAL '30 days')
       RETURNING *`,
      [schoolId, studentId, termId, totalAmount]
    );

    for (const item of items) {
      await db.query(
        `INSERT INTO invoice_items (school_id, invoice_id, description, amount)
         VALUES ($1, $2, $3, $4)`,
        [schoolId, invoice.id, item.description, item.amount]
      );
    }

    return invoice;
  } catch (error) {
    console.error('Failed to create test invoice:', error.message);
    throw error;
  }
}

// ─── Auth token ──────────────────────────────────────────────────────────────

/**
 * Log in via the API and return a Bearer token.
 *
 * @param {object} app      - Express / supertest-compatible app
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string>} JWT token (without "Bearer " prefix)
 */
async function getAuthToken(app, username, password) {
  const request = require('supertest');

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });

  if (!response.body.data?.token) {
    throw new Error(
      `Login failed for "${username}": ${JSON.stringify(response.body)}`
    );
  }

  return response.body.data.token;
}

// ─── Full setup ───────────────────────────────────────────────────────────────

/**
 * Bootstrap a complete test environment in one call.
 * Creates: school → user → class → term → student → invoice.
 *
 * All identifiers are scoped to the created school so parallel test suites
 * using different slugs will not collide.
 *
 * @param {object} [opts]
 * @param {string} [opts.schoolSlug]          - default 'test-school'
 * @param {string} [opts.schoolName]          - default 'Test School'
 * @param {string} [opts.userPrefix]          - username prefix, default 'testadmin'
 * @param {string} [opts.userPassword]        - default 'test123'
 * @param {string} [opts.userRole]            - default 'ADMIN'
 * @param {string} [opts.className]           - default 'Test Class'
 * @param {number} [opts.gradeLevel]          - default 6
 * @param {string} [opts.studentAdmissionNo]  - default 'TEST001'
 * @param {number} [opts.invoiceAmount]       - default 20000
 * @param {number} [opts.year]                - default 2024
 * @param {number} [opts.term]                - default 1
 * @returns {Promise<{school, user, class: testClass, term, student, invoice}>}
 */
async function createFullTestSetup(opts = {}) {
  const {
    schoolSlug         = 'test-school',
    schoolName         = 'Test School',
    userPrefix         = 'testadmin',
    userPassword       = 'test123',
    userRole           = 'ADMIN',
    className          = 'Test Class',
    gradeLevel         = 6,
    studentAdmissionNo = 'TEST001',
    invoiceAmount      = 20000,
    year               = 2024,
    term               = 1,
  } = opts;

  const school = await createTestSchool(schoolSlug, { name: schoolName });

  const user = await createTestUser(
    school.id,
    userPrefix,
    `${userPrefix}@test.com`,
    userPassword,
    userRole
  );

  const testClass = await createTestClass(school.id, className, gradeLevel);

  const testTerm = await createTestTerm(
    school.id,
    year,
    term,
    `${year}-01-01`,
    `${year}-04-30`
  );

  const student = await createTestStudent(
    school.id,
    studentAdmissionNo,
    'Test',
    'Student',
    testClass.id
  );

  const invoice = await createTestInvoice(
    school.id,
    student.id,
    testTerm.id,
    invoiceAmount,
    [
      { description: 'Tuition Fee',   amount: 15000 },
      { description: 'Activity Fee',  amount: 3000  },
      { description: 'Transport Fee', amount: 2000  },
    ]
  );

  return {
    school,
    user,
    class: testClass,
    term:  testTerm,
    student,
    invoice,
  };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Remove test data by pattern after a test suite completes.
 * Failures are logged but not re-thrown so they don't mask real test failures.
 *
 * @param {number}   schoolId  - Scope all deletes to this school.
 * @param {object}  [patterns]
 * @param {string[]} [patterns.students]  - admission_no LIKE patterns
 * @param {string[]} [patterns.classes]   - name LIKE patterns
 * @param {Array<[number, number]>} [patterns.terms]  - [[year, term], …]
 * @param {string[]} [patterns.users]     - username / email LIKE patterns
 * @param {string[]} [patterns.mpesa]     - transaction_id / receipt LIKE patterns
 */
async function cleanupTestData(schoolId, patterns = {}) {
  try {
    if (patterns.students) {
      for (const pattern of patterns.students) {
        await db.query(
          'DELETE FROM students WHERE school_id = $1 AND admission_no LIKE $2',
          [schoolId, pattern]
        );
      }
    }

    if (patterns.classes) {
      for (const pattern of patterns.classes) {
        // Students must go first (RESTRICT FK on class_id)
        await db.query(
          `DELETE FROM students
           WHERE school_id = $1
             AND class_id IN (
               SELECT id FROM classes WHERE school_id = $1 AND name LIKE $2
             )`,
          [schoolId, pattern]
        );
        await db.query(
          'DELETE FROM classes WHERE school_id = $1 AND name LIKE $2',
          [schoolId, pattern]
        );
      }
    }

    if (patterns.terms) {
      for (const [year, term] of patterns.terms) {
        await _clearTermDependencies(schoolId, year, term);
        await db.query(
          'DELETE FROM academic_terms WHERE school_id = $1 AND year = $2 AND term = $3',
          [schoolId, year, term]
        );
      }
    }

    if (patterns.users) {
      for (const pattern of patterns.users) {
        await db.query(
          `DELETE FROM users
           WHERE school_id = $1 AND (username LIKE $2 OR email LIKE $2)`,
          [schoolId, pattern]
        );
      }
    }

    if (patterns.mpesa) {
      for (const pattern of patterns.mpesa) {
        await db.query(
          `DELETE FROM mpesa_transactions
           WHERE school_id = $1
             AND (transaction_id LIKE $2 OR mpesa_receipt_number LIKE $2)`,
          [schoolId, pattern]
        );
      }
    }
  } catch (error) {
    // Cleanup failures should not break tests
    console.error('Cleanup failed:', error.message);
  }
}

/**
 * Tear down an entire test school and all its data in one call.
 * Because schools.id is the root FK with ON DELETE CASCADE, deleting the
 * school row removes everything beneath it automatically.
 *
 * Use this in afterAll() for full isolation between suites.
 *
 * @param {string} schoolSlug
 */
async function destroyTestSchool(schoolSlug) {
  try {
    await db.query('DELETE FROM schools WHERE slug = $1', [schoolSlug]);
  } catch (error) {
    console.error(`Failed to destroy test school "${schoolSlug}":`, error.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createTestSchool,
  createTestUser,
  createTestClass,
  createTestTerm,
  createTestStudent,
  createTestInvoice,
  getAuthToken,
  createFullTestSetup,
  cleanupTestData,
  destroyTestSchool,
};