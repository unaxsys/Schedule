async function listDepartmentsByTenant(pool, tenantId) {
  return pool.query('SELECT * FROM departments WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
}

module.exports = {
  listDepartmentsByTenant,
};
