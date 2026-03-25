/**
 * Fees Routes
 * Fee management, invoices, and payments endpoints
 */

const express = require('express');
const router = express.Router();
const feesControllers = require('./fees.controllers');
const { authenticate} = require('../../shared/middleware/auth');

// ============================================
// INVOICE ROUTES
// ============================================

/**
 * @route   POST /api/v1/fees/invoices
 * @desc    Create invoice for student
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.post(
  '/invoices',
  authenticate,
  feesControllers.createInvoice
);

/**
 * @route   GET /api/v1/fees/invoices
 * @desc    Get all invoices with filtering
 * @access  Private (ADMIN, ACCOUNTANT, TEACHER)
 */
router.get(
  '/invoices',
  authenticate,
  feesControllers.getInvoices
);
/**
 * @route   GET /api/v1/fees/invoices/student/:studentId
 * @desc    Get all invoices for a specific student
 * @access  Private (ADMIN, ACCOUNTANT, TEACHER, PARENT)
 */

router.get(
  '/invoices/student/:studentId',
  authenticate,
  feesControllers.getStudentInvoices
);

/**
 * @route   GET /api/v1/fees/invoices/:id
 * @desc    Get single invoice by ID
 * @access  Private (ADMIN, ACCOUNTANT, TEACHER)
 */



/**
 * @route   POST /api/v1/fees/invoices/generate
 * @desc    Generate invoices in bulk (e.g. for a whole class or term)
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.post(
  '/invoices/generate',
  authenticate,
  feesControllers.generateInvoice
);

/**
 * @route   GET /api/v1/fees/invoices/:id   ← this stays AFTER generate
 */
router.get(
  '/invoices/:id',
  authenticate,
  feesControllers.getInvoiceById
);






// ============================================
// PAYMENT ROUTES
// ============================================

/**
 * @route   POST /api/v1/fees/payments
 * @desc    Record payment for invoice
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.post(
  '/payments',
  authenticate,
  feesControllers.recordPayment
);

/**
 * @route   GET /api/v1/fees/payments
 * @desc    Get all payments with filtering
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.get(
  '/payments',
  authenticate,
  feesControllers.getPayments
);

/**
 * @route   GET /api/v1/fees/payments/:id
 * @desc    Get single payment by ID
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.get(
  '/payments/:id',
  authenticate,
  feesControllers.getPaymentById
);

// ============================================
// BALANCE & SUMMARY ROUTES
// ============================================

/**
 * @route   GET /api/v1/fees/balance/:studentId
 * @desc    Get student fee balance summary
 * @access  Private (ADMIN, ACCOUNTANT, TEACHER, PARENT)
 */
router.get(
  '/balance/:studentId',
  authenticate,
  feesControllers.getStudentBalance
);

// ============================================
// FEE STRUCTURE ROUTES
// ============================================

/**
 * @route   GET /api/v1/fees/fee-structures
 * @desc    Get all fee structures
 * @access  Private (ADMIN, ACCOUNTANT, TEACHER)
 */
router.get(
  '/fee-structures',
  authenticate,
  feesControllers.getFeeStructures
);

/**
 * @route   POST /api/v1/fees/fee-structures
 * @desc    Create fee structure
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.post(
  '/fee-structures',
  authenticate,
  feesControllers.createFeeStructure
);

// ============================================
// REPORTS ROUTES
// ============================================

/**
 * @route   GET /api/v1/fees/reports/summary
 * @desc    Get fee collection summary report
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.get(
  '/reports/summary',
  authenticate,
  feesControllers.getFeeCollectionSummary
);

/**
 * @route   GET /api/v1/fees/reports/defaulters
 * @desc    Get fee defaulters report
 * @access  Private (ADMIN, ACCOUNTANT)
 */
router.get(
  '/reports/defaulters',
  authenticate,
  feesControllers.getFeeDefaulters
);

module.exports = router;
