async function healthHandler(pool, _req, res) {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true, service: 'schedule-backend' });
  } catch (error) {
    res.status(500).json({ ok: false, db: false, message: error.message });
  }
}

module.exports = { healthHandler };
