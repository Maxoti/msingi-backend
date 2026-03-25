'use strict';

const authService = require('./auth.service');
const db          = require('../../shared/database/client');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const crypto      = require('crypto');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks: min 8 chars (trimmed), at least one uppercase, at least one digit.
// Rejects: '12345', 'password', 'abc', '        '
function isStrongPassword(pw) {
  if (!pw || typeof pw !== 'string') return false;
  if (pw.trim().length < 8)          return false;
  if (!/[A-Z]/.test(pw))             return false;
  if (!/[0-9]/.test(pw))             return false;
  return true;
}

function errRes(res, status, msg) {
  return res.status(status).json({ success: false, message: msg, error: msg });
}

async function storeRefreshToken(userId, token) {
  try {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, is_revoked)
       VALUES ($1, $2, $3, FALSE) ON CONFLICT DO NOTHING`,
      [userId, token, expiresAt]
    );
  } catch (e) { console.error('[auth] storeRefreshToken:', e.message); }
}

async function updateLastLogin(userId) {
  try {
    await db.query(
      'UPDATE users SET last_login = $1 WHERE id = $2',
      [new Date(), userId]
    );
  } catch (e) { console.error('[auth] updateLastLogin:', e.message); }
}

// ─── Register ─────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    // school_id MUST come from the request body in multi-tenant mode
    const { school_id, username, email, password, role } = req.body;

    if (!school_id) {
      return errRes(res, 400, 'school_id is required');
    }
    if (!username || !email || !password) {
      return errRes(res, 400, 'username, email and password are required');
    }
    if (!emailRegex.test(email)) {
      return errRes(res, 400, 'Please provide a valid email address');
    }
    if (!isStrongPassword(password)) {
      return errRes(res, 400, 'Password must be at least 8 characters with one uppercase letter and one number');
    }

    const validRoles = ['ADMIN', 'TEACHER', 'ACCOUNTANT', 'PARENT'];
    if (role && !validRoles.includes(role)) {
      return errRes(res, 400, 'Invalid role. Must be ADMIN, TEACHER, ACCOUNTANT, or PARENT');
    }
    const assignedRole = role || 'TEACHER';

    // Pass school_id through to service → repository → INSERT
    const result = await authService.register({
      school_id,
      username,
      email,
      password,
      role: assignedRole,
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data:    result,
    });
  } catch (error) {
    if (error.message.includes('Username already exists')) {
      return res.status(409).json({
        success: false,
        message: 'username already exists',
        error:   'username already exists',
      });
    }
    if (error.message.includes('Email already exists')) {
      return res.status(409).json({
        success: false,
        message: 'email already exists',
        error:   'email already exists',
      });
    }
    next(error);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
// ─── Login ────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { username, email, password, schoolName } = req.body;
    const identifier = username || email;

    if (!schoolName)          return errRes(res, 400, 'School name is required');
    if (!identifier || !password) return errRes(res, 400, 'credentials are required');

    // Resolve school name → slug → school_id
    const slug = schoolName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const school = await db.queryOne(
      'SELECT id, name FROM schools WHERE LOWER(slug) = $1 AND is_active = true',
      [slug]
    );
    if (!school) return errRes(res, 401, 'School not found. Please check the school name.');

    // If email was provided, resolve to username scoped to this school
    let loginUsername = identifier;
    if (!username && email) {
      const userRow = await db.queryOne(
        'SELECT username FROM users WHERE email = $1 AND school_id = $2',
        [email, school.id]
      );
      if (!userRow) return errRes(res, 401, 'Invalid credentials');
      loginUsername = userRow.username;
    }

    let result;
    try {
      result = await authService.login(loginUsername, password, school.id);
    } catch (err) {
      console.error('[login] error:', err.message);
      if (err.message === 'Account is inactive') {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive. Please contact administrator.',
          error:   'Account is inactive',
        });
      }
      return errRes(res, 401, 'Invalid credentials');
    }

    const decoded = jwt.decode(result.token);
    if (decoded?.userId) {
      await updateLastLogin(decoded.userId);
      await storeRefreshToken(decoded.userId, result.refreshToken);
    }

   return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        ...result,
        user: {
          ...result.user,
          schoolName: school.name,
        }
      }
    });

  } catch (error) { next(error); }
};
// ─── Get profile ──────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getUserById(req.user.userId);
    if (!user) return errRes(res, 404, 'User not found');
    return res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};
const getMe = getProfile;

// ─── Update profile ───────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email)               return errRes(res, 400, 'email is required');
    if (!emailRegex.test(email)) return errRes(res, 400, 'Invalid email format');
    const user = await authService.updateProfile(req.user.userId, { email });
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data:    user,
    });
  } catch (error) {
    if (error.message.includes('already exists')) return errRes(res, 409, 'email already in use');
    next(error);
  }
};

// ─── Change password ──────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const oldPw = req.body.oldPassword || req.body.currentPassword;
    const newPw = req.body.newPassword;

    if (!oldPw || !newPw) return errRes(res, 400, 'oldPassword and newPassword are required');
    if (!isStrongPassword(newPw)) {
      return errRes(res, 400, 'Password must be at least 8 characters with one uppercase letter and one number');
    }

    await authService.changePassword(req.user.userId, oldPw, newPw);
    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    if (error.message === 'Current password is incorrect') {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect',
        error:   'Current password is incorrect',
      });
    }
    next(error);
  }
};

// ─── Refresh token ────────────────────────────────────────────────────────────
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return errRes(res, 400, 'refreshToken is required');

    const stored = await db.queryOne(
      'SELECT * FROM refresh_tokens WHERE token = $1', [token]
    );
    if (stored?.is_revoked) return errRes(res, 401, 'Token has been revoked');

    let result;
    try {
      result = await authService.refreshToken(token);
    } catch {
      return errRes(res, 401, 'Invalid or expired refresh token');
    }

    await db.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1', [token]
    );

    const decoded    = jwt.decode(result.token);
    const newRefresh = authService.generateRefreshToken({
      id:        decoded?.userId,
      school_id: decoded?.school_id,
      ...decoded,
    });
    await storeRefreshToken(decoded?.userId, newRefresh);

    return res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data:    { token: result.token, refreshToken: newRefresh },
    });
  } catch (error) { next(error); }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body || {};
    if (token) {
      try {
        await db.query(
          'UPDATE refresh_tokens SET is_revoked = TRUE WHERE token = $1', [token]
        );
      } catch (dbErr) {
        console.error('[auth] logout DB error (non-fatal):', dbErr.message);
      }
    }
    return res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error) { next(error); }
};

// ─── Logout all ───────────────────────────────────────────────────────────────
const logoutAll = async (req, res, next) => {
  try {
    await db.query(
      'UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1',
      [req.user.userId]
    );
    return res.status(200).json({ success: true, message: 'All sessions revoked' });
  } catch (error) { next(error); }
};

// ─── Sessions ─────────────────────────────────────────────────────────────────
const listSessions = async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, created_at, expires_at FROM refresh_tokens
       WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.userId]
    );
    return res.status(200).json({ success: true, data: rows.rows });
  } catch (error) { next(error); }
};

const revokeSession = async (req, res, next) => {
  try {
    await db.query(
      `UPDATE refresh_tokens SET is_revoked = TRUE
       WHERE (id::text = $1 OR token = $1) AND user_id = $2`,
      [req.params.tokenId, req.user.userId]
    );
    return res.status(200).json({ success: true, message: 'Session revoked' });
  } catch (error) { next(error); }
};

// ─── Forgot password ──────────────────────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return errRes(res, 400, 'email is required');

    const user = await db.queryOne(
      'SELECT id FROM users WHERE email = $1', [email]
    );
    if (user) {
      const resetToken  = crypto.randomBytes(32).toString('hex');
      const hashedToken = await bcrypt.hash(resetToken, 10);
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour', FALSE)`,
        [user.id, hashedToken]
      );
    }

    // Always return 200 — don't reveal whether the email exists
    return res.status(200).json({
      success: true,
      message: 'If that email exists, a reset link was sent',
    });
  } catch (error) { next(error); }
};

// ─── Reset password ───────────────────────────────────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return errRes(res, 400, 'token and newPassword are required');
    if (!isStrongPassword(newPassword)) {
      return errRes(res, 400, 'Password must be at least 8 characters with one uppercase letter and one number');
    }

    // Fetch all valid (unused, unexpired) tokens and bcrypt-compare each
    const rows = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC`
    );

    let matched = null;
    for (const row of rows.rows) {
      if (await bcrypt.compare(token, row.token)) { matched = row; break; }
    }

    if (!matched) return errRes(res, 400, 'Invalid or expired token');

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, matched.user_id]);
    await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [matched.id]);

    return res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) { next(error); }
};

// ─── Cleanup tokens ───────────────────────────────────────────────────────────
const cleanupTokens = async (req, res, next) => {
  try {
    await db.query(`DELETE FROM refresh_tokens WHERE expires_at < NOW() OR is_revoked = TRUE`);
    await db.query(`DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = TRUE`);
    return res.status(200).json({ success: true, message: 'Expired tokens cleaned up' });
  } catch (error) { next(error); }
};

module.exports = {
  register, login, getProfile, getMe, updateProfile,
  changePassword, refreshToken, logout, logoutAll,
  listSessions, revokeSession,
  forgotPassword, resetPassword, cleanupTokens,
}
