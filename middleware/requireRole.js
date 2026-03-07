const { cleanStr } = require('../utils/common');

function createRoleMiddleware({ requireAuth, resolveActorTenant }) {
  function requireSuperAdmin(req, res, next) {
    return requireAuth(req, res, (authError) => {
      if (authError) {
        return next(authError);
      }

      if (!req.user || req.user.is_super_admin !== true) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      return next();
    });
  }

  async function requireTenantRoles(req, roles = []) {
    const actor = await resolveActorTenant(req);
    if (!roles.includes(actor.role)) {
      return null;
    }
    return actor;
  }

  async function requireTenantManagerRole(req, res) {
    const actor = await resolveActorTenant(req);
    if (!['owner', 'admin', 'manager', 'super_admin'].includes(actor.role)) {
      res.status(403).json({ message: 'Нямате права за управление на отсъствия.' });
      return null;
    }
    return actor;
  }

  function ensureAdmin(req, res) {
    const role = cleanStr(req.user?.role).toLowerCase();
    const isSuperAdmin = req.user?.is_super_admin === true;
    if (!['admin', 'owner'].includes(role) && !isSuperAdmin) {
      res.status(403).json({ message: 'Само администратор може да изтрива служители.' });
      return false;
    }
    return true;
  }

  return {
    requireSuperAdmin,
    requireTenantRoles,
    requireTenantManagerRole,
    ensureAdmin,
  };
}

module.exports = { createRoleMiddleware };
