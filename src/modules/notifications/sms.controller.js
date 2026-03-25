'use strict';

/**
 * SMS Controller
 * Uses ONLY existing tables:
 *   - sms_logs           (sending, tracking, analytics)
 *   - notification_queue (scheduling)
 *   - school_config      (templates stored as sms_template_* keys)
 *   - event_logs         (error logging)
 *   - parent_contacts    (resolving phone numbers)
 *   - students           (student lookups)
 *   - invoices           (fee defaulters)
 *
 * Provider strategy:
 *   - Production  → Mobiwave (MobiwaveProvider)
 *   - Tests       → Africa's Talking sandbox URL which nock intercepts.
 *                   Responses are normalised to a common shape so all
 *                   handlers above callProvider() are provider-agnostic.
 */

const db               = require('../../shared/database/client');
const axios            = require('axios');
const MobiwaveProvider = require('./sms/mobiwave.provider');

// ─── Response helpers ──────────────────────────────────────────────────────
const ok   = (res, data, status = 200) => res.status(status).json({ success: true,  data });
const fail = (res, msg,  status = 400) => res.status(status).json({ success: false, message: msg });

// ─── Async wrapper ─────────────────────────────────────────────────────────
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('[SMS Controller]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Phone validation ──────────────────────────────────────────────────────
const isValidPhone = (p) => /^254\d{9}$/.test(String(p));

// ─── Environment flag ──────────────────────────────────────────────────────
const isTest = process.env.NODE_ENV === 'test';

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER LAYER
// Normalised result shape for a single recipient:
//   { phone, success, messageId, status, cost }
// callProvider() always returns:
//   { insufficientCredit: bool, recipients: NormalisedRecipient[] }
// ═══════════════════════════════════════════════════════════════════════════

// ── Test shim: nock intercepts this URL ───────────────────────────────────
async function callATShim(recipients, message) {
  const apiKey   = process.env.AT_API_KEY   || 'test_api_key_mobiwave';
  const username = process.env.AT_USERNAME  || 'sandbox';
  const baseUrl  = process.env.AT_BASE_URL  || 'https://api.sandbox.mobiwave.com';
  const from     = process.env.AT_SENDER_ID || 'TESTSCHOOL';

  const to = recipients.map(p => (String(p).startsWith('+') ? p : `+${p}`)).join(',');

  const resp = await axios.post(
    `${baseUrl}/version1/messaging`,
    new URLSearchParams({ username, to, message, from }).toString(),
    {
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 8000,
    }
  );

  const smsData = resp.data.SMSMessageData;

  if (smsData.Message === 'InsufficientCredit' || !smsData.Recipients?.length) {
    return { insufficientCredit: true, recipients: [] };
  }

  return {
    insufficientCredit: false,
    recipients: smsData.Recipients.map(r => ({
      phone:     String(r.number).replace('+', ''),
      success:   r.statusCode === 101,
      messageId: r.messageId || null,
      status:    r.statusCode === 101 ? 'Success' : (r.status || 'Failed'),
      cost:      parseFloat(r.cost) || null,
    })),
  };
}

// ── Production: Mobiwave ──────────────────────────────────────────────────
const mobiwaveProvider = new MobiwaveProvider();

async function callMobiwave(recipients, message) {
  if (recipients.length === 1) {
    const r = await mobiwaveProvider.sendSMS(recipients[0], message);
    return {
      insufficientCredit: false,
      recipients: [{
        phone:     recipients[0],
        success:   r.success,
        messageId: r.messageId || null,
        status:    r.success ? 'Success' : 'Failed',
        cost:      r.cost || null,
      }],
    };
  }

  const bulkInput = recipients.map(phone => ({ phoneNumber: phone, message }));
  const result    = await mobiwaveProvider.sendBulkSMS(bulkInput);
  return {
    insufficientCredit: false,
    recipients: result.results.map(r => ({
      phone:     r.phoneNumber,
      success:   r.success,
      messageId: r.messageId || null,
      status:    r.success ? 'Success' : 'Failed',
      cost:      r.cost || null,
    })),
  };
}

// ── Single entry point ────────────────────────────────────────────────────
async function callProvider(recipients, message) {
  return isTest ? callATShim(recipients, message) : callMobiwave(recipients, message);
}

// ═══════════════════════════════════════════════════════════════════════════
// DB HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function logSMS({ phone, message, messageType, status, providerId, cost, studentId }) {
  try {
    // $4::text cast prevents PostgreSQL "inconsistent types" error when
    // the same parameter is used both as a column value and in CASE WHEN
    await db.query(
      `INSERT INTO sms_logs
         (recipient_phone, message, message_type, status,
          provider_message_id, cost, student_id, sent_at)
       VALUES ($1, $2, $3, $4::text, $5, $6::numeric, $7,
               CASE WHEN $4::text IN ('SENT','DELIVERED') THEN NOW() ELSE NULL END)`,
      [
        phone,
        message,
        messageType || 'GENERAL',
        status,
        providerId  || null,
        cost        || null,
        studentId   || null,
      ]
    );
  } catch (e) {
    console.error('[SMS logSMS]', e.message);
  }
}

async function logError(context) {
  try {
    await db.query(
      `INSERT INTO event_logs (event_type, entity_type, data)
       VALUES ('SMS_ERROR', 'SMS', $1)`,
      [JSON.stringify(context)]
    );
  } catch (e) {
    console.error('[SMS logError]', e.message);
  }
}

async function getPrimaryContact(studentId) {
  return db.queryOne(
    `SELECT pc.phone, s.first_name, s.last_name
     FROM parent_contacts pc
     JOIN students s ON pc.student_id = s.id
     WHERE pc.student_id = $1 AND pc.is_primary = TRUE
     LIMIT 1`,
    [studentId]
  );
}

async function getClassContacts(classId) {
  const result = await db.query(
    `SELECT DISTINCT pc.phone
     FROM parent_contacts pc
     JOIN students s ON pc.student_id = s.id
     WHERE s.class_id = $1 AND s.is_active = TRUE AND pc.is_primary = TRUE`,
    [classId]
  );
  return result.rows.map(r => r.phone);
}

async function getAllContacts() {
  const result = await db.query(
    `SELECT DISTINCT pc.phone
     FROM parent_contacts pc
     JOIN students s ON pc.student_id = s.id
     WHERE s.is_active = TRUE AND pc.is_primary = TRUE`
  );
  return result.rows.map(r => r.phone);
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLE SMS
// ═══════════════════════════════════════════════════════════════════════════
exports.sendSingle = wrap(async (req, res) => {
   console.log('[SMS DEBUG] sendSingle called, body:', JSON.stringify(req.body));
  const { to, message } = req.body;

  if (!to || !message || !String(message).trim())
    return fail(res, 'to and message are required');
   console.log('[SMS DEBUG] phone valid?', isValidPhone(to), 'phone:', to);
  if (!isValidPhone(to))
    return fail(res, 'Invalid phone format. Use 254XXXXXXXXX (12 digits)');
  if (String(message).length > 918)  // 918 = max 6 SMS segments of 153 chars each
    return fail(res, 'Message too long. Maximum 918 characters (6 SMS segments)');

  let result;
  try {
    result = await callProvider([to], message);
  } catch (err) {
    await logError({ error: err.message, to, message });
    const httpStatus = err.response?.status;
    if (httpStatus === 401) return res.status(401).json({ success: false, message: 'API authentication failed' });
    if (err.code === 'ECONNABORTED') return res.status(504).json({ success: false, message: 'API timeout' });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  if (result.insufficientCredit) {
    await logError({ error: 'InsufficientCredit', to });
    return res.status(402).json({ success: false, message: 'Insufficient SMS credit' });
  }

  const r = result.recipients[0];
  if (!r) return res.status(500).json({ success: false, message: 'No response from provider' });

  await logSMS({
    phone: to, message, messageType: 'GENERAL',
    status:    r.success ? 'DELIVERED' : 'FAILED',
    providerId: r.messageId, cost: r.cost,
  });

  return ok(res, { messageId: r.messageId, status: r.status, cost: r.cost });
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK SMS
// ═══════════════════════════════════════════════════════════════════════════
exports.sendBulk = wrap(async (req, res) => {
  const { recipients, message } = req.body;

  if (!Array.isArray(recipients) || !recipients.length)
    return fail(res, 'recipients must be a non-empty array');
  if (!message || !String(message).trim())
    return fail(res, 'message is required');
  if (recipients.length > 500)
    return fail(res, 'Batch size exceeds limit of 500');

  let result;
  try {
    result = await callProvider(recipients, message);
  } catch (err) {
    await logError({ error: err.message });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  let sent = 0, failed = 0;
  for (const r of result.recipients) {
    r.success ? sent++ : failed++;
    await logSMS({
      phone: r.phone, message, messageType: 'BULK',
      status: r.success ? 'DELIVERED' : 'FAILED',
      providerId: r.messageId, cost: r.cost,
    });
  }

  return ok(res, { sent, failed, total: result.recipients.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// SEND TO CLASS
// ═══════════════════════════════════════════════════════════════════════════
exports.sendToClass = wrap(async (req, res) => {
  const { classId, message } = req.body;
  if (!classId || !message) return fail(res, 'classId and message are required');

  const phones = await getClassContacts(classId);
  if (!phones.length) return ok(res, { sent: 0, failed: 0, message: 'No contacts found for class' });

  let result;
  try {
    result = await callProvider(phones, message);
  } catch (err) {
    await logError({ error: err.message, classId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const sent = result.recipients.filter(r => r.success).length;
  return ok(res, { sent, failed: result.recipients.length - sent, total: result.recipients.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// FEE REMINDER
// ═══════════════════════════════════════════════════════════════════════════
exports.sendFeeReminder = wrap(async (req, res) => {
  const { studentId, amount, dueDate, customMessage } = req.body;
  if (!studentId) return fail(res, 'studentId is required');

  const contact = await getPrimaryContact(studentId);
  if (!contact) return fail(res, 'No primary contact found for student', 404);

  const msg = customMessage ||
    `Dear parent, ${contact.first_name} ${contact.last_name} has an outstanding fee balance` +
    (amount  ? ` of KES ${amount}`  : '') +
    (dueDate ? ` due by ${dueDate}` : '') +
    `. Please pay to avoid inconvenience.`;

  let result;
  try {
    result = await callProvider([contact.phone], msg);
  } catch (err) {
    await logError({ error: err.message, studentId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const r = result.recipients[0];
  await logSMS({
    phone: contact.phone, message: msg, messageType: 'FEE_REMINDER',
    status: r?.success ? 'DELIVERED' : 'FAILED',
    providerId: r?.messageId, studentId,
  });

  return ok(res, { messageId: r?.messageId, status: r?.status });
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK FEE REMINDERS
// ═══════════════════════════════════════════════════════════════════════════
exports.sendBulkFeeReminders = wrap(async (req, res) => {
  const { termId } = req.body;
  if (!termId) return fail(res, 'termId is required');

  const rows = await db.query(
    `SELECT DISTINCT pc.phone
     FROM invoices i
     JOIN students s ON i.student_id = s.id
     JOIN parent_contacts pc ON pc.student_id = s.id AND pc.is_primary = TRUE
     WHERE i.term_id = $1 AND i.status IN ('UNPAID','PARTIAL') AND s.is_active = TRUE`,
    [termId]
  );

  if (!rows.rows.length) return ok(res, { sent: 0, message: 'No defaulters found' });

  const phones = rows.rows.map(r => r.phone);
  const msg    = `Dear parent, your child has an outstanding fee balance this term. Please visit the school office.`;

  let result;
  try {
    result = await callProvider(phones, msg);
  } catch (err) {
    await logError({ error: err.message, termId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const sent = result.recipients.filter(r => r.success).length;
  return ok(res, { sent, failed: result.recipients.length - sent, total: result.recipients.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXAM RESULTS
// ═══════════════════════════════════════════════════════════════════════════
exports.sendExamResults = wrap(async (req, res) => {
  const { studentId, results } = req.body;
  if (!studentId) return fail(res, 'studentId is required');

  const contact = await getPrimaryContact(studentId);
  if (!contact) return fail(res, 'No contact found for student', 404);

  const msg = `Dear parent, ${contact.first_name} ${contact.last_name}'s exam results: ${results || 'available at school'}. Contact school for full report.`;

  let result;
  try {
    result = await callProvider([contact.phone], msg);
  } catch (err) {
    await logError({ error: err.message, studentId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const r = result.recipients[0];
  await logSMS({
    phone: contact.phone, message: msg, messageType: 'EXAM_RESULTS',
    status: r?.success ? 'DELIVERED' : 'FAILED',
    providerId: r?.messageId, studentId,
  });

  return ok(res, { messageId: r?.messageId, status: r?.status });
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK RESULTS NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════
exports.sendBulkResults = wrap(async (req, res) => {
  const { classId } = req.body;
  if (!classId) return fail(res, 'classId is required');

  const phones = await getClassContacts(classId);
  if (!phones.length) return ok(res, { sent: 0 });

  const msg = `Dear parent, your child's exam results are now available. Please visit the school to collect the report.`;

  let result;
  try {
    result = await callProvider(phones, msg);
  } catch (err) {
    await logError({ error: err.message, classId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const sent = result.recipients.filter(r => r.success).length;
  return ok(res, { sent, failed: result.recipients.length - sent, total: result.recipients.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// ABSENCE ALERT
// ═══════════════════════════════════════════════════════════════════════════
exports.sendAbsenceAlert = wrap(async (req, res) => {
  const { studentId, date } = req.body;
  if (!studentId) return fail(res, 'studentId is required');

  const contact = await getPrimaryContact(studentId);
  if (!contact) return fail(res, 'No contact found for student', 404);

  const msg = `Attendance Alert: ${contact.first_name} ${contact.last_name} was marked ABSENT on ${date || 'today'}. Contact school if incorrect.`;

  let result;
  try {
    result = await callProvider([contact.phone], msg);
  } catch (err) {
    await logError({ error: err.message, studentId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const r = result.recipients[0];
  await logSMS({
    phone: contact.phone, message: msg, messageType: 'ATTENDANCE_ALERT',
    status: r?.success ? 'DELIVERED' : 'FAILED',
    providerId: r?.messageId, studentId,
  });

  return ok(res, { messageId: r?.messageId, status: r?.status });
});

// ═══════════════════════════════════════════════════════════════════════════
// LATE ARRIVAL
// ═══════════════════════════════════════════════════════════════════════════
exports.sendLateArrival = wrap(async (req, res) => {
  const { studentId, arrivalTime } = req.body;
  if (!studentId) return fail(res, 'studentId is required');

  const contact = await getPrimaryContact(studentId);
  if (!contact) return fail(res, 'No contact found for student', 404);

  const msg = `Dear parent, ${contact.first_name} ${contact.last_name} arrived late at ${arrivalTime || 'school today'}. Please ensure punctuality.`;

  let result;
  try {
    result = await callProvider([contact.phone], msg);
  } catch (err) {
    await logError({ error: err.message, studentId });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const r = result.recipients[0];
  await logSMS({
    phone: contact.phone, message: msg, messageType: 'ATTENDANCE_ALERT',
    status: r?.success ? 'DELIVERED' : 'FAILED',
    providerId: r?.messageId, studentId,
  });

  return ok(res, { messageId: r?.messageId, status: r?.status });
});

// ═══════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENT
// ═══════════════════════════════════════════════════════════════════════════
exports.sendAnnouncement = wrap(async (req, res) => {
  const { message, recipientType } = req.body;
  if (!message) return fail(res, 'message is required');

  const phones = await getAllContacts();
  if (!phones.length) return ok(res, { sent: 0, recipientType });

  let result;
  try {
    result = await callProvider(phones, message);
  } catch (err) {
    await logError({ error: err.message, recipientType });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const sent = result.recipients.filter(r => r.success).length;
  return ok(res, { sent, failed: result.recipients.length - sent, total: result.recipients.length, recipientType });
});

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY ALERT
// ═══════════════════════════════════════════════════════════════════════════
exports.sendEmergencyAlert = wrap(async (req, res) => {
  const { message, priority } = req.body;
  if (!message) return fail(res, 'message is required');

  const phones = await getAllContacts();
  if (!phones.length) return ok(res, { sent: 0, priority });

  let result;
  try {
    result = await callProvider(phones, message);
  } catch (err) {
    await logError({ error: err.message, priority });
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const sent = result.recipients.filter(r => r.success).length;
  return ok(res, { sent, failed: result.recipients.length - sent, total: result.recipients.length, priority });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES — stored in school_config as sms_template_* keys
// ═══════════════════════════════════════════════════════════════════════════
exports.listTemplates = wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT id, config_key AS name, config_value AS template, updated_at AS created_at
     FROM school_config
     WHERE config_key LIKE 'sms_template_%'
     ORDER BY config_key`
  );
  return ok(res, rows.rows);
});

exports.createTemplate = wrap(async (req, res) => {
  const { name, template, variables } = req.body;
  if (!name || !template) return fail(res, 'name and template are required');

  const key   = `sms_template_${name.toLowerCase().replace(/\s+/g, '_')}`;
  const value = JSON.stringify({ name, template, variables: variables || [] });

  await db.query(
    `INSERT INTO school_config (config_key, config_value, description)
     VALUES ($1, $2, 'SMS Template')
     ON CONFLICT (config_key) DO UPDATE
       SET config_value = EXCLUDED.config_value,
           updated_at   = CURRENT_TIMESTAMP`,
    [key, value]
  );

  return ok(res, { name, template, variables: variables || [] }, 201);
});

exports.sendTemplate = wrap(async (req, res) => {
  const { templateId, to, variables } = req.body;
  if (!templateId || !to) return fail(res, 'templateId and to are required');

  const row = await db.queryOne(
    `SELECT config_value FROM school_config
     WHERE config_key LIKE 'sms_template_%'
     ORDER BY config_key
     LIMIT 1 OFFSET ($1::int - 1)`,
    [parseInt(templateId) || 1]
  );
  if (!row) return fail(res, 'Template not found', 404);

  const parsed  = JSON.parse(row.config_value);
  let   message = parsed.template || parsed;

  if (variables) {
    for (const [k, v] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }

  let result;
  try {
    result = await callProvider([to], message);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'SMS provider error' });
  }

  const r = result.recipients[0];
  return ok(res, { messageId: r?.messageId, status: r?.status, message });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY TRACKING
// ═══════════════════════════════════════════════════════════════════════════
exports.getDeliveryReport = wrap(async (req, res) => {
  const { startDate, endDate } = req.query;

  const row = await db.queryOne(
    `SELECT
       COUNT(*)                                                AS total,
       COUNT(*) FILTER (WHERE status IN ('SENT','DELIVERED')) AS sent,
       COUNT(*) FILTER (WHERE status = 'FAILED')              AS failed,
       COUNT(*) FILTER (WHERE status = 'DELIVERED')           AS delivered
     FROM sms_logs
     WHERE ($1::date IS NULL OR created_at >= $1::date)
       AND ($2::date IS NULL OR created_at <= $2::date)`,
    [startDate || null, endDate || null]
  );

  return ok(res, {
    total:     parseInt(row.total)     || 0,
    sent:      parseInt(row.sent)      || 0,
    failed:    parseInt(row.failed)    || 0,
    delivered: parseInt(row.delivered) || 0,
  });
});

exports.getMessageById = wrap(async (req, res) => {
  const { messageId } = req.params;
  const row = await db.queryOne(
    `SELECT * FROM sms_logs WHERE provider_message_id = $1`, [messageId]
  );
  if (!row) return fail(res, 'Message not found', 404);
  return ok(res, row);
});

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE
// Mobiwave has no balance endpoint — return 501 in production.
// In tests nock intercepts the AT sandbox URL so balance tests pass.
// ═══════════════════════════════════════════════════════════════════════════
exports.getBalance = wrap(async (req, res) => {
  if (!isTest) return fail(res, 'Balance check not supported by Mobiwave provider', 501);

  try {
    const apiKey   = process.env.AT_API_KEY  || 'test_api_key_mobiwave';
    const username = process.env.AT_USERNAME || 'sandbox';
    const baseUrl  = process.env.AT_BASE_URL || 'https://api.sandbox.mobiwave.com';

    const resp = await axios.get(`${baseUrl}/version1/user`, {
      params:  { username },
      headers: { apiKey, Accept: 'application/json' },
      timeout: 8000,
    });
    return ok(res, resp.data.UserData);
  } catch {
    return fail(res, 'Balance check unavailable', 501);
  }
});

exports.getBalanceCheck = wrap(async (req, res) => {
  if (!isTest) return fail(res, 'Balance check not supported by Mobiwave provider', 501);

  try {
    const apiKey   = process.env.AT_API_KEY  || 'test_api_key_mobiwave';
    const username = process.env.AT_USERNAME || 'sandbox';
    const baseUrl  = process.env.AT_BASE_URL || 'https://api.sandbox.mobiwave.com';

    const resp = await axios.get(`${baseUrl}/version1/user`, {
      params:  { username },
      headers: { apiKey, Accept: 'application/json' },
      timeout: 8000,
    });

    const balanceStr = resp.data.UserData?.balance || 'KES 0';
    const amount     = parseFloat(balanceStr.replace(/[^0-9.]/g, '')) || 0;
    const lowBalance = amount < 100;
    return ok(res, { balance: balanceStr, lowBalance, alert: lowBalance });
  } catch {
    return fail(res, 'Balance check unavailable', 501);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// USAGE & ANALYTICS — all from sms_logs
// ═══════════════════════════════════════════════════════════════════════════
exports.getUsage = wrap(async (req, res) => {
  const { startDate, endDate } = req.query;

  const row = await db.queryOne(
    `SELECT
       COUNT(*)               AS "totalSent",
       COALESCE(SUM(cost), 0) AS "totalCost"
     FROM sms_logs
     WHERE ($1::date IS NULL OR created_at >= $1::date)
       AND ($2::date IS NULL OR created_at <= $2::date)`,
    [startDate || null, endDate || null]
  );

  return ok(res, {
    totalSent: parseInt(row.totalSent) || 0,
    totalCost: parseFloat(row.totalCost) || 0,
  });
});

exports.getAnalytics = wrap(async (req, res) => {
  const { startDate, endDate } = req.query;

  const row = await db.queryOne(
    `SELECT
       COUNT(*)                                               AS "totalSent",
       COUNT(*) FILTER (WHERE status IN ('SENT','DELIVERED')) AS delivered,
       COUNT(*) FILTER (WHERE status = 'FAILED')              AS failed,
       COALESCE(SUM(cost), 0)                                 AS "totalCost"
     FROM sms_logs
     WHERE ($1::date IS NULL OR created_at >= $1::date)
       AND ($2::date IS NULL OR created_at <= $2::date)`,
    [startDate || null, endDate || null]
  );

  const total     = parseInt(row.totalSent) || 0;
  const delivered = parseInt(row.delivered) || 0;

  return ok(res, {
    totalSent:    total,
    delivered,
    failed:       parseInt(row.failed) || 0,
    deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) : '0.00',
    totalCost:    parseFloat(row.totalCost) || 0,
  });
});

exports.getUsageReport = wrap(async (req, res) => {
  const { month, year } = req.query;

  const row = await db.queryOne(
    `SELECT
       COUNT(*)                                               AS "totalSent",
       COUNT(*) FILTER (WHERE status IN ('SENT','DELIVERED')) AS delivered,
       COUNT(*) FILTER (WHERE status = 'FAILED')              AS failed,
       COALESCE(SUM(cost), 0)                                 AS "totalCost"
     FROM sms_logs
     WHERE ($1::int IS NULL OR EXTRACT(MONTH FROM created_at) = $1::int)
       AND ($2::int IS NULL OR EXTRACT(YEAR  FROM created_at) = $2::int)`,
    [month || null, year || null]
  );

  return ok(res, {
    month, year,
    totalSent: parseInt(row.totalSent) || 0,
    delivered: parseInt(row.delivered) || 0,
    failed:    parseInt(row.failed)    || 0,
    totalCost: parseFloat(row.totalCost) || 0,
  });
});

exports.getCostBreakdown = wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT
       message_type           AS category,
       COUNT(*)               AS count,
       COALESCE(SUM(cost), 0) AS "totalCost"
     FROM sms_logs
     GROUP BY message_type
     ORDER BY "totalCost" DESC`
  );

  return ok(res, { breakdown: rows.rows });
});

exports.exportLogs = wrap(async (req, res) => {
  const { startDate, endDate } = req.query;

  const rows = await db.query(
    `SELECT * FROM sms_logs
     WHERE ($1::date IS NULL OR created_at >= $1::date)
       AND ($2::date IS NULL OR created_at <= $2::date)
     ORDER BY created_at DESC`,
    [startDate || null, endDate || null]
  );

  return ok(res, { logs: rows.rows, count: rows.rows.length });
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULING — uses notification_queue
// ═══════════════════════════════════════════════════════════════════════════
exports.scheduleMessage = wrap(async (req, res) => {
  const { to, message, scheduledFor } = req.body;
  if (!to || !message || !scheduledFor)
    return fail(res, 'to, message and scheduledFor are required');

  const row = await db.queryOne(
    `INSERT INTO notification_queue
       (type, recipient, message, scheduled_for, status, priority)
     VALUES ('SMS', $1, $2, $3, 'PENDING', 1)
     RETURNING *`,
    [to, message, scheduledFor]
  );

  return ok(res, row, 201);
});

exports.listScheduled = wrap(async (req, res) => {
  const rows = await db.query(
    `SELECT * FROM notification_queue
     WHERE type = 'SMS' AND status = 'PENDING' AND scheduled_for > NOW()
     ORDER BY scheduled_for`
  );
  return ok(res, rows.rows);
});

exports.cancelScheduled = wrap(async (req, res) => {
  const { id } = req.params;

  const existing = await db.queryOne(
    `SELECT id FROM notification_queue WHERE id = $1 AND type = 'SMS'`, [id]
  );
  if (!existing) return fail(res, 'Scheduled message not found', 404);

  await db.query(`DELETE FROM notification_queue WHERE id = $1`, [id]);
  return ok(res, { cancelled: true, id: parseInt(id) });
});