/**
 * Terms Service
 * schoolId threaded through every operation for multi-tenancy
 */

const termsRepository = require('./terms.repository');
const db              = require('../../shared/database/client');
const cache           = require('../../shared/cache/cache.service');

const getAllTerms = async (schoolId, filters = {}) => {
  const cacheKey = `terms:${schoolId}:${JSON.stringify(filters)}`;

  // ✅ Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await termsRepository.findAll(schoolId, filters);

  // ✅ Store in cache
  await cache.set(cacheKey, data, cache.TTL.terms);

  return data;
};

const getTermById = async (schoolId, id) => {
  const cacheKey = `terms:${schoolId}:id:${id}`;

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const term = await termsRepository.findById(schoolId, id);
  if (!term) throw new Error('Academic term not found');

  await cache.set(cacheKey, term, cache.TTL.terms);
  return term;
};

const getActiveTerm = async (schoolId) => {
  const cacheKey = `terms:${schoolId}:active`;

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const term = await termsRepository.findActive(schoolId);
  if (!term) throw new Error('No active academic term found. Please set an active term.');

  await cache.set(cacheKey, term, cache.TTL.terms);
  return term;
};

const getTermsByYear = async (schoolId, year) => {
  if (!year) throw new Error('Year is required');
  if (year < 2000 || year > 2100) throw new Error('Invalid year');

  const cacheKey = `terms:${schoolId}:year:${year}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await termsRepository.findByYear(schoolId, year);
  await cache.set(cacheKey, data, cache.TTL.terms);
  return data;
};

const getAllYears = async (schoolId) => {
  const cacheKey = `terms:${schoolId}:years`;
  const cached   = await cache.get(cacheKey);
  if (cached) return cached;

  const data = await termsRepository.findAllYears(schoolId);
  await cache.set(cacheKey, data, cache.TTL.terms);
  return data;
};

const createTerm = async (termData, schoolId) => {
  const { year, term, start_date, end_date, is_active } = termData;
  const errors = [];

  if (!year)       errors.push('Year is required');
  if (!term)       errors.push('Term is required');
  if (!start_date) errors.push('Start date is required');
  if (!end_date)   errors.push('End date is required');

  if (year && (year < 2000 || year > 2100)) errors.push('Year must be between 2000 and 2100');
  if (term && ![1,2,3].includes(term))       errors.push('Term must be 1, 2, or 3');

  if (start_date && end_date) {
    const s = new Date(start_date), e = new Date(end_date);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) errors.push('Invalid date format');
    else if (s >= e) errors.push('Start date must be before end date');
    else {
      const days = (e - s) / 86400000;
      if (days < 30)  errors.push('Term must be at least 30 days long');
      if (days > 150) errors.push('Term cannot be longer than 150 days');
    }
  }

  if (errors.length > 0) throw new Error(errors.join(', '));

  if (await termsRepository.exists(schoolId, year, term))
    throw new Error(`Academic term ${term} for year ${year} already exists`);

  const existingTerms = await termsRepository.findByYear(schoolId, year);
  const ns = new Date(start_date), ne = new Date(end_date);
  for (const et of existingTerms) {
    const es = new Date(et.start_date), ee = new Date(et.end_date);
    if ((ns >= es && ns <= ee) || (ne >= es && ne <= ee) || (ns <= es && ne >= ee))
      throw new Error(`Date overlap with existing Term ${et.term} (${et.start_date} to ${et.end_date})`);
  }

  if (is_active) await termsRepository.deactivateAll(schoolId);

  const result = await termsRepository.create(
    { year, term, start_date, end_date, is_active: is_active || false },
    schoolId
  );

  // ✅ Invalidate cache
  await cache.delPattern(`terms:${schoolId}:*`);

  return result;
};

const updateTerm = async (schoolId, id, updates) => {
  const { start_date, end_date, is_active } = updates;

  const existing = await termsRepository.findById(schoolId, id);
  if (!existing) throw new Error('Academic term not found');

  const finalStart = start_date || existing.start_date;
  const finalEnd   = end_date   || existing.end_date;
  const s = new Date(finalStart), e = new Date(finalEnd);

  if (isNaN(s.getTime()) || isNaN(e.getTime())) throw new Error('Invalid date format');
  if (s >= e) throw new Error('Start date must be before end date');

  const days = (e - s) / 86400000;
  if (days < 30)  throw new Error('Term must be at least 30 days long');
  if (days > 150) throw new Error('Term cannot be longer than 150 days');

  let result;
  if (is_active === true) {
    result = await termsRepository.setActive(schoolId, id);
  } else {
    if (is_active === false && existing.is_active) {
      const all = await termsRepository.findAll(schoolId, {});
      if (all.terms.filter(t => t.is_active).length === 1)
        throw new Error('Cannot deactivate the only active term. Set another term as active first.');
    }
    result = await termsRepository.update(schoolId, id, updates);
  }

  // ✅ Invalidate cache
  await cache.delPattern(`terms:${schoolId}:*`);

  return result;
};

const setActiveTerm = async (schoolId, id) => {
  const term = await termsRepository.findById(schoolId, id);
  if (!term) throw new Error('Academic term not found');

  const result = await termsRepository.setActive(schoolId, id);

  // ✅ Invalidate cache
  await cache.delPattern(`terms:${schoolId}:*`);

  return result;
};

const deleteTerm = async (schoolId, id) => {
  const term = await termsRepository.findById(schoolId, id);
  if (!term) throw new Error('Academic term not found');
  if (term.is_active) throw new Error('Cannot delete the active term. Set another term as active first.');

  const examCount = await db.schoolQueryOne(schoolId,
    'SELECT COUNT(*) AS count FROM exams WHERE term_id = $1', [id]
  );
  if (parseInt(examCount.count) > 0)
    throw new Error(`Cannot delete term. It has ${examCount.count} associated exam(s). Delete the exams first.`);

  const result = await termsRepository.deleteTerm(schoolId, id);

  // ✅ Invalidate cache
  await cache.delPattern(`terms:${schoolId}:*`);

  return result;
};

const getCurrentTermByDate = async (schoolId, date = new Date()) => {
  const result     = await termsRepository.findAll(schoolId, {});
  const searchDate = new Date(date);
  return result.terms.find(t => {
    const s = new Date(t.start_date), e = new Date(t.end_date);
    return searchDate >= s && searchDate <= e;
  }) || null;
};

const getTermStatistics = async (schoolId, termId) => {
  const cacheKey = `terms:${schoolId}:stats:${termId}`;

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const term = await termsRepository.findById(schoolId, termId);
  if (!term) throw new Error('Academic term not found');

  const examStats = await db.schoolQueryOne(schoolId,
    `SELECT
       COUNT(*) AS total_exams,
       COUNT(*) FILTER (WHERE status = 'PUBLISHED') AS published_exams,
       COUNT(*) FILTER (WHERE status = 'DRAFT')     AS draft_exams
     FROM exams WHERE term_id = $1`,
    [termId]
  );

  const now = new Date();
  const s   = new Date(term.start_date), e = new Date(term.end_date);
  const totalDays   = (e - s) / 86400000;
  const elapsedDays = Math.max(0, (now - s) / 86400000);
  const progress    = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));

  const data = {
    term_info:  term,
    statistics: {
      total_exams:     parseInt(examStats.total_exams)     || 0,
      published_exams: parseInt(examStats.published_exams) || 0,
      draft_exams:     parseInt(examStats.draft_exams)     || 0,
    },
    progress: {
      start_date:          term.start_date,
      end_date:            term.end_date,
      total_days:          Math.ceil(totalDays),
      elapsed_days:        Math.ceil(elapsedDays),
      remaining_days:      Math.max(0, Math.ceil(totalDays - elapsedDays)),
      progress_percentage: Math.round(progress * 100) / 100,
      status: now < s ? 'upcoming' : now > e ? 'completed' : 'ongoing'
    }
  };

  await cache.set(cacheKey, data, cache.TTL.dashboard);
  return data;
};

module.exports = {
  getAllTerms, getTermById, getActiveTerm, getTermsByYear,
  getAllYears, createTerm, updateTerm, setActiveTerm,
  deleteTerm, getCurrentTermByDate, getTermStatistics
};