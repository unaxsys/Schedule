async function getApprovedMembershipsByUser(pool, userId) {
  return pool.query(
    `SELECT tu.tenant_id AS "tenantId", tu.role
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1
       AND t.status = 'approved'
     ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, tu.tenant_id`,
    [userId]
  );
}

async function getApprovedMembershipRole(pool, userId, tenantId) {
  return pool.query(
    `SELECT tu.role
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1
       AND tu.tenant_id = $2
       AND t.status = 'approved'
     LIMIT 1`,
    [userId, tenantId]
  );
}

module.exports = {
  getApprovedMembershipsByUser,
  getApprovedMembershipRole,
};
