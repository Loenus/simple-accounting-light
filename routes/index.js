const express = require('express');
const logger = require('../config/logger');

const router = express.Router();

router.get('/', (req, res) => {
  logger.info('Accesso alla homepage');
  res.render('index', { message: null });
});

module.exports = router;
