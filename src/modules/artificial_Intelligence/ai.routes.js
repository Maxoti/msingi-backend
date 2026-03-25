const express    = require('express');
const rateLimit  = require('express-rate-limit');
const router     = express.Router();
const { analyzeExamResults, generateQuestions, generateReport } = require('./ai.controller');

const aiLimiter = rateLimit({
  windowMs:     60 * 60 * 1000,
  max:          50,
  keyGenerator: (req) => req.schoolId, // per-tenant, not per-IP
  message: {
    success: false,
    message: 'AI request limit reached. Try again in an hour.'
  }
});

router.post('/analyze',    aiLimiter, analyzeExamResults);
router.post('/questions',  aiLimiter, generateQuestions);
router.post('/report',     aiLimiter, generateReport);

module.exports = router;