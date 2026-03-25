const setCurrentSchool = (req, res, next) => {
  const schoolId = req.headers['x-school-id'];
  if (!schoolId) {
    return res.status(400).json({ success: false, message: 'School ID is required' });
  }
  req.currentSchool = { id: schoolId };
  next();
};

module.exports = setCurrentSchool;