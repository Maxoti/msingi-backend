/**
 * Custom error classes for better error handling
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400);
    this.errors = errors;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/**
 * Async handler wrapper - eliminates need for try-catch in controllers
 * Automatically catches errors and passes them to error middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // PostgreSQL unique constraint violation
  if (err.code === '23505') {
    error = new ConflictError('Duplicate entry');
  }

  // PostgreSQL foreign key constraint violation
  if (err.code === '23503') {
    error = new ValidationError('Referenced resource does not exist');
  }

  // PostgreSQL not null constraint violation
  if (err.code === '23502') {
    error = new ValidationError('Required field missing');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new UnauthorizedError('Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    error = new UnauthorizedError('Token expired');
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    error = new ValidationError('Validation failed', errors);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(error.errors && { errors: error.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Handle 404 errors
 */
const notFound = (req, res, next) => {
  next(new NotFoundError(`Route ${req.originalUrl}`));
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,  
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
};