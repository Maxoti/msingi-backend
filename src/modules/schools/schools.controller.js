const schoolService = require('./schools.service');

const onboard = async (req, res) => {
  try {
    const result = await schoolService.onboard(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

module.exports = { onboard };