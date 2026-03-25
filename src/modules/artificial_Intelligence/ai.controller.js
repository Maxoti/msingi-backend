const { askAI } = require('./ai.service');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip characters that could manipulate prompt structure,
 * and cap length to prevent oversized inputs.
 */
const sanitize = (str, maxLen = 200) =>
  typeof str === 'string'
    ? str.replace(/[`${}\\]/g, '').trim().slice(0, maxLen)
    : '';

/**
 * Pre-calculate all metrics locally — keeps the AI prompt lean
 * and gives us structured data to return alongside the analysis.
 */
const buildMetrics = (scores) => {
  const validScores = scores.filter(s => !isNaN(parseFloat(s.score)));
  if (!validScores.length) return null;

  const values   = validScores.map(s => parseFloat(s.score));
  const sum      = values.reduce((a, b) => a + b, 0);
  const average  = (sum / values.length).toFixed(1);
  const avg      = parseFloat(average); // numeric for comparisons

  const strongest = validScores.reduce((a, b) =>
    parseFloat(a.score) > parseFloat(b.score) ? a : b);
  const weakest   = validScores.reduce((a, b) =>
    parseFloat(a.score) < parseFloat(b.score) ? a : b);
  const atRisk    = validScores.filter(s => parseFloat(s.score) < 50);
  const riskLevel = avg < 50 ? 'HIGH' : avg < 65 ? 'MEDIUM' : 'LOW';

  return { average, avg, strongest, weakest, atRisk, riskLevel };
};

// ─── Prompt Builders ────────────────────────────────────────────────────────

const buildAnalysisPrompt = ({ studentName, scores, metrics, history }) => `
You are an academic analyst for a Kenyan CBC school system.
No greetings. No fluff. Be direct and actionable.

STUDENT: ${studentName}
AVERAGE: ${metrics.average}%
RISK LEVEL: ${metrics.riskLevel}
STRONGEST: ${metrics.strongest.subject} (${metrics.strongest.score}%)
WEAKEST: ${metrics.weakest.subject} (${metrics.weakest.score}%)
AT RISK (below 50%): ${metrics.atRisk.map(s => s.subject).join(', ') || 'None'}
${history ? `PREVIOUS AVERAGE: ${history.average}% (${history.examName})` : ''}

SCORES:
${scores.map(s => `${s.subject}: ${s.score}%`).join('\n')}

Respond in EXACTLY this format:

## Performance Summary
[2 sentences: overall level and trend vs previous if available]

## Risk Assessment
[1 sentence: risk level and reason]

## Subject Breakdown
[One line per subject scoring below 65% with a specific action]

## Recommendations
[3 specific actionable steps — no generic advice]
`.trim();

const buildQuestionsPrompt = ({ subject, grade, topic, difficulty }) => `
Generate 5 CBC exam questions for ${grade} ${subject} on "${topic}".
Difficulty: ${difficulty}.
Number them 1-5 and include the answer in brackets after each question.
No preamble. Questions only.
`.trim();

const buildReportPrompt = ({ studentName, examName, metrics, notes }) => `
Write a professional CBC school performance report for ${studentName} in ${examName}.
Average: ${metrics?.average ?? 'N/A'}%
Risk Level: ${metrics?.riskLevel ?? 'N/A'}
Notes: ${notes || 'None'}
3-4 sentences. Professional, warm tone for parents. No fluff.
`.trim();

// ─── Controllers ────────────────────────────────────────────────────────────

const analyzeExamResults = async (req, res, next) => {
  try {
    const { studentName, scores, history } = req.body;

    if (!Array.isArray(scores) || !scores.length)
      return res.status(400).json({ success: false, message: 'scores must be a non-empty array' });

    const metrics = buildMetrics(scores);
    if (!metrics)
      return res.status(400).json({ success: false, message: 'No valid numeric scores provided' });

    const prompt   = buildAnalysisPrompt({
      studentName: sanitize(studentName) || 'Student',
      scores,
      metrics,
      history,
    });
    const analysis = await askAI(prompt);

    res.status(200).json({
      success: true,
      data: {
        analysis,
        metrics: {
          average:  metrics.average,
          riskLevel: metrics.riskLevel,
          strongest: metrics.strongest,
          weakest:   metrics.weakest,
          atRisk:    metrics.atRisk,
        },
      },
    });
  } catch (error) { next(error); }
};

const generateQuestions = async (req, res, next) => {
  try {
    const { subject, grade, topic, difficulty } = req.body;

    if (!subject || !grade || !topic || !difficulty)
      return res.status(400).json({
        success: false,
        message: 'subject, grade, topic, and difficulty are all required',
      });

    const prompt = buildQuestionsPrompt({
      subject:    sanitize(subject),
      grade:      sanitize(grade),
      topic:      sanitize(topic, 300),
      difficulty: sanitize(difficulty),
    });
    const result = await askAI(prompt);

    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

const generateReport = async (req, res, next) => {
  try {
    const { studentName, examName, scores, notes } = req.body;

    if (!studentName || !examName)
      return res.status(400).json({
        success: false,
        message: 'studentName and examName are required',
      });

    const metrics = buildMetrics(scores || []);
    const prompt  = buildReportPrompt({
      studentName: sanitize(studentName),
      examName:    sanitize(examName),
      metrics,
      notes:       sanitize(notes, 500),
    });
    const result = await askAI(prompt);

    res.status(200).json({ success: true, data: result });
  } catch (error) { next(error); }
};

module.exports = { analyzeExamResults, generateQuestions, generateReport };