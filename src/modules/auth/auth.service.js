/**
 * Auth Service
 * Business logic for authentication operations
 */

'use strict';

const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const crypto         = require('crypto');
const authRepository = require('./auth.repository');
const eventBus       = require('../events/event-bus');

// ─── Register ────────────────────────────────────────────────────────────────

/**
 * Register new user.
 * school_id MUST be supplied — never rely on the DB trigger.
 *
 * Emits: user.created
 */
const register = async (userData) => {
  const { school_id, username, email, password, role } = userData;

  // Scope duplicate checks to the same school
  const existingUser = await authRepository.findByUsername(username, school_id);
  if (existingUser) throw new Error('Username already exists');

  const existingEmail = await authRepository.findByEmail(email, school_id);
  if (existingEmail) throw new Error('Email already exists');

  const password_hash = await bcrypt.hash(password, 10);

  const user = await authRepository.create({
    school_id,
    username,
    email,
    password_hash,
    role,
    is_active: true,
  });

  eventBus.emit('user.created', {
    userId:    user.id,
    username:  user.username,
    email:     user.email,
    role:      user.role,
    school_id: user.school_id,
  });

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    user: {
      id:        user.id,
      username:  user.username,
      email:     user.email,
      role:      user.role,
      is_active: user.is_active,
    },
    token: accessToken,
    refreshToken,
  };
};

// ─── Login ───────────────────────────────────────────────────────────────────

const login = async (username, password, schoolId) => {
  // Find user scoped to that school
  const user = await authRepository.findByUsername(username, schoolId);
  if (!user)           throw new Error('User not found');
  if (!user.is_active) throw new Error('Account is inactive');

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) throw new Error('Invalid credentials');

  eventBus.emit('user.loggedIn', {
    userId:    user.id,
    username:  user.username,
    school_id: user.school_id,
  });

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return {
    user: {
      id:        user.id,
      username:  user.username,
      email:     user.email,
      role:      user.role,
      is_active: user.is_active,
      school_id: user.school_id, 
    },
    token: accessToken,
    refreshToken,
  };
};
// ─── Get user by ID ──────────────────────────────────────────────────────────

/**
 * Get user by ID.
 */
const getUserById = async (userId) => {
  const user = await authRepository.findById(userId);
  if (!user) return null;

  return {
    id:         user.id,
    username:   user.username,
    email:      user.email,
    role:       user.role,
    is_active:  user.is_active,
    created_at: user.created_at,
  };
};

// ─── Update profile ───────────────────────────────────────────────────────────

/**
 * Update user profile.
 *
 * Emits: user.updated
 */
const updateProfile = async (userId, updates) => {
  if (updates.email) {
    const existingEmail = await authRepository.findByEmail(updates.email);
    if (existingEmail && existingEmail.id !== userId) {
      throw new Error('Email already exists');
    }
  }

  const user = await authRepository.update(userId, updates);

  eventBus.emit('user.updated', {
    userId:   user.id,
    username: user.username,
    updates,
  });

  return {
    id:        user.id,
    username:  user.username,
    email:     user.email,
    role:      user.role,
    is_active: user.is_active,
  };
};

// ─── Change password ──────────────────────────────────────────────────────────

/**
 * Change password.
 *
 * Emits: user.passwordChanged
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await authRepository.findById(userId);
  if (!user) throw new Error('User not found');

  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValidPassword) throw new Error('Current password is incorrect');

  const password_hash = await bcrypt.hash(newPassword, 10);
  await authRepository.update(userId, { password_hash });

  eventBus.emit('user.passwordChanged', {
    userId:   user.id,
    username: user.username,
  });

  return true;
};

// ─── Delete user ──────────────────────────────────────────────────────────────

/**
 * Delete (or deactivate) a user account.
 * Call this from the users controller/service that handles DELETE /users/:id
 * so the event is always emitted in one place.
 *
 * Emits: user.deleted
 */
const deleteUser = async (userId) => {
  const user = await authRepository.findById(userId);
  if (!user) throw new Error('User not found');

  await authRepository.delete(userId);

  eventBus.emit('user.deleted', {
    userId:    user.id,
    username:  user.username,
    school_id: user.school_id,
  });

  return true;
};

// ─── Refresh token ────────────────────────────────────────────────────────────

/**
 * Refresh access token.
 */
const refreshToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   'school-management-system',
      audience: 'school-api-users',
    });

    const user = await authRepository.findById(decoded.userId);
    if (!user)           throw new Error('User not found');
    if (!user.is_active) throw new Error('Account is inactive');

    return { token: generateAccessToken(user) };
  } catch {
    throw new Error('Invalid or expired refresh token');
  }
};

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Generate access token (short-lived).
 *
 * jti (JWT ID) is a random value that makes every token unique — even two
 * tokens issued within the same second will differ. This is required by the
 * "should track multiple active sessions" test and is good security practice.
 *
 * expiresIn MUST be a string ('8h') — passing a bare number causes
 * jsonwebtoken to treat it as milliseconds, not seconds.
 */
const generateAccessToken = (user) => {
  const payload = {
    userId:    user.id,
    username:  user.username,
    email:     user.email,
    role:      user.role,
    school_id: user.school_id,
    jti:       crypto.randomBytes(8).toString('hex'),
  };

  const expiresIn = String(process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRE || '8h');

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    issuer:   'school-management-system',
    audience: 'school-api-users',
  });
};

/**
 * Generate refresh token (long-lived).
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      type:   'refresh',
      jti:    crypto.randomBytes(8).toString('hex'),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: String(process.env.JWT_REFRESH_EXPIRE || '7d'),
      issuer:    'school-management-system',
      audience:  'school-api-users',
    }
  );
};

/**
 * Verify token.
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   'school-management-system',
      audience: 'school-api-users',
    });
  } catch {
    throw new Error('Invalid or expired token');
  }
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  register,
  login,
  getUserById,
  updateProfile,
  changePassword,
  deleteUser,
  refreshToken,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
};