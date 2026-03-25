/**
 * Terms Controller
 * req.schoolId passed to every service call for multi-tenancy
 */

const termsService = require('./terms.service');

const formatDate = (dateValue) => {
  if (!dateValue) return dateValue;
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date.getTime())) return dateValue;
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTerm  = (term)  => !term ? term : {
  ...term,
  ...(term.start_date && { start_date: formatDate(term.start_date) }),
  ...(term.end_date   && { end_date:   formatDate(term.end_date)   }),
};
const formatTerms = (terms) => Array.isArray(terms) ? terms.map(formatTerm) : terms;

const isNotFound        = (err) => err.message === 'Academic term not found';
const isValidationError = (err) =>
  ['already exists','overlap','required','must be','Invalid','Cannot'].some(s => err.message.includes(s));

const getAllTerms = async (req, res, next) => {
  try {
    const { year, is_active, page, limit } = req.query;
    const filters = {};
    if (year      !== undefined) filters.year      = parseInt(year);
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (page      !== undefined) filters.page      = parseInt(page);
    if (limit     !== undefined) filters.limit     = parseInt(limit);

    const result = await termsService.getAllTerms(req.schoolId, filters);
    return res.status(200).json({ success: true, data: formatTerms(result.terms), pagination: result.pagination });
  } catch (err) { next(err); }
};

const getTermById = async (req, res, next) => {
  try {
    const term = await termsService.getTermById(req.schoolId, parseInt(req.params.id));
    return res.status(200).json({ success: true, data: formatTerm(term) });
  } catch (err) {
    if (isNotFound(err)) return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
};

const getActiveTerm = async (req, res, next) => {
  try {
    const term = await termsService.getActiveTerm(req.schoolId);
    return res.status(200).json({ success: true, data: formatTerm(term) });
  } catch (err) {
    if (err.message.includes('No active academic term'))
      return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
};

const getTermsByYear = async (req, res, next) => {
  try {
    const terms = await termsService.getTermsByYear(req.schoolId, parseInt(req.params.year));
    return res.status(200).json({ success: true, data: formatTerms(terms) });
  } catch (err) { next(err); }
};

const getAllYears = async (req, res, next) => {
  try {
    const years = await termsService.getAllYears(req.schoolId);
    return res.status(200).json({ success: true, data: years });
  } catch (err) { next(err); }
};

const getCurrentTerm = async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const term = await termsService.getCurrentTermByDate(req.schoolId, date);
    if (!term) return res.status(404).json({ success: false, message: 'No term found for the specified date' });
    return res.status(200).json({ success: true, data: formatTerm(term) });
  } catch (err) { next(err); }
};

const createTerm = async (req, res, next) => {
  try {
    const { year, term, start_date, end_date, is_active } = req.body;
    if (!year || !term || !start_date || !end_date)
      return res.status(400).json({ success: false, message: 'year, term, start_date, and end_date are required' });

    const newTerm = await termsService.createTerm({
      year: parseInt(year), term: parseInt(term), start_date, end_date, is_active: is_active || false
    }, req.schoolId);

    return res.status(201).json({ success: true, message: 'Academic term created successfully', data: formatTerm(newTerm) });
  } catch (err) {
    if (isValidationError(err)) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

const updateTerm = async (req, res, next) => {
  try {
    const { start_date, end_date, is_active } = req.body;
    const updates = {};
    if (start_date !== undefined) updates.start_date = start_date;
    if (end_date   !== undefined) updates.end_date   = end_date;
    if (is_active  !== undefined) updates.is_active  = is_active;

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, message: 'No fields to update' });

    const updated = await termsService.updateTerm(req.schoolId, parseInt(req.params.id), updates);
    return res.status(200).json({ success: true, message: 'Academic term updated successfully', data: formatTerm(updated) });
  } catch (err) {
    if (isNotFound(err))        return res.status(404).json({ success: false, message: err.message });
    if (isValidationError(err)) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

const setActiveTerm = async (req, res, next) => {
  try {
    const term = await termsService.setActiveTerm(req.schoolId, parseInt(req.params.id));
    return res.status(200).json({ success: true, message: 'Term set as active successfully', data: formatTerm(term) });
  } catch (err) {
    if (isNotFound(err)) return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
};

const deleteTerm = async (req, res, next) => {
  try {
    await termsService.deleteTerm(req.schoolId, parseInt(req.params.id));
    return res.status(200).json({ success: true, message: 'Academic term deleted successfully' });
  } catch (err) {
    if (isNotFound(err))        return res.status(404).json({ success: false, message: err.message });
    if (isValidationError(err)) return res.status(400).json({ success: false, message: err.message });
    next(err);
  }
};

const getTermStatistics = async (req, res, next) => {
  try {
    const stats = await termsService.getTermStatistics(req.schoolId, parseInt(req.params.id));
    if (stats.term_info) stats.term_info = formatTerm(stats.term_info);
    return res.status(200).json({ success: true, data: stats });
  } catch (err) {
    if (isNotFound(err)) return res.status(404).json({ success: false, message: err.message });
    next(err);
  }
};

module.exports = {
  getAllTerms, getTermById, getActiveTerm, getTermsByYear,
  getAllYears, createTerm, updateTerm, setActiveTerm,
  deleteTerm, getCurrentTerm, getTermStatistics
};