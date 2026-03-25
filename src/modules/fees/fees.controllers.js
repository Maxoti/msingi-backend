/**
 * Fees Controller
 * req.schoolId passed to every service call for multi-tenancy
 */

'use strict';

const feesService = require('./fees.service');

const createInvoice = async (req, res, next) => {
  try {
    const { student_id, term_id, items, total_amount } = req.body;
    if (!student_id || !term_id)
      return res.status(400).json({ success: false, message: 'Please provide student_id and term_id' });

    let invoiceItems = items;
    if (!invoiceItems && total_amount)
      invoiceItems = [{ description: 'Invoice Item', amount: parseFloat(total_amount) }];

    if (!Array.isArray(invoiceItems) || invoiceItems.length === 0)
      return res.status(400).json({ success: false, message: 'Please provide items array or total_amount' });

    for (const item of invoiceItems) {
      if (!item.description || !item.amount || item.amount <= 0)
        return res.status(400).json({ success: false, message: 'Each item must have description and positive amount' });
    }

    const invoice = await feesService.createInvoice(student_id, term_id, invoiceItems, req.user?.userId || 1, req.schoolId);
    return res.status(201).json({ success: true, message: 'Invoice created successfully', data: invoice });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate'))
      return res.status(409).json({ success: false, message: error.message });
    if (error.message.includes('not found'))
      return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

const generateInvoice = async (req, res, next) => {
  try {
    const { class_id, term_id } = req.body;
    if (!class_id || !term_id)
      return res.status(400).json({ success: false, message: 'Please provide class_id and term_id' });

    const result = await feesService.generateInvoice(
      { class_id: parseInt(class_id), term_id: parseInt(term_id), created_by: req.user?.userId || 1 },
      req.schoolId
    );
    return res.status(201).json({ success: true, message: 'Invoices generated successfully', data: result });
  } catch (error) {
    if (error.message.includes('not found'))
      return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes('No fee structure'))
      return res.status(400).json({ success: false, message: error.message });
    if (error.message.includes('No active students'))
      return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const getInvoices = async (req, res, next) => {
  try {
   const { student_id, term_id, status, page = 1, limit = 20 } = req.query;
const result = await feesService.getInvoices(req.schoolId, {
  student_id: student_id ? parseInt(student_id) : undefined,
  term_id:    term_id    ? parseInt(term_id)    : undefined,
  status:     status     || undefined,   // ← string, no parseInt
  page:       parseInt(page), 
  limit:      parseInt(limit)
});
    return res.status(200).json({ success: true, data: result.invoices, pagination: result.pagination });
  } catch (error) { next(error); }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await feesService.getInvoiceById(req.schoolId, parseInt(req.params.id));
    if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });
    return res.status(200).json({ success: true, data: invoice });
  } catch (error) { next(error); }
};

const getStudentInvoices = async (req, res, next) => {
  try {
    const invoices = await feesService.getStudentInvoices(req.schoolId, parseInt(req.params.studentId));
    return res.status(200).json({ success: true, data: invoices });
  } catch (error) { next(error); }
};

const recordPayment = async (req, res, next) => {
  try {
    const { invoice_id, amount, payment_method, reference_number, payment_date } = req.body;
    if (!invoice_id || !amount || !payment_method)
      return res.status(400).json({ success: false, message: 'Please provide invoice_id, amount, and payment_method' });
    if (parseFloat(amount) <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });

    const validMethods = ['CASH', 'MPESA', 'BANK', 'CHEQUE'];
    if (!validMethods.includes(payment_method))
      return res.status(400).json({ success: false, message: `Invalid payment method. Must be one of: ${validMethods.join(', ')}` });

    const payment = await feesService.recordPayment({
      invoice_id:       parseInt(invoice_id),
      amount:           parseFloat(amount),
      payment_method,
      reference_number: reference_number || null,
      payment_date:     payment_date || new Date().toISOString().split('T')[0],
      received_by:      req.user?.userId || 1
    }, req.schoolId);

    if (!payment) return res.status(500).json({ success: false, message: 'Payment recorded but could not be retrieved.' });
    return res.status(201).json({ success: true, message: 'Payment recorded successfully', data: payment });
  } catch (error) {
    if (error.message.includes('not found')) return res.status(404).json({ success: false, message: error.message });
    if (error.message.includes('exceeds'))   return res.status(400).json({ success: false, message: error.message });
    next(error);
  }
};

const getPayments = async (req, res, next) => {
  try {
    const { invoice_id, payment_method, start_date, end_date, page = 1, limit = 20 } = req.query;
    const result = await feesService.getPayments(req.schoolId, {
      invoice_id:     invoice_id ? parseInt(invoice_id) : undefined,
      payment_method: payment_method || undefined,
      start_date:     start_date     || undefined,
      end_date:       end_date       || undefined,
      page: parseInt(page), limit: parseInt(limit)
    });
    return res.status(200).json({ success: true, data: result.payments, pagination: result.pagination });
  } catch (error) { next(error); }
};

const getPaymentById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid payment ID' });
    const payment = await feesService.getPaymentById(req.schoolId, id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    return res.status(200).json({ success: true, data: payment });
  } catch (error) { next(error); }
};

const getStudentBalance = async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) return res.status(400).json({ success: false, message: 'Invalid student ID' });

    const balance = await feesService.getStudentBalance(req.schoolId, studentId);
    if (!balance) return res.status(404).json({ success: false, message: 'Student not found' });

    const total_amount = balance.summary?.total_billed  ?? '0.00';
    const paid_amount  = balance.summary?.total_paid    ?? '0.00';
    const bal          = balance.summary?.total_balance ?? '0.00';

    return res.status(200).json({
      success: true,
      data: { total_amount, paid_amount, balance: bal, ...balance }
    });
  } catch (error) { next(error); }
};

const getFeeStructures = async (req, res, next) => {
  try {
    const { class_id, term_id } = req.query;
    const structures = await feesService.getFeeStructures(req.schoolId, {
      class_id: class_id ? parseInt(class_id) : undefined,
      term_id:  term_id  ? parseInt(term_id)  : undefined
    });
    return res.status(200).json({ success: true, data: structures });
  } catch (error) { next(error); }
};

const createFeeStructure = async (req, res, next) => {
  try {
    const { class_id, term_id, fee_type, amount, description, is_mandatory } = req.body;
    if (!class_id || !term_id || !fee_type || !amount)
      return res.status(400).json({ success: false, message: 'Please provide class_id, term_id, fee_type, and amount' });
    if (parseFloat(amount) <= 0)
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });

    const structure = await feesService.createFeeStructure({
      class_id:     parseInt(class_id),
      term_id:      parseInt(term_id),
      fee_type,
      amount:       parseFloat(amount),
      description:  description || null,
      is_mandatory: is_mandatory !== undefined ? is_mandatory : true
    }, req.schoolId);

    return res.status(201).json({ success: true, message: 'Fee structure created successfully', data: structure });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('duplicate'))
      return res.status(409).json({ success: false, message: 'Fee structure already exists for this class, term, and fee type' });
    next(error);
  }
};

const getFeeCollectionSummary = async (req, res, next) => {
  try {
    const { term_id, class_id, start_date, end_date } = req.query;
    const summary = await feesService.getFeeCollectionSummary(req.schoolId, {
      term_id:    term_id  ? parseInt(term_id)  : undefined,
      class_id:   class_id ? parseInt(class_id) : undefined,
      start_date: start_date || undefined,
      end_date:   end_date   || undefined
    });
    return res.status(200).json({ success: true, data: summary });
  } catch (error) { next(error); }
};

const getFeeDefaulters = async (req, res, next) => {
  try {
    const { term_id, class_id, min_balance = 1 } = req.query;
    const defaulters = await feesService.getFeeDefaulters(req.schoolId, {
      term_id:     term_id  ? parseInt(term_id)  : undefined,
      class_id:    class_id ? parseInt(class_id) : undefined,
      min_balance: parseFloat(min_balance)
    });
    return res.status(200).json({ success: true, data: defaulters });
  } catch (error) { next(error); }
};

module.exports = {
  createInvoice, generateInvoice, getInvoices, getInvoiceById, getStudentInvoices,
  recordPayment, getPayments, getPaymentById, getStudentBalance,
  getFeeStructures, createFeeStructure,
  getFeeCollectionSummary, getFeeDefaulters,
};