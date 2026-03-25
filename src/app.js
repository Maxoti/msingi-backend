const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const noCache = require('./shared/middleware/noCache');
const { authenticate } = require('./shared/middleware/auth');
const { errorHandler, notFound } = require('./shared/middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

const aiRoutes = require('../src/modules/artificial_Intelligence/ai.routes');

app.use('/api/ai', aiRoutes);
// Applies authenticate to ALL /api/v1 routes EXCEPT public auth endpoints
const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/webhooks',
  '/api/v1/health',
];

app.use('/api/v1', (req, res, next) => {
  const fullPath  = '/api/v1' + req.path;
  const isPublic  = PUBLIC_PATHS.some(p => fullPath.startsWith(p));
  if (isPublic) return next();
  return authenticate(req, res, next);
});

app.use('/api/v1', noCache);

// â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/health', async (req, res) => {
  const db = require('./shared/database/client');
  let dbStatus  = 'disconnected';
  let dbLatency = null;
  try {
    const start = Date.now();
    await db.query('SELECT 1');
    dbLatency = Date.now() - start;
    dbStatus  = 'connected';
  } catch { dbStatus = 'error'; }

  res.json({
    success: true,
    message: 'Msingi API is running',
    status:  { server: 'running', database: dbStatus, ...(dbLatency && { dbLatencyMs: dbLatency }) },
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const load = (path, mountPath, label) => {
  try {
    app.use(mountPath, require(path));
    console.log(` ${label} routes loaded`);
  } catch (e) {
    console.warn(`  ${label} routes not loaded:`, e.message);
  }
};

load('./modules/auth/auth.routes',             '/api/v1/auth',          'Auth');
app.use('/api/v1/users', require('./modules/auth/auth.routes')); // /api/v1/users/me alias

// Admin
try {
  const db = require('./shared/database/client');
  const { authorize } = require('./shared/middleware/auth');
  app.get('/api/v1/admin/users', authorize('ADMIN'), async (req, res, next) => {
    try {
      const result = await db.query(
        'SELECT id, username, email, role, is_active, created_at FROM users ORDER BY id DESC'
      );
      return res.status(200).json({ success: true, data: result.rows });
    } catch (e) { next(e); }
  });
  console.log(' Admin routes loaded');
} catch (e) { console.warn('  Admin routes not loaded:', e.message); }

load('./modules/students/students.routes',     '/api/v1/students',      'Students');
load('./modules/subjects/subjects.routes',     '/api/v1/subjects',      'Subjects');
load('./modules/staff/staff.routes',           '/api/v1/staff',         'Staff');
load('./modules/classes/classes.routes',       '/api/v1/classes',       'Classes');
load('./modules/notifications/notifications.routes', '/api/v1/notifications', 'Notifications');
load('./modules/notifications/sms.routes',     '/api/v1/sms',           'SMS');
load('./modules/attendance/attendance.routes', '/api/v1/attendance',    'Attendance');
load('./modules/mpesa/mpesa.routes',           '/api/v1/mpesa',         'M-Pesa');
load('./modules/webhooks/webhook.routes',      '/api/v1/webhooks',      'Webhooks');
load('./modules/fees/fees.routes',             '/api/v1/fees',          'Fees');
load('./modules/exams/exams.routes',           '/api/v1/exams',         'Exams');
load('./modules/terms/terms.routes',           '/api/v1/terms',         'Terms');
load('./modules/schools/schools.routes',       '/api/v1/schools',       'Schools');
load('./modules/timetable/timetable.routes',  '/api/v1/timetable',     'Timetable');
load('./modules/artificial_Intelligence/ai.routes', '/api/v1/ai', 'AI');

// â”€â”€ Error handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(notFound);
app.use(errorHandler);

module.exports = app;
