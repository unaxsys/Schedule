async function listSchedulesByTenant(pool, tenantId) {
  return pool.query('SELECT * FROM schedules WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
}

module.exports = {
  listSchedulesByTenant,
};
