const jwt = require('jsonwebtoken');
const { cleanStr, createHttpError } = require('../utils/common');

function createAuthMiddleware({ jwtSecret }) {
  function requireAuth(req, res, next) {
    try {
      const authHeader = cleanStr(req.get('authorization'));
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const token = authHeader.slice(7).trim();
      if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!jwtSecret) {
        return next(createHttpError(500, 'JWT secret is not configured.'));
      }

      const decoded = jwt.verify(token, jwtSecret);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        first_name: decoded.first_name,
        last_name: decoded.last_name,
        role: cleanStr(decoded.role).toLowerCase() || null,
        is_super_admin: decoded.is_super_admin === true,
        tenant_id: cleanStr(decoded.tenant_id || decoded.tenantId) || null,
        active_tenant_id: cleanStr(decoded.active_tenant_id || decoded.activeTenantId) || null,
      };

      return next();
    } catch (error) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      return next(error);
    }
  }

  return { requireAuth };
}

module.exports = { createAuthMiddleware };
