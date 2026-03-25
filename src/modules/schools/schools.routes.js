const express = require('express');
const router = express.Router();
const schoolsController = require('./schools.controller');
router.post('/onboard', schoolsController.onboard);

module.exports = router;
