'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ============================================================
// HELPERS
// ============================================================

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function buildWhereClause(query, allowedFilters, startIndex = 1) {
  const conditions = [];
  const values = [];
  let paramIndex = startIndex;

  for (const [key, column] of Object.entries(allowedFilters)) {
    if (query[key] !== undefined && query[key] !== '') {
      conditions.push(`${column} = $${paramIndex}`);
      values.push(query[key]);
      paramIndex++;
    }
  }

  if (query.from_date) {
    conditions.push(`created_at >= $${paramIndex}`);
    values.push(new Date(query.from_date));
    paramIndex++;
  }
  if (query.to_date) {
    conditions.push(`created_at <= $${paramIndex}`);
    values.push(new Date(query.to_date));
    paramIndex++;
  }

  const clause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  return { clause, values, paramIndex };
}

function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

const VALID_NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'CANCELLED'];
const VALID_SMS_STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED'];

// ============================================================
// NOTIFICATION QUEUE — CRUD
// ============================================================

const createNotification = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const {
    type, recipient, subject, message, priority,
    scheduled_for, student_id, related_entity_type, related_entity_id,
  } = req.body;

  if (!type || !['SMS', 'EMAIL'].includes(type)) {
    return res.status(400).json({ success: false, message: 'type is required and must be SMS or EMAIL.' });
  }
  if (!recipient || typeof recipient !== 'string' || recipient.trim() === '') {
    return res.status(400).json({ success: false, message: 'recipient is required.' });
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ success: false, message: 'message is required.' });
  }
  if (type === 'EMAIL' && (!subject || subject.trim() === '')) {
    return res.status(400).json({ success: false, message: 'subject is required for EMAIL notifications.' });
  }
  if (student_id !== undefined && student_id !== null) {
    const studentCheck = await pool.query(
      'SELECT id FROM students WHERE id = $1 AND school_id = $2',
      [student_id, schoolId]
    );
    if (studentCheck.rowCount === 0) {
      return res.status(400).json({ success: false, message: 'The specified student_id does not exist.' });
    }
  }

  const result = await pool.query(
    `INSERT INTO notification_queue (
      type, recipient, subject, message, priority, scheduled_for,
      status, attempts, max_attempts, student_id,
      related_entity_type, related_entity_id, school_id, created_at
    ) VALUES (
      $1, $2, $3, $4,
      COALESCE($5, 5),
      COALESCE($6, CURRENT_TIMESTAMP),
      'PENDING', 0, 3, $7, $8, $9, $10, CURRENT_TIMESTAMP
    ) RETURNING *`,
    [
      type, recipient.trim(), subject ? subject.trim() : null, message.trim(),
      priority !== undefined ? priority : null, scheduled_for || null,
      student_id || null, related_entity_type || null, related_entity_id || null,
      schoolId,
    ]
  );

  res.status(201).json({ success: true, message: 'Notification queued successfully.', data: result.rows[0] });
});


const getNotifications = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;

  if (req.query.status && !VALID_NOTIFICATION_STATUSES.includes(req.query.status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  const { page, limit, offset } = parsePagination(req.query);

  const allowedSortColumns = {
    id: 'id', created_at: 'created_at', scheduled_for: 'scheduled_for',
    priority: 'priority', status: 'status',
  };
  const sortBy = allowedSortColumns[req.query.sort_by] || 'created_at';
  const sortOrder = req.query.sort_order === 'ASC' ? 'ASC' : 'DESC';

  const allowedFilters = {
    type: 'type', status: 'status',
    student_id: 'student_id', related_entity_type: 'related_entity_type',
  };

  // Start param index at 2 since $1 is reserved for school_id
  const { clause, values, paramIndex } = buildWhereClause(req.query, allowedFilters, 2);

  const schoolClause = clause
    ? clause + ' AND school_id = $1'
    : 'WHERE school_id = $1';
  const allValues = [schoolId, ...values];

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM notification_queue ${schoolClause}`, allValues
  );
  const total = countResult.rows[0].total;

  const dataValues = [...allValues, limit, offset];
  const result = await pool.query(
    `SELECT * FROM notification_queue ${schoolClause}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataValues
  );

  res.status(200).json({
    success: true,
    data: result.rows,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
  });
});


const getNotificationById = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;

  if (isNaN(parseInt(id)) || parseInt(id) <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid notification ID. Must be a positive integer.' });
  }

  const result = await pool.query(
    'SELECT * FROM notification_queue WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }

  res.status(200).json({ success: true, data: result.rows[0] });
});


const updateNotification = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;
  const { status, scheduled_for, priority, message, subject } = req.body;

  const existing = await pool.query(
    'SELECT * FROM notification_queue WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );
  if (existing.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }

  const notification = existing.rows[0];

  if (notification.status !== 'PENDING') {
    return res.status(400).json({
      success: false,
      message: `Cannot modify a notification in '${notification.status}' status. Only PENDING notifications can be updated.`,
    });
  }

  if (status !== undefined && status !== 'FAILED') {
    return res.status(400).json({
      success: false,
      message: "You can only cancel a notification by setting status to 'FAILED'.",
    });
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (status !== undefined) {
    updates.push(`status = $${paramIndex}`); values.push('FAILED'); paramIndex++;
    updates.push(`processed_at = CURRENT_TIMESTAMP`);
    updates.push(`error_message = 'Manually cancelled'`);
  }
  if (scheduled_for !== undefined) {
    updates.push(`scheduled_for = $${paramIndex}`); values.push(new Date(scheduled_for)); paramIndex++;
  }
  if (priority !== undefined) {
    updates.push(`priority = $${paramIndex}`); values.push(priority); paramIndex++;
  }
  if (message !== undefined) {
    updates.push(`message = $${paramIndex}`); values.push(message.trim()); paramIndex++;
  }
  if (subject !== undefined) {
    updates.push(`subject = $${paramIndex}`); values.push(subject.trim()); paramIndex++;
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one field is required' });
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id, schoolId);

  const result = await pool.query(
    `UPDATE notification_queue SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1}
     RETURNING *`,
    values
  );

  res.status(200).json({ success: true, message: 'Notification updated successfully.', data: result.rows[0] });
});


const deleteNotification = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;

  const existing = await pool.query(
    'SELECT status FROM notification_queue WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );

  if (existing.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }

  const { status } = existing.rows[0];
  if (status !== 'PENDING' && status !== 'FAILED') {
    return res.status(400).json({
      success: false,
      message: `Cannot delete a notification in '${status}' status. Only PENDING or FAILED notifications can be deleted.`,
    });
  }

  await pool.query(
    'DELETE FROM notification_queue WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );
  res.status(200).json({ success: true, message: 'Notification deleted successfully.' });
});


// ============================================================
// NOTIFICATION QUEUE — RETRY LOGIC
// ============================================================

const retryNotification = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;

  const existing = await pool.query(
    'SELECT * FROM notification_queue WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );

  if (existing.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Notification not found.' });
  }

  const notification = existing.rows[0];
  if (notification.status !== 'FAILED') {
    return res.status(400).json({
      success: false,
      message: `Cannot retry a notification in '${notification.status}' status. Only FAILED notifications can be retried.`,
    });
  }

  const result = await pool.query(
    `UPDATE notification_queue
     SET status = 'PENDING', attempts = attempts + 1, error_message = NULL, processed_at = NULL
     WHERE id = $1 AND school_id = $2
     RETURNING *`,
    [id, schoolId]
  );

  res.status(200).json({ success: true, message: 'Notification has been re-queued for retry.', data: result.rows[0] });
});


const retryAllFailedNotifications = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { student_id, related_entity_type } = req.body || {};

  const conditions = ["status = 'FAILED'", `school_id = $1`];
  const values = [schoolId];
  let paramIndex = 2;

  if (student_id) {
    conditions.push(`student_id = $${paramIndex}`); values.push(student_id); paramIndex++;
  }
  if (related_entity_type) {
    conditions.push(`related_entity_type = $${paramIndex}`); values.push(related_entity_type); paramIndex++;
  }

  const whereClause = 'WHERE ' + conditions.join(' AND ');

  const result = await pool.query(
    `UPDATE notification_queue
     SET status = 'PENDING', attempts = attempts + 1, error_message = NULL, processed_at = NULL
     ${whereClause} RETURNING id`,
    values
  );

  res.status(200).json({
    success: true,
    message: `${result.rowCount} failed notification(s) re-queued for retry.`,
    data: { retried_count: result.rowCount, retried_ids: result.rows.map(r => r.id) },
  });
});


// ============================================================
// NOTIFICATION QUEUE — STATS
// ============================================================

const getNotificationStats = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;

  const [statusStats, typeStats, todayStats, avgAttempts] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM notification_queue WHERE school_id = $1
       GROUP BY status ORDER BY status`,
      [schoolId]
    ),
    pool.query(
      `SELECT type, COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END)::int AS sent,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::int AS pending
       FROM notification_queue WHERE school_id = $1
       GROUP BY type ORDER BY type`,
      [schoolId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_today,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END)::int AS sent_today,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed_today,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END)::int AS pending_today
       FROM notification_queue WHERE school_id = $1 AND created_at >= CURRENT_DATE`,
      [schoolId]
    ),
    pool.query(
      `SELECT COALESCE(AVG(attempts), 0)::numeric(4,2) AS avg_attempts_on_failure
       FROM notification_queue WHERE school_id = $1 AND status = 'FAILED'`,
      [schoolId]
    ),
  ]);

  res.status(200).json({
    success: true,
    data: {
      by_status: statusStats.rows,
      by_type: typeStats.rows,
      today: todayStats.rows[0],
      avg_attempts_on_failure: avgAttempts.rows[0].avg_attempts_on_failure,
    },
  });
});


// ============================================================
// SMS LOGS — READ OPERATIONS
// ============================================================

const getSmsLogs = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;

  if (req.query.status && !VALID_SMS_STATUSES.includes(req.query.status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }

  const { page, limit, offset } = parsePagination(req.query);

  const allowedSortColumns = {
    id: 'id', created_at: 'created_at', sent_at: 'sent_at',
    delivered_at: 'delivered_at', status: 'status',
  };
  const sortBy = allowedSortColumns[req.query.sort_by] || 'created_at';
  const sortOrder = req.query.sort_order === 'ASC' ? 'ASC' : 'DESC';

  const allowedFilters = {
    status: 'status', message_type: 'message_type',
    student_id: 'student_id', invoice_id: 'invoice_id', payment_id: 'payment_id',
  };

  // Start at 2 since $1 = schoolId
  const { clause, values, paramIndex: nextParam } = buildWhereClause(req.query, allowedFilters, 2);

  const conditions = [`school_id = $1`];
  let currentParamIndex = nextParam;
  const allValues = [schoolId, ...values];

  if (clause) {
    const clauseWithoutWhere = clause.replace(/^WHERE\s+/, '');
    if (clauseWithoutWhere) conditions.push(clauseWithoutWhere);
  }

  if (req.query.phone && req.query.phone.trim() !== '') {
    conditions.push(`recipient_phone LIKE $${currentParamIndex}`);
    allValues.push(`%${req.query.phone.trim()}%`);
    currentParamIndex++;
  }

  const fullClause = 'WHERE ' + conditions.join(' AND ');

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM sms_logs ${fullClause}`, allValues
  );
  const total = countResult.rows[0].total;

  allValues.push(limit, offset);
  const result = await pool.query(
    `SELECT * FROM sms_logs ${fullClause}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${currentParamIndex} OFFSET $${currentParamIndex + 1}`,
    allValues
  );

  res.status(200).json({
    success: true,
    data: result.rows,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
  });
});


const getSmsLogById = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;
  const { id } = req.params;

  if (!id || isNaN(parseInt(id)) || parseInt(id) <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }

  const result = await pool.query(
    'SELECT * FROM sms_logs WHERE id = $1 AND school_id = $2',
    [id, schoolId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'SMS log entry not found.' });
  }

  res.status(200).json({ success: true, data: result.rows[0] });
});


const getSmsLogStats = asyncHandler(async (req, res) => {
  const schoolId = req.schoolId;

  const [statusStats, typeStats, todayStats, totals] = await Promise.all([
    pool.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(cost), 0)::numeric(7,2) AS total_cost
       FROM sms_logs WHERE school_id = $1
       GROUP BY status ORDER BY status`,
      [schoolId]
    ),
    pool.query(
      `SELECT message_type, COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END)::int AS delivered,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed,
        COALESCE(SUM(cost), 0)::numeric(7,2) AS total_cost
       FROM sms_logs WHERE school_id = $1
       GROUP BY message_type ORDER BY message_type`,
      [schoolId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_today,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END)::int AS delivered_today,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed_today,
        COALESCE(SUM(cost), 0)::numeric(7,2) AS cost_today
       FROM sms_logs WHERE school_id = $1 AND created_at >= CURRENT_DATE`,
      [schoolId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_messages,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END)::int AS total_delivered,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int AS total_failed,
        COALESCE(SUM(cost), 0)::numeric(7,2) AS total_cost,
        COUNT(DISTINCT recipient_phone)::int AS unique_recipients
       FROM sms_logs WHERE school_id = $1`,
      [schoolId]
    ),
  ]);

  const totalResult = totals.rows[0];
  const deliveryRate = totalResult.total_messages > 0
    ? ((totalResult.total_delivered / totalResult.total_messages) * 100).toFixed(2)
    : '0.00';

  res.status(200).json({
    success: true,
    data: {
      by_status: statusStats.rows,
      by_message_type: typeStats.rows,
      today: todayStats.rows[0],
      totals: totalResult,
      delivery_rate_percent: deliveryRate,
    },
  });
});


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createNotification,
  getNotifications,
  getNotificationById,
  updateNotification,
  deleteNotification,
  retryNotification,
  retryAllFailedNotifications,
  getNotificationStats,
  getSmsLogs,
  getSmsLogById,
  getSmsLogStats,
};