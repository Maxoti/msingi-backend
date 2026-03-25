-- ============================================================
-- MSINGI SCHOOL MANAGEMENT SYSTEM
-- Multitenant Migration — Row-Level Tenancy (Supabase / RLS)
-- ============================================================
-- Strategy: Single database, row-level isolation via school_id
-- Enforcement: Supabase Row Level Security (RLS) policies
-- Apply this AFTER your existing schema is in place.
-- ============================================================


-- ============================================================
-- STEP 1: CREATE THE ROOT TENANT TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS schools (
    id                  SERIAL PRIMARY KEY,

    -- Identity
    name                VARCHAR(200) NOT NULL,
    short_name          VARCHAR(50),                         -- e.g. "MPS" for Msingi Primary School
    slug                VARCHAR(100) UNIQUE NOT NULL,        -- URL-safe identifier, e.g. "msingi-primary"

    -- Contact
    email               VARCHAR(100),
    phone               VARCHAR(20),
    address             TEXT,
    county              VARCHAR(50),
    sub_county          VARCHAR(50),

    -- Official registration
    nemis_code          VARCHAR(50),
    registration_number VARCHAR(50),

    -- Subscription / plan management
    plan                VARCHAR(20)  NOT NULL DEFAULT 'FREE'
                            CHECK(plan IN ('FREE', 'BASIC', 'PRO', 'ENTERPRISE')),
    plan_expires_at     TIMESTAMP,
    max_students        INTEGER      DEFAULT 500,
    max_users           INTEGER      DEFAULT 10,

    -- M-Pesa (per-school, replaces school_config encrypted rows)
    mpesa_enabled       BOOLEAN      DEFAULT FALSE,
    mpesa_shortcode     VARCHAR(20),
    mpesa_consumer_key  VARCHAR(255),                        -- store encrypted at app layer
    mpesa_consumer_secret VARCHAR(255),
    mpesa_passkey       VARCHAR(255),
    mpesa_environment   VARCHAR(10)  DEFAULT 'sandbox'
                            CHECK(mpesa_environment IN ('sandbox', 'production')),

    -- SMS (per-school)
    sms_enabled         BOOLEAN      DEFAULT FALSE,
    sms_provider        VARCHAR(50)  DEFAULT 'mobiwave',
    sms_api_key         VARCHAR(255),
    sms_username        VARCHAR(100),
    sms_sender_id       VARCHAR(20)  DEFAULT 'SCHOOL',

    -- Status
    is_active           BOOLEAN      DEFAULT TRUE,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_schools_slug      ON schools(slug);
CREATE INDEX IF NOT EXISTS idx_schools_active    ON schools(is_active);
CREATE INDEX IF NOT EXISTS idx_schools_plan      ON schools(plan);

COMMENT ON TABLE  schools                    IS 'Root tenant table — one row per school';
COMMENT ON COLUMN schools.slug               IS 'Unique URL-safe identifier used in subdomains / API paths';
COMMENT ON COLUMN schools.plan               IS 'Subscription tier controlling feature access and limits';
COMMENT ON COLUMN schools.mpesa_consumer_key IS 'Encrypt at the application layer before storing';


-- ============================================================
-- STEP 2: ADD school_id TO EVERY TENANT TABLE
-- ============================================================
-- Each ALTER is wrapped so it only runs if the column is absent.
-- Adjust DEFAULT values for backfill — set to your seed school's id
-- then drop the default after migration is confirmed.
-- ============================================================

-- Helper: replace 1 with your initial/seed school's id if you have existing data
DO $$
DECLARE
    seed_school_id INTEGER := 1;  -- <-- change this if needed
BEGIN

    -- users
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='school_id') THEN
        ALTER TABLE users ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to users';
    END IF;

    -- staff
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='staff' AND column_name='school_id') THEN
        ALTER TABLE staff ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to staff';
    END IF;

    -- classes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='classes' AND column_name='school_id') THEN
        ALTER TABLE classes ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to classes';
    END IF;

    -- academic_terms
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='academic_terms' AND column_name='school_id') THEN
        ALTER TABLE academic_terms ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to academic_terms';
    END IF;

    -- students
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='students' AND column_name='school_id') THEN
        ALTER TABLE students ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to students';
    END IF;

    -- parent_contacts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='parent_contacts' AND column_name='school_id') THEN
        ALTER TABLE parent_contacts ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to parent_contacts';
    END IF;

    -- attendance
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='attendance' AND column_name='school_id') THEN
        ALTER TABLE attendance ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to attendance';
    END IF;

    -- fee_structures
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='fee_structures' AND column_name='school_id') THEN
        ALTER TABLE fee_structures ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to fee_structures';
    END IF;

    -- fee_categories
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='fee_categories' AND column_name='school_id') THEN
        ALTER TABLE fee_categories ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to fee_categories';
    END IF;

    -- invoices
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='invoices' AND column_name='school_id') THEN
        ALTER TABLE invoices ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to invoices';
    END IF;

    -- invoice_items (inherits via invoice_id but explicit column avoids joins in RLS)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='invoice_items' AND column_name='school_id') THEN
        ALTER TABLE invoice_items ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to invoice_items';
    END IF;

    -- payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='payments' AND column_name='school_id') THEN
        ALTER TABLE payments ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to payments';
    END IF;

    -- mpesa_transactions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='mpesa_transactions' AND column_name='school_id') THEN
        ALTER TABLE mpesa_transactions ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to mpesa_transactions';
    END IF;

    -- sms_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='sms_logs' AND column_name='school_id') THEN
        ALTER TABLE sms_logs ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to sms_logs';
    END IF;

    -- notification_queue
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='notification_queue' AND column_name='school_id') THEN
        ALTER TABLE notification_queue ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to notification_queue';
    END IF;

    -- subjects (shared catalog but allow per-school overrides)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='subjects' AND column_name='school_id') THEN
        ALTER TABLE subjects ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to subjects';
    END IF;

    -- exams
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exams' AND column_name='school_id') THEN
        ALTER TABLE exams ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to exams';
    END IF;

    -- exam_subjects
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exam_subjects' AND column_name='school_id') THEN
        ALTER TABLE exam_subjects ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to exam_subjects';
    END IF;

    -- exam_results
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exam_results' AND column_name='school_id') THEN
        ALTER TABLE exam_results ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to exam_results';
    END IF;

    -- exam_enrollments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='exam_enrollments' AND column_name='school_id') THEN
        ALTER TABLE exam_enrollments ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to exam_enrollments';
    END IF;

    -- event_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='event_logs' AND column_name='school_id') THEN
        ALTER TABLE event_logs ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added school_id to event_logs';
    END IF;

END $$;


-- ============================================================
-- STEP 3: ADD COMPOSITE INDEXES FOR PERFORMANCE
-- (school_id is the leading column for all tenant queries)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_school              ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_school              ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_classes_school            ON classes(school_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_school     ON academic_terms(school_id);
CREATE INDEX IF NOT EXISTS idx_students_school           ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_school_class     ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_students_school_status    ON students(school_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_contacts_school    ON parent_contacts(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date    ON attendance(school_id, date);
CREATE INDEX IF NOT EXISTS idx_fee_structures_school     ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_school           ON invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_school_status    ON invoices(school_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_school           ON payments(school_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_school              ON mpesa_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_school           ON sms_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_school ON notification_queue(school_id);
CREATE INDEX IF NOT EXISTS idx_subjects_school           ON subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_exams_school              ON exams(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_school       ON exam_results(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_enrollments_school   ON exam_enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_school         ON event_logs(school_id);

-- Fee structures: one fee type per class per term per school
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_structures_school_class_term_type 
ON fee_structures(school_id, class_id, term_id, fee_type);


-- ============================================================
-- STEP 4: school_id ON users — ENFORCE UNIQUENESS PER SCHOOL
-- ============================================================
-- The original schema has UNIQUE on username and email globally.
-- In a multitenant world, uniqueness should be per school.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_username ON users(school_id, username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_email    ON users(school_id, email);

-- Same for admission_no — unique per school, not globally
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_admission_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_school_admission ON students(school_id, admission_no);

-- Same for employee_number
ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_employee_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_school_employee ON staff(school_id, employee_number);

-- Same for class name
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_school_name ON classes(school_id, name);

-- Same for academic_terms year+term
ALTER TABLE academic_terms DROP CONSTRAINT IF EXISTS academic_terms_year_term_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_terms_school_year_term ON academic_terms(school_id, year, term);

-- Same for subjects name and code
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_key;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_school_name ON subjects(school_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_school_code ON subjects(school_id, code);

-- Same for fee_categories name
ALTER TABLE fee_categories DROP CONSTRAINT IF EXISTS fee_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_categories_school_name ON fee_categories(school_id, name);

-- Invoices: one invoice per student per term per school
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_student_id_term_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_school_student_term ON invoices(school_id, student_id, term_id);


-- ============================================================
-- STEP 5: USERS METADATA — link user to their school
-- ============================================================
-- We use Supabase auth.users for authentication.
-- This table maps auth.users.id → our users table → school.
-- If you're using Supabase auth, add this helper table:

CREATE TABLE IF NOT EXISTS user_school_memberships (
    id          SERIAL PRIMARY KEY,
    auth_uid    UUID        NOT NULL,           -- auth.users.id from Supabase
    user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id   INTEGER     NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL CHECK(role IN ('ADMIN', 'TEACHER', 'ACCOUNTANT', 'OWNER')),
    is_active   BOOLEAN     DEFAULT TRUE,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(auth_uid, school_id)
);

CREATE INDEX IF NOT EXISTS idx_user_memberships_auth    ON user_school_memberships(auth_uid);
CREATE INDEX IF NOT EXISTS idx_user_memberships_school  ON user_school_memberships(school_id);
CREATE INDEX IF NOT EXISTS idx_user_memberships_user    ON user_school_memberships(user_id);

COMMENT ON TABLE user_school_memberships IS
    'Maps Supabase auth users to internal users and their school. '
    'A user can belong to multiple schools (e.g. a consultant or owner of a chain).';


-- ============================================================
-- STEP 6: HELPER FUNCTION — get current user's school_id
-- ============================================================
-- Called inside every RLS policy. Reads from the JWT claims
-- or falls back to the memberships table.
-- Set app.current_school_id via: SET app.current_school_id = '3';
-- Or embed school_id in the JWT custom claims.

CREATE OR REPLACE FUNCTION current_school_id()
RETURNS INTEGER AS $$
BEGIN
    -- Option A: school_id embedded in Supabase JWT custom claims
    -- Requires you to set this in your auth hook / JWT template
    RETURN NULLIF(current_setting('request.jwt.claims', TRUE)::jsonb ->> 'school_id', '')::INTEGER;
EXCEPTION
    WHEN OTHERS THEN
        -- Option B: fall back to session variable set by your API layer
        RETURN NULLIF(current_setting('app.current_school_id', TRUE), '')::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_school_id IS
    'Returns the school_id of the currently authenticated user from JWT claims. '
    'Embed school_id in Supabase JWT custom claims for best performance.';


-- ============================================================
-- STEP 7: ENABLE ROW LEVEL SECURITY ON ALL TENANT TABLES
-- ============================================================

ALTER TABLE schools              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mpesa_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_subjects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results         ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_enrollments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_school_memberships ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 8: RLS POLICIES
-- ============================================================
-- Pattern used throughout:
--   SELECT / INSERT / UPDATE / DELETE policies check
--   that school_id = current_school_id().
--
-- Super-admin bypass is handled by a BYPASSRLS role or a
--   separate service_role key (Supabase default).
-- ============================================================

-- ---- schools -----------------------------------------------
-- A user can only see their own school(s).
DROP POLICY IF EXISTS schools_select ON schools;
CREATE POLICY schools_select ON schools
    FOR SELECT USING (
        id = current_school_id()
    );

-- Only platform admins (service_role) can INSERT / UPDATE schools.
-- No policy = no access for anon/authenticated roles.

-- ---- users -------------------------------------------------
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users
    FOR UPDATE USING (school_id = current_school_id());

DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users
    FOR DELETE USING (school_id = current_school_id());

-- ---- staff -------------------------------------------------
DROP POLICY IF EXISTS staff_select ON staff;
CREATE POLICY staff_select ON staff
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS staff_insert ON staff;
CREATE POLICY staff_insert ON staff
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS staff_update ON staff;
CREATE POLICY staff_update ON staff
    FOR UPDATE USING (school_id = current_school_id());

DROP POLICY IF EXISTS staff_delete ON staff;
CREATE POLICY staff_delete ON staff
    FOR DELETE USING (school_id = current_school_id());

-- ---- classes -----------------------------------------------
DROP POLICY IF EXISTS classes_select ON classes;
CREATE POLICY classes_select ON classes
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS classes_insert ON classes;
CREATE POLICY classes_insert ON classes
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS classes_update ON classes;
CREATE POLICY classes_update ON classes
    FOR UPDATE USING (school_id = current_school_id());

DROP POLICY IF EXISTS classes_delete ON classes;
CREATE POLICY classes_delete ON classes
    FOR DELETE USING (school_id = current_school_id());

-- ---- academic_terms ----------------------------------------
DROP POLICY IF EXISTS academic_terms_select ON academic_terms;
CREATE POLICY academic_terms_select ON academic_terms
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS academic_terms_insert ON academic_terms;
CREATE POLICY academic_terms_insert ON academic_terms
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS academic_terms_update ON academic_terms;
CREATE POLICY academic_terms_update ON academic_terms
    FOR UPDATE USING (school_id = current_school_id());

-- ---- students ----------------------------------------------
DROP POLICY IF EXISTS students_select ON students;
CREATE POLICY students_select ON students
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS students_insert ON students;
CREATE POLICY students_insert ON students
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS students_update ON students;
CREATE POLICY students_update ON students
    FOR UPDATE USING (school_id = current_school_id());

DROP POLICY IF EXISTS students_delete ON students;
CREATE POLICY students_delete ON students
    FOR DELETE USING (school_id = current_school_id());

-- ---- parent_contacts ---------------------------------------
DROP POLICY IF EXISTS parent_contacts_select ON parent_contacts;
CREATE POLICY parent_contacts_select ON parent_contacts
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS parent_contacts_insert ON parent_contacts;
CREATE POLICY parent_contacts_insert ON parent_contacts
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS parent_contacts_update ON parent_contacts;
CREATE POLICY parent_contacts_update ON parent_contacts
    FOR UPDATE USING (school_id = current_school_id());

DROP POLICY IF EXISTS parent_contacts_delete ON parent_contacts;
CREATE POLICY parent_contacts_delete ON parent_contacts
    FOR DELETE USING (school_id = current_school_id());

-- ---- attendance --------------------------------------------
DROP POLICY IF EXISTS attendance_select ON attendance;
CREATE POLICY attendance_select ON attendance
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS attendance_insert ON attendance;
CREATE POLICY attendance_insert ON attendance
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS attendance_update ON attendance;
CREATE POLICY attendance_update ON attendance
    FOR UPDATE USING (school_id = current_school_id());

-- ---- fee_structures ----------------------------------------
DROP POLICY IF EXISTS fee_structures_select ON fee_structures;
CREATE POLICY fee_structures_select ON fee_structures
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS fee_structures_insert ON fee_structures;
CREATE POLICY fee_structures_insert ON fee_structures
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS fee_structures_update ON fee_structures;
CREATE POLICY fee_structures_update ON fee_structures
    FOR UPDATE USING (school_id = current_school_id());

-- ---- fee_categories ----------------------------------------
DROP POLICY IF EXISTS fee_categories_select ON fee_categories;
CREATE POLICY fee_categories_select ON fee_categories
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS fee_categories_insert ON fee_categories;
CREATE POLICY fee_categories_insert ON fee_categories
    FOR INSERT WITH CHECK (school_id = current_school_id());

-- ---- invoices ----------------------------------------------
DROP POLICY IF EXISTS invoices_select ON invoices;
CREATE POLICY invoices_select ON invoices
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS invoices_insert ON invoices;
CREATE POLICY invoices_insert ON invoices
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS invoices_update ON invoices;
CREATE POLICY invoices_update ON invoices
    FOR UPDATE USING (school_id = current_school_id());

-- ---- invoice_items -----------------------------------------
DROP POLICY IF EXISTS invoice_items_select ON invoice_items;
CREATE POLICY invoice_items_select ON invoice_items
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS invoice_items_insert ON invoice_items;
CREATE POLICY invoice_items_insert ON invoice_items
    FOR INSERT WITH CHECK (school_id = current_school_id());

-- ---- payments ----------------------------------------------
DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS payments_insert ON payments;
CREATE POLICY payments_insert ON payments
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments
    FOR UPDATE USING (school_id = current_school_id());

-- ---- mpesa_transactions ------------------------------------
DROP POLICY IF EXISTS mpesa_transactions_select ON mpesa_transactions;
CREATE POLICY mpesa_transactions_select ON mpesa_transactions
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS mpesa_transactions_insert ON mpesa_transactions;
CREATE POLICY mpesa_transactions_insert ON mpesa_transactions
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS mpesa_transactions_update ON mpesa_transactions;
CREATE POLICY mpesa_transactions_update ON mpesa_transactions
    FOR UPDATE USING (school_id = current_school_id());

-- ---- sms_logs ----------------------------------------------
DROP POLICY IF EXISTS sms_logs_select ON sms_logs;
CREATE POLICY sms_logs_select ON sms_logs
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS sms_logs_insert ON sms_logs;
CREATE POLICY sms_logs_insert ON sms_logs
    FOR INSERT WITH CHECK (school_id = current_school_id());

-- ---- notification_queue ------------------------------------
DROP POLICY IF EXISTS notification_queue_select ON notification_queue;
CREATE POLICY notification_queue_select ON notification_queue
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS notification_queue_insert ON notification_queue;
CREATE POLICY notification_queue_insert ON notification_queue
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS notification_queue_update ON notification_queue;
CREATE POLICY notification_queue_update ON notification_queue
    FOR UPDATE USING (school_id = current_school_id());

-- ---- subjects ----------------------------------------------
DROP POLICY IF EXISTS subjects_select ON subjects;
CREATE POLICY subjects_select ON subjects
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS subjects_insert ON subjects;
CREATE POLICY subjects_insert ON subjects
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS subjects_update ON subjects;
CREATE POLICY subjects_update ON subjects
    FOR UPDATE USING (school_id = current_school_id());

-- ---- exams -------------------------------------------------
DROP POLICY IF EXISTS exams_select ON exams;
CREATE POLICY exams_select ON exams
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS exams_insert ON exams;
CREATE POLICY exams_insert ON exams
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS exams_update ON exams;
CREATE POLICY exams_update ON exams
    FOR UPDATE USING (school_id = current_school_id());

-- ---- exam_subjects -----------------------------------------
DROP POLICY IF EXISTS exam_subjects_select ON exam_subjects;
CREATE POLICY exam_subjects_select ON exam_subjects
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS exam_subjects_insert ON exam_subjects;
CREATE POLICY exam_subjects_insert ON exam_subjects
    FOR INSERT WITH CHECK (school_id = current_school_id());

-- ---- exam_results ------------------------------------------
DROP POLICY IF EXISTS exam_results_select ON exam_results;
CREATE POLICY exam_results_select ON exam_results
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS exam_results_insert ON exam_results;
CREATE POLICY exam_results_insert ON exam_results
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS exam_results_update ON exam_results;
CREATE POLICY exam_results_update ON exam_results
    FOR UPDATE USING (school_id = current_school_id());

-- ---- exam_enrollments --------------------------------------
DROP POLICY IF EXISTS exam_enrollments_select ON exam_enrollments;
CREATE POLICY exam_enrollments_select ON exam_enrollments
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS exam_enrollments_insert ON exam_enrollments;
CREATE POLICY exam_enrollments_insert ON exam_enrollments
    FOR INSERT WITH CHECK (school_id = current_school_id());

DROP POLICY IF EXISTS exam_enrollments_update ON exam_enrollments;
CREATE POLICY exam_enrollments_update ON exam_enrollments
    FOR UPDATE USING (school_id = current_school_id());

-- ---- event_logs --------------------------------------------
DROP POLICY IF EXISTS event_logs_select ON event_logs;
CREATE POLICY event_logs_select ON event_logs
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS event_logs_insert ON event_logs;
CREATE POLICY event_logs_insert ON event_logs
    FOR INSERT WITH CHECK (school_id = current_school_id());

-- ---- user_school_memberships --------------------------------
DROP POLICY IF EXISTS memberships_select ON user_school_memberships;
CREATE POLICY memberships_select ON user_school_memberships
    FOR SELECT USING (school_id = current_school_id());

DROP POLICY IF EXISTS memberships_insert ON user_school_memberships;
CREATE POLICY memberships_insert ON user_school_memberships
    FOR INSERT WITH CHECK (school_id = current_school_id());


-- ============================================================
-- STEP 9: UPDATE VIEWS TO INCLUDE school_id FILTER
-- ============================================================

CREATE OR REPLACE VIEW student_parent_contacts AS
SELECT
    s.id           AS student_id,
    s.school_id,
    s.admission_no,
    s.first_name,
    s.last_name,
    s.class_id,
    c.name         AS class_name,
    pc.id          AS parent_id,
    pc.name        AS parent_name,
    pc.phone       AS parent_phone,
    pc.relationship,
    pc.is_primary
FROM students s
JOIN classes c        ON s.class_id = c.id
LEFT JOIN parent_contacts pc ON s.id = pc.student_id
WHERE s.is_active = TRUE;
-- RLS on students and parent_contacts handles school filtering automatically.

CREATE OR REPLACE VIEW fee_balances AS
SELECT
    i.id           AS invoice_id,
    i.school_id,
    i.student_id,
    s.admission_no,
    s.first_name || ' ' || s.last_name AS student_name,
    c.name         AS class_name,
    t.year,
    t.term,
    i.total_amount,
    COALESCE(SUM(p.amount), 0)                              AS paid_amount,
    i.total_amount - COALESCE(SUM(p.amount), 0)            AS balance,
    i.status,
    pc.phone       AS parent_phone,
    pc.name        AS parent_name
FROM invoices i
JOIN students s       ON i.student_id = s.id
JOIN classes c        ON s.class_id = c.id
JOIN academic_terms t ON i.term_id = t.id
LEFT JOIN payments p  ON i.id = p.invoice_id
LEFT JOIN parent_contacts pc ON s.id = pc.student_id AND pc.is_primary = TRUE
GROUP BY i.id, i.school_id, s.id, s.admission_no, s.first_name, s.last_name,
         c.name, t.year, t.term, i.status, pc.phone, pc.name;

CREATE OR REPLACE VIEW pending_mpesa_transactions AS
SELECT
    mt.id,
    mt.school_id,
    mt.transaction_id,
    mt.mpesa_receipt_number,
    mt.phone_number,
    mt.amount,
    mt.account_reference,
    mt.transaction_date,
    mt.status,
    s.id           AS student_id,
    s.admission_no,
    s.first_name || ' ' || s.last_name AS student_name
FROM mpesa_transactions mt
LEFT JOIN students s ON mt.account_reference = s.admission_no
                     AND s.school_id = mt.school_id   -- scoped join
WHERE mt.status IN ('PENDING', 'COMPLETED')
  AND mt.reconciled_at IS NULL
ORDER BY mt.transaction_date DESC;


-- ============================================================
-- STEP 10: UPDATE TRIGGER FUNCTION — auto-stamp school_id
-- ============================================================
-- This trigger auto-populates school_id on INSERT so your
-- application code doesn't have to remember it on every query.

CREATE OR REPLACE FUNCTION stamp_school_id()
RETURNS TRIGGER AS $$
DECLARE
    v_school_id INTEGER;
BEGIN
    v_school_id := current_school_id();
    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'school_id could not be determined from session context';
    END IF;
    NEW.school_id := v_school_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tenant tables (add more as needed)
DO $$
DECLARE
    tbl TEXT;
    tbls TEXT[] := ARRAY[
        'users','staff','classes','academic_terms','students',
        'parent_contacts','attendance','fee_structures','fee_categories',
        'invoices','invoice_items','payments','mpesa_transactions',
        'sms_logs','notification_queue','subjects','exams',
        'exam_subjects','exam_results','exam_enrollments','event_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_stamp_school ON %s', tbl, tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_%s_stamp_school
             BEFORE INSERT ON %s
             FOR EACH ROW
             WHEN (NEW.school_id IS NULL)
             EXECUTE FUNCTION stamp_school_id()',
            tbl, tbl
        );
    END LOOP;
END $$;


-- ============================================================
-- STEP 11: SEED — INSERT YOUR FIRST SCHOOL
-- ============================================================
-- Run this once after applying the migration.
-- Then backfill school_id = 1 on all existing rows.

INSERT INTO schools (name, short_name, slug, email, phone, plan)
VALUES ('Msingi School', 'MS', 'msingi-school', 'info@msingi.school', '254700000000', 'PRO')
ON CONFLICT (slug) DO NOTHING;

-- Backfill existing rows (run once, then the trigger handles new inserts)
-- Adjust the school id (1) if your seed school got a different id.
/*
UPDATE users              SET school_id = 1 WHERE school_id IS NULL;
UPDATE staff              SET school_id = 1 WHERE school_id IS NULL;
UPDATE classes            SET school_id = 1 WHERE school_id IS NULL;
UPDATE academic_terms     SET school_id = 1 WHERE school_id IS NULL;
UPDATE students           SET school_id = 1 WHERE school_id IS NULL;
UPDATE parent_contacts    SET school_id = 1 WHERE school_id IS NULL;
UPDATE attendance         SET school_id = 1 WHERE school_id IS NULL;
UPDATE fee_structures     SET school_id = 1 WHERE school_id IS NULL;
UPDATE fee_categories     SET school_id = 1 WHERE school_id IS NULL;
UPDATE invoices           SET school_id = 1 WHERE school_id IS NULL;
UPDATE invoice_items      SET school_id = 1 WHERE school_id IS NULL;
UPDATE payments           SET school_id = 1 WHERE school_id IS NULL;
UPDATE mpesa_transactions SET school_id = 1 WHERE school_id IS NULL;
UPDATE sms_logs           SET school_id = 1 WHERE school_id IS NULL;
UPDATE notification_queue SET school_id = 1 WHERE school_id IS NULL;
UPDATE subjects           SET school_id = 1 WHERE school_id IS NULL;
UPDATE exams              SET school_id = 1 WHERE school_id IS NULL;
UPDATE exam_subjects      SET school_id = 1 WHERE school_id IS NULL;
UPDATE exam_results       SET school_id = 1 WHERE school_id IS NULL;
UPDATE exam_enrollments   SET school_id = 1 WHERE school_id IS NULL;
UPDATE event_logs         SET school_id = 1 WHERE school_id IS NULL;

-- After backfill, enforce NOT NULL
ALTER TABLE users              ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE staff              ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE classes            ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE academic_terms     ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE students           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE parent_contacts    ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE attendance         ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE fee_structures     ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE fee_categories     ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE invoices           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE invoice_items      ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE payments           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE mpesa_transactions ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE sms_logs           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE notification_queue ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE subjects           ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE exams              ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE exam_subjects      ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE exam_results       ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE exam_enrollments   ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE event_logs         ALTER COLUMN school_id SET NOT NULL;
*/


-- ============================================================
-- APPLICATION LAYER CHECKLIST
-- ============================================================
--
-- 1. JWT CUSTOM CLAIMS
--    After login, embed school_id in the Supabase JWT:
--    { "school_id": 3, "role": "TEACHER" }
--    Configure this in: Authentication → Hooks → Custom JWT claims
--
-- 2. API MIDDLEWARE
--    Every API request must resolve school_id from:
--    a) JWT claim  (preferred — zero DB hit)
--    b) Subdomain  (e.g. school-a.msingi.app → slug → school_id)
--    c) Request header X-School-ID (internal services only)
--
-- 3. ALL INSERTS must include school_id
--    The stamp_school_id() trigger is a safety net, not a substitute.
--    Explicitly set school_id in every INSERT statement.
--
-- 4. SCHOOL REGISTRATION FLOW
--    a) Create row in schools table (service_role only)
--    b) Create first ADMIN user in users table
--    c) Create user_school_memberships row linking auth.uid → school
--    d) Provision default subjects, fee_categories, etc. for the school
--
-- 5. SUPER-ADMIN DASHBOARD
--    Use the Supabase service_role key (bypasses RLS) for:
--    - Platform analytics across all schools
--    - Billing management
--    - School provisioning / deactivation
--    Never expose the service_role key to the frontend.
--
-- 6. OLD school_config TABLE
--    The schools table now holds per-school config (M-Pesa, SMS).
--    You can DROP the old school_config table or keep it for
--    global platform settings (e.g. platform name, support email).

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================