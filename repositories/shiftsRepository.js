async function listShiftTemplatesByTenant(pool, tenantId) {
  return pool.query('SELECT * FROM shift_templates WHERE tenant_id = $1 ORDER BY code ASC', [tenantId]);
}

module.exports = {
  listShiftTemplatesByTenant,
};
