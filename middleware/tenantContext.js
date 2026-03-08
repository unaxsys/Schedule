const { cleanStr, isValidUuid, createHttpError } = require('../utils/common');

function createTenantContextMiddleware({ pool, tenantRepository }) {
  function isPlatformRoute(req) {
    return String(req.path || '').startsWith('/api/platform/');
  }

  async function resolveTenantId(req) {
    const isSuperAdmin = req.user?.is_super_admin === true;
    if (isSuperAdmin) {
      const requestedTenantId = cleanStr(
        req.body?.tenantId
        || req.body?.registrationId
        || req.query?.tenantId
        || req.get('x-tenant-id')
      );

      if (isPlatformRoute(req)) {
        if (!requestedTenantId) {
          throw createHttpError(400, 'Липсва tenantId (избери организация).');
        }
        if (!isValidUuid(requestedTenantId)) {
          throw createHttpError(400, 'Невалиден tenantId.');
        }
        return requestedTenantId;
      }

      const explicitActiveTenantId = cleanStr(req.user?.active_tenant_id || req.user?.tenant_id);
      if (requestedTenantId) {
        if (!isValidUuid(requestedTenantId)) {
          throw createHttpError(400, 'Невалиден tenantId.');
        }
        return requestedTenantId;
      }

      if (!explicitActiveTenantId || !isValidUuid(explicitActiveTenantId)) {
        throw createHttpError(403, 'Изберете организация (tenant) преди достъп до този ресурс.');
      }

      return explicitActiveTenantId;
    }

    const membership = await tenantRepository.getApprovedMembershipsByUser(pool, req.user?.id);

    if (!membership.rowCount) {
      throw createHttpError(403, 'Нямате организация за управление.');
    }

    const tokenTenantId = cleanStr(req.user?.active_tenant_id || req.user?.tenant_id);
    if (!tokenTenantId) {
      if (membership.rowCount > 1) {
        throw createHttpError(403, 'Потребителят има достъп до повече от една организация. Изберете tenant при вход.');
      }
      return membership.rows[0].tenantId;
    }

    if (!isValidUuid(tokenTenantId)) {
      throw createHttpError(403, 'Невалиден tenant контекст в токена.');
    }

    const membershipForTokenTenant = membership.rows.find((row) => row.tenantId === tokenTenantId);
    if (!membershipForTokenTenant) {
      throw createHttpError(403, 'Нямате права за избрания tenant.');
    }

    return tokenTenantId;
  }

  async function resolveActorTenant(req) {
    const tenantId = await resolveTenantId(req);

    if (req.user?.is_super_admin === true) {
      return { tenantId, role: 'super_admin' };
    }

    const membership = await tenantRepository.getApprovedMembershipRole(pool, req.user?.id, tenantId);

    if (!membership.rowCount) {
      throw createHttpError(403, 'Нямате права за избрания tenant.');
    }

    return {
      tenantId,
      role: cleanStr(membership.rows[0].role).toLowerCase(),
    };
  }

  async function requireTenantContext(req, res, next) {
    try {
      const tenantId = await resolveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ message: 'Missing tenant context.' });
      }
      req.tenantId = tenantId;
      return next();
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      return next(error);
    }
  }

  return {
    resolveTenantId,
    resolveActorTenant,
    requireTenantContext,
  };
}

module.exports = { createTenantContextMiddleware };
