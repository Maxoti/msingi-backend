const jwt   = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const { query }    = require('../database/client');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided',
      });
    }

    const token   = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      issuer:   'school-management-system',
      audience: 'school-api-users',
    });

    if (!decoded.school_id) {
      return res.status(401).json({
        success: false,
        message: 'Token missing school context',
      });
    }

    req.user     = decoded;
    req.schoolId = decoded.school_id;
    console.log('[AUTH] schoolId set to:', req.schoolId, 'for user:', decoded.username);

    // ✅ Parameterized + transaction-local (safe for connection pools)
    await query(
      `SELECT set_config('app.current_school_id', $1::text, true)`,
      [decoded.school_id.toString()]
    );
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    //  Real errors (DB down, etc.) go to the error handler, not silent 401
    return next(error);
  }
};

const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
    });
  }
  next();
};

module.exports = { authenticate, authorize };