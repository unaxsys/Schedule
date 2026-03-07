const express = require('express');
const { healthHandler } = require('../controllers/healthController');

function createHealthRouter(pool) {
  const router = express.Router();
  router.get('/health', (req, res) => healthHandler(pool, req, res));
  return router;
}

module.exports = { createHealthRouter };
