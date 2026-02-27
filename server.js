require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const {
  DEFAULT_WEEKEND_RATE,
  DEFAULT_HOLIDAY_RATE,
  computeMonthlySummary,
  calcShiftDurationHours,
  calcNightHours,
  calcDayType,
  summarizeViolationStatus,
} = require('./labor_rules');
const {
  computeEntryMetrics,
  holidayResolverFactory,
  validateScheduleEntry,
  countBusinessDays,
  dateAdd,
} = require('./schedule_calculations');
const {
  getDaysOfMonth,
  buildPattern,
  validateRest,
  applyOverwriteMode,
} = require('./schedule_generator');

const app = express();
const port = Number(process.env.PORT || 4000);

const pool =
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'schedule_db',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
      });

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Role'],
  })
);

app.use(express.json());

function isValidUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function cleanStr(v) {
  return String(v ?? '').trim();
}

function normalizeShiftCode(input) {
  const raw = cleanStr(input);
  if (!raw) {
    return '';
  }

  const latinUpper = raw.toUpperCase();
  if (['R', 'P', 'O', 'B'].includes(latinUpper)) {
    return latinUpper;
  }

  const cyrillicMap = {
    'Р': 'R',
    'р': 'R',
    'П': 'P',
    'п': 'P',
    'О': 'O',
    'о': 'O',
    'Б': 'B',
    'б': 'B',
  };

  if (cyrillicMap[raw]) {
    return cyrillicMap[raw];
  }

  return latinUpper;
}

function computeSystemShiftSnapshot(shiftCode, date) {
  const normalized = normalizeShiftCode(shiftCode);
  if (normalized === 'R') {
    const workMinutes = 480;
    const { isWeekend, isHoliday } = calcDayType(date);
    return {
      work_minutes: workMinutes,
      work_minutes_total: workMinutes,
      night_minutes: 0,
      holiday_minutes: isHoliday ? workMinutes : 0,
      weekend_minutes: isWeekend ? workMinutes : 0,
      overtime_minutes: 0,
      break_minutes_applied: 0,
    };
  }

  if (['P', 'O', 'B'].includes(normalized)) {
    return {
      work_minutes: 0,
      work_minutes_total: 0,
      night_minutes: 0,
      holiday_minutes: 0,
      weekend_minutes: 0,
      overtime_minutes: 0,
      break_minutes_applied: 0,
    };
  }

  return null;
}

function ensureAdmin(req, res) {
  const role = cleanStr(req.get('x-user-role')).toLowerCase();
  if (!['admin', 'super_admin'].includes(role)) {
    res.status(403).json({ message: 'Само администратор може да изтрива служители.' });
    return false;
  }
  return true;
}

const JWT_SECRET = cleanStr(process.env.JWT_SECRET);
const JWT_EXPIRES_IN = cleanStr(process.env.JWT_EXPIRES_IN || '12h');
const LOGIN_TOKEN_EXPIRES_IN = cleanStr(process.env.LOGIN_TOKEN_EXPIRES_IN || '5m');

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeTenantRole(role) {
  const normalized = cleanStr(role).toLowerCase();
  return ['owner', 'admin', 'manager', 'user'].includes(normalized) ? normalized : 'user';
}

function normalizeTenantStatus(status) {
  const normalized = cleanStr(status).toLowerCase();
  return ['pending', 'approved', 'disabled'].includes(normalized) ? normalized : 'pending';
}

function mapTenantMembership(row) {
  return {
    id: row.tenantId,
    name: cleanStr(row.tenantName),
    role: normalizeTenantRole(row.role),
    status: normalizeTenantStatus(row.status),
  };
}

function buildUserPayload(user, tenantId = null, role = null) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    is_super_admin: user.is_super_admin === true,
    tenantId,
    role: normalizeTenantRole(role),
  };
}

function emptyComputedSummary() {
  return {
    workedDays: 0,
    workedHours: 0,
    normHours: 0,
    deviation: 0,
    holidayWorkedHours: 0,
    weekendWorkedHours: 0,
    nightWorkedHours: 0,
    nightConvertedHours: 0,
    payableHours: 0,
    vacationDays: 0,
    sickDays: 0,
    violations: [],
    workedMinutes: 0,
    normMinutes: 0,
    overtimeMinutes: 0,
    normalMinutes: 0,
    nightMinutes: 0,
    holidayMinutes: 0,
    overtimeWeekdayMinutes: 0,
    overtimeRestdayMinutes: 0,
    overtimeHolidayMinutes: 0,
  };
}

function addSummaries(target, source) {
  const result = { ...target };
  const keys = [
    'workedDays',
    'workedHours',
    'normHours',
    'deviation',
    'holidayWorkedHours',
    'weekendWorkedHours',
    'nightWorkedHours',
    'nightConvertedHours',
    'payableHours',
    'vacationDays',
    'sickDays',
    'workedMinutes',
    'normMinutes',
    'overtimeMinutes',
    'normalMinutes',
    'nightMinutes',
    'holidayMinutes',
    'overtimeWeekdayMinutes',
    'overtimeRestdayMinutes',
    'overtimeHolidayMinutes',
  ];
  for (const key of keys) {
    result[key] = Number(result[key] || 0) + Number(source[key] || 0);
  }
  result.violations = [...(target.violations || []), ...(source.violations || [])];
  return result;
}


const SYSTEM_SHIFT_TEMPLATES = [
  { code: 'R', name: 'Редовна', start_time: '08:00', end_time: '17:00', break_minutes: 60, hours: 8 },
  { code: 'P', name: 'Почивка', start_time: '00:00', end_time: '00:00', hours: 0 },
  { code: 'O', name: 'Отпуск', start_time: '00:00', end_time: '00:00', hours: 0 },
  { code: 'B', name: 'Болничен', start_time: '00:00', end_time: '00:00', hours: 0 },
];

async function buildHolidayResolver() {
  const hasHolidaysTable = await tableExists('holidays');
  if (!hasHolidaysTable) {
    return holidayResolverFactory(new Set());
  }

  const rows = await pool.query('SELECT date::text AS date FROM holidays');
  const dates = new Set(rows.rows.map((row) => normalizeDateOnly(row.date)).filter(Boolean));
  return holidayResolverFactory(dates);
}

function getSirvPeriodBounds(monthKey, periodMonths = 1) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const totalMonths = Math.min(4, Math.max(1, Number(periodMonths) || 1));
  const end = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(Date.UTC(year, month - totalMonths, 1));
  const periodStart = start.toISOString().slice(0, 10);
  const periodEndDate = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0));
  return { periodStart, periodEnd: periodEndDate.toISOString().slice(0, 10) };
}

async function computeEntrySnapshot({ date, shift, isHoliday, sirvEnabled = false, dailyNormMinutes = 480 }) {
  const metrics = computeEntryMetrics({
    dateISO: date,
    shift,
    isHoliday,
    sirvEnabled,
    dailyNormMinutes,
  });

  return {
    work_minutes: metrics.work_minutes_total,
    work_minutes_total: metrics.work_minutes_total,
    night_minutes: metrics.night_minutes,
    holiday_minutes: metrics.holiday_minutes,
    weekend_minutes: metrics.weekend_minutes,
    overtime_minutes: metrics.overtime_minutes,
    break_minutes_applied: metrics.break_minutes_applied,
  };
}

let shiftTemplatesHasTenantIdCache = null;
let shiftTemplatesHasDepartmentIdCache = null;

async function hasShiftTemplatesTenantId() {
  if (shiftTemplatesHasTenantIdCache === null) {
    shiftTemplatesHasTenantIdCache = await tableHasColumn('shift_templates', 'tenant_id');
  }
  return shiftTemplatesHasTenantIdCache;
}

async function hasShiftTemplatesDepartmentId() {
  if (shiftTemplatesHasDepartmentIdCache === null) {
    shiftTemplatesHasDepartmentIdCache = await tableHasColumn('shift_templates', 'department_id');
  }
  return shiftTemplatesHasDepartmentIdCache;
}

function buildShiftTemplateScopeCondition({ hasDepartmentId, departmentId, tenantScoped, startIndex = 1 }) {
  const values = [];
  const conditions = [];
  if (tenantScoped) {
    values.push(tenantScoped);
    conditions.push(`tenant_id = $${startIndex + values.length - 1}`);
  }
  if (hasDepartmentId) {
    if (departmentId) {
      values.push(departmentId);
      conditions.push(`(department_id = $${startIndex + values.length - 1} OR department_id IS NULL)`);
    } else {
      conditions.push('department_id IS NULL');
    }
  }
  return {
    values,
    whereSql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
  };
}

async function ensureDefaultShiftTemplatesForTenant(tenantId) {
  const hasTenantId = await hasShiftTemplatesTenantId();

  if (hasTenantId) {
    for (const shift of SYSTEM_SHIFT_TEMPLATES) {
      await pool.query(
        `INSERT INTO shift_templates (tenant_id, code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, code) WHERE department_id IS NULL DO NOTHING`,
        [tenantId, shift.code, shift.name, shift.start_time, shift.end_time, Number(shift.break_minutes || 0), Boolean(shift.break_included), shift.is_sirv_shift || null, shift.hours]
      );
    }
    return;
  }

  for (const shift of SYSTEM_SHIFT_TEMPLATES) {
    await pool.query(
      `INSERT INTO shift_templates (code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (code) DO NOTHING`,
      [shift.code, shift.name, shift.start_time, shift.end_time, Number(shift.break_minutes || 0), Boolean(shift.break_included), shift.is_sirv_shift || null, shift.hours]
    );
  }
}

function appendSystemShiftTemplates(shiftTemplates = []) {
  const byCode = new Map();
  for (const template of shiftTemplates) {
    const code = cleanStr(template.code).toUpperCase();
    if (!code) {
      continue;
    }
    byCode.set(code, {
      ...template,
      code,
      start_time: template.start_time || template.start || '',
      end_time: template.end_time || template.end || '',
      hours: Number(template.hours || 0),
      break_minutes: Number(template.break_minutes || 0),
      break_included: Boolean(template.break_included),
      is_sirv_shift: template.is_sirv_shift === undefined ? null : Boolean(template.is_sirv_shift),
    });
  }

  for (const shift of SYSTEM_SHIFT_TEMPLATES) {
    if (!byCode.has(shift.code)) {
      byCode.set(shift.code, { ...shift });
    }
  }

  return Array.from(byCode.values());
}

function signAccessToken({ user, tenantId = null, role = null }) {
  if (!JWT_SECRET) {
    throw createHttpError(500, 'JWT secret is not configured.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_super_admin: user.is_super_admin === true,
      tenant_id: tenantId,
      active_tenant_id: tenantId,
      role: normalizeTenantRole(role),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function signLoginSelectionToken(userId) {
  if (!JWT_SECRET) {
    throw createHttpError(500, 'JWT secret is not configured.');
  }

  return jwt.sign(
    {
      sub: userId,
      type: 'login_tenant_select',
    },
    JWT_SECRET,
    { expiresIn: LOGIN_TOKEN_EXPIRES_IN }
  );
}

function verifyLoginSelectionToken(token) {
  if (!JWT_SECRET) {
    throw createHttpError(500, 'JWT secret is not configured.');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded?.type !== 'login_tenant_select') {
      throw createHttpError(401, 'Невалиден loginToken.');
    }
    const userId = cleanStr(decoded.sub);
    if (!isValidUuid(userId)) {
      throw createHttpError(401, 'Невалиден loginToken.');
    }
    return userId;
  } catch (error) {
    if (error.status) {
      throw error;
    }
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      throw createHttpError(401, 'Невалиден loginToken.');
    }
    throw error;
  }
}

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

    if (!JWT_SECRET) {
      return next(createHttpError(500, 'JWT secret is not configured.'));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
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

function isPlatformRoute(req) {
  return String(req.path || '').startsWith('/api/platform/');
}

function requireSuperAdmin(req, res, next) {
  const roleHeader = cleanStr(req.get('x-user-role')).toLowerCase();
  if (roleHeader === 'super_admin') {
    req.user = req.user || {
      id: null,
      email: '',
      first_name: '',
      last_name: '',
      is_super_admin: true,
    };
    return next();
  }

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

async function resolveTenantId(req) {
  const isSuperAdmin = req.user?.is_super_admin === true;
  if (isSuperAdmin) {
    const requestedTenantId = cleanStr(req.body?.tenantId || req.body?.registrationId || req.query?.tenantId);
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
    if (!explicitActiveTenantId || !isValidUuid(explicitActiveTenantId)) {
      console.warn('TENANT RESOLUTION BLOCKED: super admin without explicit active tenant on non-platform route', {
        path: req.path,
        userId: req.user?.id || null,
      });
      throw createHttpError(403, 'Изберете организация (tenant) преди достъп до този ресурс.');
    }

    return explicitActiveTenantId;
  }

  const membership = await pool.query(
    `SELECT tu.tenant_id AS "tenantId", tu.role
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1
       AND t.status = 'approved'
     ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, tu.tenant_id`,
    [req.user?.id]
  );

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

  const membership = await pool.query(
    `SELECT tu.role
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1
       AND tu.tenant_id = $2
       AND t.status = 'approved'
     LIMIT 1`,
    [req.user?.id, tenantId]
  );

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
      console.warn('TENANT ASSERTION FAILED: tenant_id missing for tenant route', {
        path: req.path,
        userId: req.user?.id || null,
      });
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

async function insertAuditLog(action, entity, payload = {}) {
  try {
    const hasScheduleId = await tableHasColumn('audit_log', 'schedule_id');
    if (hasScheduleId) {
      await pool.query(
        `INSERT INTO audit_log (
          tenant_id, actor_user_id, schedule_id, employee_id, entry_date,
          old_shift_code, new_shift_code, old_shift_id, new_shift_id, action, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
        [
          payload.tenantId || null,
          payload.actorUserId || null,
          payload.scheduleId || null,
          payload.employeeId || null,
          payload.entryDate || null,
          payload.oldShiftCode || null,
          payload.newShiftCode || null,
          payload.oldShiftId || null,
          payload.newShiftId || null,
          action,
          JSON.stringify({
            entity: entity || null,
            entityId: payload.entityId || null,
            before: payload.before || null,
            after: payload.after || null,
            ip: payload.ip || null,
            userAgent: payload.userAgent || null,
          }),
        ]
      );
      return;
    }

    await pool.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity, entity_id, before_json, after_json, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        payload.tenantId || null,
        payload.actorUserId || null,
        action,
        entity || null,
        payload.entityId || null,
        payload.before ? JSON.stringify(payload.before) : null,
        payload.after ? JSON.stringify(payload.after) : null,
        payload.ip || null,
        payload.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('AUDIT LOG ERROR:', error.message);
  }
}

function splitFullName(fullName) {
  const parts = cleanStr(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1)[0],
  };
}

function isValidMonthKey(value) {
  return /^\d{4}-\d{2}$/.test(cleanStr(value));
}

function normalizeDepartmentName(value) {
  const text = cleanStr(value);
  return text.length ? text : null;
}

async function tableExists(tableName) {
  const check = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return Boolean(check.rows[0]?.exists);
}

async function tableHasColumn(tableName, columnName) {
  const check = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return Boolean(check.rowCount);
}


function normalizeDateOnly(value) {
  const text = cleanStr(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isValidEmploymentRange(startDate, endDate) {
  if (!startDate) {
    return false;
  }
  if (!endDate) {
    return true;
  }
  return endDate >= startDate;
}


function getMonthBounds(monthKey) {
  if (!isValidMonthKey(monthKey)) {
    return null;
  }

  const [year, month] = monthKey.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { monthStart, monthEnd };
}

function buildEmploymentOverlapClause(monthStartParam, monthEndParam) {
  return `e.start_date <= ${monthEndParam}::date AND (e.end_date IS NULL OR e.end_date >= ${monthStartParam}::date)`;
}

const EMPLOYEE_SELECT_FIELDS = `e.id,
              e.name,
              e.department_id AS "departmentId",
              COALESCE(d.name, e.department, 'Без отдел') AS department,
              e.position,
              e.egn,
              e.base_vacation_allowance AS "baseVacationAllowance",
              e.telk,
              e.young_worker_benefit AS "youngWorkerBenefit",
              COALESCE(e.is_sirv, FALSE) AS "isSirv",
              COALESCE(e.sirv_period_months, 1) AS "sirvPeriodMonths",
              COALESCE(e.workday_minutes, 480) AS "workdayMinutes",
              e.start_date::text AS "startDate",
              e.end_date::text AS "endDate",
              (e.base_vacation_allowance + CASE WHEN e.telk THEN 6 ELSE 0 END + CASE WHEN e.young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
              (e.base_vacation_allowance + CASE WHEN e.telk THEN 6 ELSE 0 END + CASE WHEN e.young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`;

function getReleaseDateFromRequest(req) {
  const requestedEndDate = normalizeDateOnly(req.body?.end_date || req.body?.endDate || req.query.end_date);
  if (requestedEndDate) {
    return requestedEndDate;
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateEmployeeInput(data = {}) {
  const normalizeString = (value) =>
    typeof value === 'string' ? value.trim() : String(value ?? '').trim();

  const name = normalizeString(data.name);
  const nameParts = name.split(/\s+/).filter(Boolean);
  if (nameParts.length < 3) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'name',
        message: 'Моля, въведете 3 имена (собствено, бащино и фамилия).',
      },
    };
  }

  const position = normalizeString(data.position);
  if (position.length < 2) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'position',
        message: 'Позицията е задължителна и трябва да съдържа поне 2 символа.',
      },
    };
  }


  const egn = normalizeString(data.egn);
  if (!/^\d{10}$/.test(egn)) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'egn',
        message: 'ЕГН е задължително и трябва да съдържа точно 10 цифри.',
      },
    };
  }

  const rawVacationAllowance = data.baseVacationAllowance ?? data.vacationAllowance;
  if (
    rawVacationAllowance === undefined ||
    rawVacationAllowance === null ||
    String(rawVacationAllowance).trim() === ''
  ) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.',
      },
    };
  }

  const telk = Boolean(data.telk);
  const youngWorkerBenefit = Boolean(data.youngWorkerBenefit ?? data.young_worker_benefit);
  const baseVacationAllowance = Number(rawVacationAllowance);
  const vacationAllowance = baseVacationAllowance + (telk ? 6 : 0) + (youngWorkerBenefit ? 6 : 0);
  if (!Number.isFinite(baseVacationAllowance) || baseVacationAllowance < 0) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'vacationAllowance',
        message: 'Полагаемият отпуск е задължителен и трябва да е число >= 0.',
      },
    };
  }

  const startDate = normalizeDateOnly(data.startDate || data.start_date);
  const endDate = normalizeDateOnly(data.endDate || data.end_date);
  const isSirv = Boolean(data.is_sirv ?? data.isSirv);
  const rawWorkdayMinutes = Number(data.daily_norm_minutes ?? data.dailyNormMinutes ?? data.workday_minutes ?? data.workdayMinutes ?? 480);
  const workdayMinutes = Number.isFinite(rawWorkdayMinutes) && rawWorkdayMinutes > 0 ? Math.trunc(rawWorkdayMinutes) : 480;
  const allowedPeriods = new Set([1, 2, 3, 4]);
  const parsedSirvPeriod = Number(data.sirv_period_months ?? data.sirvPeriodMonths ?? 1);
  const sirvPeriodMonths = allowedPeriods.has(parsedSirvPeriod) ? parsedSirvPeriod : 1;
  if (!isValidEmploymentRange(startDate, endDate)) {
    return {
      valid: false,
      error: {
        error: 'VALIDATION_ERROR',
        field: 'employmentDates',
        message: 'Началната дата е задължителна, а последният работен ден не може да е преди нея.',
      },
    };
  }

  return {
    valid: true,
    value: {
      name,
      department: normalizeDepartmentName(data.department),
      departmentId: cleanStr(data.department_id || data.departmentId) || null,
      position,
      egn,
      startDate,
      endDate,
      vacationAllowance,
      baseVacationAllowance,
      telk,
      youngWorkerBenefit,
      isSirv,
      sirvPeriodMonths,
      workdayMinutes,
    },
  };
}

async function initDatabase() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      eik TEXT NOT NULL DEFAULT '',
      owner_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','disabled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','user')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      department TEXT NULL,
      position TEXT NOT NULL,
      egn CHAR(10) NULL,
      vacation_allowance INTEGER NOT NULL DEFAULT 20,
      base_vacation_allowance INTEGER NOT NULL DEFAULT 20,
      telk BOOLEAN NOT NULL DEFAULT FALSE,
      young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE,
      is_sirv BOOLEAN NOT NULL DEFAULT FALSE,
      sirv_period_months INTEGER NOT NULL DEFAULT 1,
      workday_minutes INTEGER NOT NULL DEFAULT 480,
      start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      end_date DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
      department TEXT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
      sirv_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sirv_period_months INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      day INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
      shift_code VARCHAR(16) NOT NULL,
      month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
      PRIMARY KEY (schedule_id, employee_id, day)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shift_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code VARCHAR(16) NOT NULL,
      name TEXT NOT NULL,
      start_time CHAR(5) NOT NULL,
      end_time CHAR(5) NOT NULL,
      break_minutes INTEGER NOT NULL DEFAULT 0,
      break_included BOOLEAN NOT NULL DEFAULT FALSE,
      is_sirv_shift BOOLEAN NULL,
      hours NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL,
      actor_user_id UUID NULL,
      action TEXT NOT NULL,
      entity TEXT NULL,
      entity_id TEXT NULL,
      before_json JSONB NULL,
      after_json JSONB NULL,
      ip TEXT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NULL,
      user_id UUID NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS egn CHAR(10) NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS base_vacation_allowance INTEGER NOT NULL DEFAULT 20`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS telk BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS young_worker_benefit BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_sirv BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS sirv_period_months INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS workday_minutes INTEGER NOT NULL DEFAULT 480`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE NULL`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS sirv_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS sirv_period_months INTEGER NOT NULL DEFAULT 1`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS id UUID`);
  await pool.query(`UPDATE shift_templates SET id = gen_random_uuid() WHERE id IS NULL`);
  await pool.query(`ALTER TABLE shift_templates ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  await pool.query(`ALTER TABLE shift_templates ALTER COLUMN id SET NOT NULL`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES tenants(id) ON DELETE CASCADE`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_minutes INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS break_included BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_sirv_shift BOOLEAN NULL`);
  await pool.query(`ALTER TABLE schedule_entries ALTER COLUMN shift_code TYPE VARCHAR(16)`);
  await pool.query(`ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS work_minutes_total INTEGER NULL`);
  await pool.query(`ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS break_minutes_applied INTEGER NULL`);
  await pool.query(`ALTER TABLE audit_log ALTER COLUMN old_shift_code TYPE VARCHAR(16)`);
  await pool.query(`ALTER TABLE audit_log ALTER COLUMN new_shift_code TYPE VARCHAR(16)`);

  await pool.query(`
    UPDATE schedules s
    SET department_id = d.id
    FROM departments d
    WHERE s.department_id IS NULL
      AND NULLIF(TRIM(s.department), '') IS NOT NULL
      AND d.name = TRIM(s.department)
      AND s.tenant_id IS NOT DISTINCT FROM d.tenant_id
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'idx_shift_templates_tenant_code_unique'
      ) THEN
        DROP INDEX idx_shift_templates_tenant_code_unique;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'shift_templates'::regclass
          AND conname = 'shift_templates_pkey'
      ) THEN
        ALTER TABLE shift_templates DROP CONSTRAINT shift_templates_pkey;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'shift_templates'::regclass
          AND conname = 'shift_templates_id_pkey'
      ) THEN
        ALTER TABLE shift_templates ADD CONSTRAINT shift_templates_id_pkey PRIMARY KEY (id);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'employees_department_id_fkey'
      ) THEN
        ALTER TABLE employees
          ADD CONSTRAINT employees_department_id_fkey
          FOREIGN KEY (department_id)
          REFERENCES departments(id)
          ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'schedule_entries_employee_id_fkey'
      ) THEN
        ALTER TABLE schedule_entries DROP CONSTRAINT schedule_entries_employee_id_fkey;
      END IF;

      ALTER TABLE schedule_entries
        ADD CONSTRAINT schedule_entries_employee_id_fkey
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_period_check'
      ) THEN
        ALTER TABLE employees
          ADD CONSTRAINT employees_employment_period_check
          CHECK (end_date IS NULL OR end_date >= start_date);
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'departments'::regclass
          AND conname = 'departments_name_key'
      ) THEN
        ALTER TABLE departments DROP CONSTRAINT departments_name_key;
      END IF;

      -- Safety: remove any legacy/global unique constraints over employees.egn.
      -- Tenant isolation requires uniqueness only per (tenant_id, egn).
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'employees'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) LIKE 'UNIQUE (egn)%'
      ) THEN
        EXECUTE (
          SELECT format('ALTER TABLE employees DROP CONSTRAINT %I', conname)
          FROM pg_constraint
          WHERE conrelid = 'employees'::regclass
            AND contype = 'u'
            AND pg_get_constraintdef(oid) LIKE 'UNIQUE (egn)%'
          LIMIT 1
        );
      END IF;
    END $$;
  `);

  await pool.query(`DROP INDEX IF EXISTS idx_schedules_month_department`);
  await pool.query(`DROP INDEX IF EXISTS idx_employees_egn_unique`);
  await pool.query(`
    DO $$
    DECLARE
      idx RECORD;
    BEGIN
      FOR idx IN
        SELECT i.indexname
        FROM pg_indexes i
        WHERE i.schemaname = 'public'
          AND i.tablename = 'employees'
          AND i.indexdef ILIKE 'CREATE UNIQUE INDEX % ON public.employees USING btree (egn%'
      LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
      END LOOP;
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON employees(tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_tenant_egn_unique ON employees(tenant_id, egn) WHERE egn IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_start_date ON employees(start_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_end_date ON employees(end_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_employees_young_worker_benefit ON employees(young_worker_benefit)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_tenant_name_unique ON departments(tenant_id, name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON departments(tenant_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_tenant_month_department_unique ON schedules(tenant_id, month_key, department)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedules_tenant_id ON schedules(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_entries_month_key ON schedule_entries(month_key)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_tenant_department_code_unique ON shift_templates(tenant_id, department_id, code) WHERE department_id IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_templates_tenant_global_code_unique ON shift_templates(tenant_id, code) WHERE department_id IS NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant_id ON shift_templates(tenant_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant_department_id ON shift_templates(tenant_id, department_id)`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_request_log_created_at ON request_log(created_at DESC)');

  await pool.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS eik TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT NOT NULL DEFAULT ''");

  // Backwards-compatible bootstrap for existing single-tenant installations:
  // if legacy employees exist without tenant_id and there is exactly one tenant,
  // assign them to that tenant so old data remains visible.
  try {
    const tenantsCountResult = await pool.query('SELECT COUNT(*)::int AS total FROM tenants');
    const tenantsCount = tenantsCountResult.rows[0]?.total || 0;
    if (tenantsCount === 1) {
      await pool.query(
        `UPDATE employees
         SET tenant_id = (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1)
         WHERE tenant_id IS NULL`
      );
    }
  } catch (bootstrapError) {
    console.error('EMPLOYEE TENANT BACKFILL WARN:', bootstrapError.message);
  }

  // Tenant bootstrap for legacy shift templates that were previously global.
  // If there is exactly one tenant, attach all templates to it.
  // If there are multiple tenants, clone templates for every tenant, then remove global rows.
  try {
    const tenantsResult = await pool.query('SELECT id FROM tenants ORDER BY created_at ASC');
    const tenantIds = tenantsResult.rows.map((row) => row.id);
    if (tenantIds.length === 1) {
      await pool.query(
        `UPDATE shift_templates
         SET tenant_id = $1
         WHERE tenant_id IS NULL`,
        [tenantIds[0]]
      );
    } else if (tenantIds.length > 1) {
      await pool.query(
        `INSERT INTO shift_templates (id, tenant_id, code, name, start_time, end_time, hours, created_at)
         SELECT gen_random_uuid(), tenant.id, st.code, st.name, st.start_time, st.end_time, st.hours, st.created_at
         FROM shift_templates st
         CROSS JOIN (SELECT id FROM tenants) AS tenant
         WHERE st.tenant_id IS NULL
         ON CONFLICT (tenant_id, code) WHERE department_id IS NULL DO NOTHING`
      );

      await pool.query('DELETE FROM shift_templates WHERE tenant_id IS NULL');
    }
  } catch (shiftTemplateBootstrapError) {
    console.error('SHIFT TEMPLATE TENANT BACKFILL WARN:', shiftTemplateBootstrapError.message);
  }

  await pool.query(`
    UPDATE employees e
    SET department_id = d.id
    FROM departments d
    WHERE e.department_id IS NULL
      AND NULLIF(TRIM(e.department), '') IS NOT NULL
      AND d.name = TRIM(e.department)
      AND e.tenant_id IS NOT DISTINCT FROM d.tenant_id
  `);

  await pool.query(`
    UPDATE employees e
    SET tenant_id = d.tenant_id
    FROM departments d
    WHERE e.department_id = d.id
      AND e.tenant_id IS NULL
      AND d.tenant_id IS NOT NULL
  `);

  await pool.query(`
    UPDATE employees
    SET base_vacation_allowance = GREATEST(vacation_allowance - (CASE WHEN telk THEN 6 ELSE 0 END) - (CASE WHEN young_worker_benefit THEN 6 ELSE 0 END), 0)
    WHERE (telk = TRUE OR young_worker_benefit = TRUE)
      AND base_vacation_allowance = 20
      AND vacation_allowance >= 26
  `);
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/state', requireAuth, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const hasTenantId = await hasShiftTemplatesTenantId();
    await ensureDefaultShiftTemplatesForTenant(tenantId);
    const [employees, schedules, scheduleEntries, shiftTemplates, departments] = await Promise.all([
      pool.query(
        `SELECT ${EMPLOYEE_SELECT_FIELDS}
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE e.tenant_id = $1
         ORDER BY e.name ASC`,
        [tenantId]
      ),
      pool.query(
        `SELECT id, name, month_key AS month, department, department_id AS "departmentId", status,
         created_at AS "createdAt"
         FROM schedules
         WHERE tenant_id = $1
         ORDER BY created_at, id`,
        [tenantId]
      ),
      pool.query(
        `SELECT se.schedule_id, se.employee_id, se.day, se.shift_code
         FROM schedule_entries se
         JOIN schedules s ON s.id = se.schedule_id
         WHERE s.tenant_id = $1`,
        [tenantId]
      ),
      hasTenantId
        ? pool.query(
          `SELECT id, code, name,
           start_time AS start,
           end_time AS "end",
           hours,
           department_id AS "departmentId"
           FROM shift_templates
           WHERE tenant_id = $1
           ORDER BY created_at, code`,
          [tenantId]
        )
        : pool.query(
          `SELECT id, code, name,
           start_time AS start,
           end_time AS "end",
           hours,
           department_id AS "departmentId"
           FROM shift_templates
           ORDER BY created_at, code`
        ),
      pool.query(
        `SELECT id, name, created_at AS "createdAt"
         FROM departments
         WHERE tenant_id = $1
         ORDER BY name ASC`,
        [tenantId]
      ),
    ]);

    const schedule = {};
    for (const row of scheduleEntries.rows) {
      schedule[`${row.schedule_id}|${row.employee_id}|${row.day}`] = row.shift_code;
    }

    res.json({
      employees: employees.rows,
      schedules: schedules.rows,
      schedule,
      shiftTemplates: appendSystemShiftTemplates(shiftTemplates.rows),
      departments: departments.rows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/departments', requireAuth, requireTenantContext, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, created_at AS "createdAt"
       FROM departments
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [req.tenantId]
    );

    res.json({ departments: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/departments', requireAuth, requireTenantContext, async (req, res) => {
  const name = normalizeDepartmentName(req.body?.name);
  if (!name) {
    return res.status(400).json({ message: 'Името на отдела е задължително.' });
  }

  try {
    const created = await pool.query(
      `INSERT INTO departments (tenant_id, name)
       VALUES ($1, $2)
       RETURNING id, name, created_at AS "createdAt"`,
      [req.tenantId, name]
    );
    res.status(201).json({ ok: true, department: created.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/departments/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  const name = normalizeDepartmentName(req.body?.name);

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден department id.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Името на отдела е задължително.' });
  }

  try {
    const updated = await pool.query(
      `UPDATE departments
       SET name = $3
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, name, created_at AS "createdAt"`,
      [id, req.tenantId, name]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    await pool.query('UPDATE employees SET department = $3 WHERE department_id = $1 AND tenant_id = $2', [id, req.tenantId, name]);

    res.json({ ok: true, department: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Отдел с това име вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/departments/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден department id.' });
  }

  try {
    const employeesCount = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM employees
       WHERE department_id = $1 AND tenant_id = $2`,
      [id, req.tenantId]
    );

    if ((employeesCount.rows[0]?.total || 0) > 0) {
      return res.status(409).json({
        message: 'Отделът не може да бъде изтрит, защото има прикачени служители.',
      });
    }

    const deleted = await pool.query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!deleted.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/employees', requireAuth, requireTenantContext, async (req, res) => {
  const departmentId = cleanStr(req.query.department_id);
  const monthKey = cleanStr(req.query.month_key || req.query.month);

  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }
  if (monthKey && !isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Невалиден month_key. Използвайте YYYY-MM.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const params = [];
    const where = [];

    params.push(actor.tenantId);
    where.push(`e.tenant_id = $${params.length}`);

    if (departmentId) {
      params.push(departmentId);
      where.push(`e.department_id = $${params.length}`);
    }

    if (monthKey) {
      const bounds = getMonthBounds(monthKey);
      params.push(bounds.monthStart);
      const monthStartParam = `$${params.length}`;
      params.push(bounds.monthEnd);
      const monthEndParam = `$${params.length}`;
      where.push(buildEmploymentOverlapClause(monthStartParam, monthEndParam));
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT ${EMPLOYEE_SELECT_FIELDS}
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       ${whereSql}
       ORDER BY e.name ASC`,
      params
    );

    res.json({ employees: result.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/employees', requireAuth, requireTenantContext, async (req, res) => {
  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, department, departmentId, position, egn, startDate, endDate, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, isSirv, sirvPeriodMonths, workdayMinutes } = validation.value;

  try {
    const actor = await resolveActorTenant(req);
    let resolvedDepartmentId = null;
    let departmentName = department;

    if (departmentId) {
      if (!isValidUuid(departmentId)) {
        return res.status(400).json({ message: 'Невалиден department_id.' });
      }
      const depById = await pool.query('SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, actor.tenantId]);
      if (!depById.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      resolvedDepartmentId = depById.rows[0].id;
      departmentName = depById.rows[0].name;
    } else if (department) {
      const depByName = await pool.query('SELECT id, name FROM departments WHERE tenant_id = $1 AND name = $2', [actor.tenantId, department]);
      if (depByName.rowCount) {
        resolvedDepartmentId = depByName.rows[0].id;
        departmentName = depByName.rows[0].name;
      }
    }

    const result = await pool.query(
      `INSERT INTO employees (name, department, department_id, position, egn, vacation_allowance, base_vacation_allowance, telk, young_worker_benefit, is_sirv, sirv_period_months, workday_minutes, start_date, end_date, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, name, department_id AS "departmentId", department, position, egn,
                 base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 COALESCE(is_sirv, FALSE) AS "isSirv", COALESCE(sirv_period_months, 1) AS "sirvPeriodMonths", COALESCE(workday_minutes, 480) AS "workdayMinutes",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [name, departmentName, resolvedDepartmentId, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, isSirv, sirvPeriodMonths, workdayMinutes, startDate, endDate, actor.tenantId]
    );

    res.status(201).json({ ok: true, employee: result.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('egn')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    console.error('EMPLOYEE POST ERROR:', error);
    res.status(500).json({ message: error.message });
  }
});


app.put('/api/employees/:id', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  const validation = validateEmployeeInput(req.body);
  if (!validation.valid) {
    return res.status(400).json(validation.error);
  }

  const { name, position, egn, startDate, endDate, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, isSirv, sirvPeriodMonths, workdayMinutes } = validation.value;

  try {
    const actor = await resolveActorTenant(req);
    const updated = await pool.query(
      `UPDATE employees
       SET name = $2,
           position = $3,
           egn = $4,
           vacation_allowance = $5,
           base_vacation_allowance = $6,
           telk = $7,
           young_worker_benefit = $8,
           is_sirv = $9,
           sirv_period_months = $10,
           workday_minutes = $11,
           start_date = $12,
           end_date = $13,
           tenant_id = COALESCE(tenant_id, $14)
       WHERE id = $1 AND tenant_id = $14
       RETURNING id, name, department_id AS "departmentId", COALESCE(department, 'Без отдел') AS department,
                 position, egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 COALESCE(is_sirv, FALSE) AS "isSirv", COALESCE(sirv_period_months, 1) AS "sirvPeriodMonths", COALESCE(workday_minutes, 480) AS "workdayMinutes",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, name, position, egn, vacationAllowance, baseVacationAllowance, telk, youngWorkerBenefit, isSirv, sirvPeriodMonths, workdayMinutes, startDate, endDate, actor.tenantId]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    if (error.code === '23505' && String(error.constraint || '').includes('egn')) {
      return res.status(409).json({ message: 'Служител с това ЕГН вече съществува.' });
    }
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/employees/:id/department', requireAuth, requireTenantContext, async (req, res) => {
  const id = cleanStr(req.params.id);
  const departmentId = req.body?.department_id === null ? null : cleanStr(req.body?.department_id);

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }
  if (departmentId && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден department_id.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    let departmentName = null;
    if (departmentId) {
      const dep = await pool.query('SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2', [departmentId, actor.tenantId]);
      if (!dep.rowCount) {
        return res.status(404).json({ message: 'Отделът не е намерен.' });
      }
      departmentName = dep.rows[0].name;
    }

    const updated = await pool.query(
      `UPDATE employees
       SET department_id = $2,
           department = $3,
           tenant_id = COALESCE(tenant_id, $4)
       WHERE id = $1 AND tenant_id = $4
       RETURNING id, name, department_id AS "departmentId", COALESCE($3, 'Без отдел') AS department, position,
                 egn, base_vacation_allowance AS "baseVacationAllowance", telk, young_worker_benefit AS "youngWorkerBenefit",
                 start_date::text AS "startDate", end_date::text AS "endDate",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "totalVacationDays",
                 (base_vacation_allowance + CASE WHEN telk THEN 6 ELSE 0 END + CASE WHEN young_worker_benefit THEN 6 ELSE 0 END) AS "vacationAllowance"`,
      [id, departmentId, departmentName, actor.tenantId]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function releaseEmployee(req, res) {
  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  const requestedEndDate = getReleaseDateFromRequest(req);

  try {
    const actor = await resolveActorTenant(req);
    const employeeResult = await pool.query(
      'SELECT id, start_date::text AS "startDate" FROM employees WHERE id = $1 AND tenant_id = $2',
      [id, actor.tenantId]
    );

    if (!employeeResult.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const startDate = employeeResult.rows[0].startDate;
    if (!isValidEmploymentRange(startDate, requestedEndDate)) {
      return res.status(400).json({
        message: 'Последният работен ден не може да е преди началната дата на служителя.',
      });
    }

    const updated = await pool.query(
      `UPDATE employees
       SET end_date = $2
       WHERE id = $1 AND tenant_id = $3
       RETURNING id, end_date::text AS "endDate"`,
      [id, requestedEndDate, actor.tenantId]
    );

    return res.json({ ok: true, employee: updated.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

app.patch('/api/employees/:id/release', requireAuth, requireTenantContext, releaseEmployee);

app.delete('/api/employees/:id', requireAuth, requireTenantContext, async (req, res) => {
  if (!ensureAdmin(req, res)) {
    return;
  }

  const id = cleanStr(req.params.id);
  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден employee id.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const deleted = await pool.query('DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, actor.tenantId]);
    if (!deleted.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    return res.json({ ok: true, deletedEmployeeId: deleted.rows[0].id });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ message: 'Служителят има свързани записи в графици и не може да бъде изтрит.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules', requireAuth, requireTenantContext, async (req, res) => {
  const monthKey = cleanStr(req.body?.month_key || req.body?.month || req.body?.monthKey);
  const department = cleanStr(req.body?.department);

  if (!isValidMonthKey(monthKey)) {
    return res.status(400).json({ message: 'Месецът трябва да е във формат YYYY-MM.' });
  }

  if (!department || department === 'Общ') {
    return res.status(400).json({ message: 'График може да се създава само за конкретен отдел.' });
  }

  const defaultName = `График ${department} – ${monthKey}`;
  const name = cleanStr(req.body?.name) || defaultName;

  try {
    const actor = await resolveActorTenant(req);
    const departmentResult = await pool.query('SELECT id FROM departments WHERE tenant_id = $1 AND name = $2 LIMIT 1', [actor.tenantId, department]);
    if (!departmentResult.rowCount) {
      return res.status(400).json({ message: 'Отделът не съществува.' });
    }

    const existing = await pool.query(
      `SELECT id FROM schedules WHERE tenant_id = $1 AND month_key = $2 AND department = $3 LIMIT 1`,
      [actor.tenantId, monthKey, department]
    );

    if (existing.rowCount) {
      return res.status(409).json({ message: `Вече има създаден график за ${department} (${monthKey}).` });
    }

    const created = await pool.query(
      `INSERT INTO schedules (tenant_id, name, month_key, department, department_id, status, sirv_enabled, sirv_period_months)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, month_key, department, department_id, status, sirv_enabled, sirv_period_months, created_at`,
      [actor.tenantId, name, monthKey, department, departmentResult.rows[0].id, 'draft', Boolean(req.body?.sirv_enabled ?? false), [1,2,3,4].includes(Number(req.body?.sirv_period_months)) ? Number(req.body?.sirv_period_months) : 1]
    );

    res.status(201).json({
      ok: true,
      schedule_id: created.rows[0].id,
      schedule: created.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: `Вече има създаден график за ${department} (${monthKey}).` });
    }
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules', requireAuth, requireTenantContext, async (req, res) => {
  const month = cleanStr(req.query.month_key || req.query.month);
  const departmentId = cleanStr(req.query.department_id);

  if (month && !isValidMonthKey(month)) {
    return res.status(400).json({ message: 'month_key трябва да е във формат YYYY-MM.' });
  }

  if (departmentId && departmentId !== 'all' && !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'department_id трябва да е uuid или all.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const params = [actor.tenantId];
    const where = ['tenant_id = $1'];
    if (month) {
      params.push(month);
      where.push(`month_key = $${params.length}`);
    }
    if (departmentId && departmentId !== 'all') {
      params.push(departmentId);
      where.push(`department = (SELECT name FROM departments WHERE id = $${params.length} AND tenant_id = $1)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const schedulesResult = await pool.query(
      `SELECT id, name, month_key, department, department_id, status,
              COALESCE(sirv_enabled, FALSE) AS sirv_enabled,
              COALESCE(sirv_period_months, 1) AS sirv_period_months,
              created_at
       FROM schedules
       ${whereSql}
       ORDER BY created_at DESC`,
      params
    );

    res.json({ schedules: schedulesResult.rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/schedules/:id', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }

  try {
    await ensureDefaultShiftTemplatesForTenant(req.tenantId);

    const scheduleResult = await pool.query(
      `SELECT id, name, month_key, department, department_id, status, created_at,
              COALESCE(sirv_enabled, FALSE) AS sirv_enabled,
              COALESCE(sirv_period_months, 1) AS sirv_period_months
       FROM schedules WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );

    if (scheduleResult.rowCount === 0) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];

    const bounds = getMonthBounds(schedule.month_key);
    const employeesResult = await pool.query(
      `SELECT ${EMPLOYEE_SELECT_FIELDS}
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.tenant_id = $1
         AND ($2::text IS NULL OR COALESCE(d.name, e.department) = $2)
         AND e.start_date <= $4::date
         AND (e.end_date IS NULL OR e.end_date >= $3::date)
       ORDER BY e.name`,
      [req.tenantId, schedule.department, bounds.monthStart, bounds.monthEnd]
    );

    const hasWorkMinutes = await tableHasColumn('schedule_entries', 'work_minutes');
    const hasWorkMinutesTotal = await tableHasColumn('schedule_entries', 'work_minutes_total');
    const hasBreakMinutesApplied = await tableHasColumn('schedule_entries', 'break_minutes_applied');
    const entriesSelectExtras = hasWorkMinutes
      ? `, se.work_minutes AS "workMinutes",
         COALESCE(se.work_minutes_total, se.work_minutes) AS "workMinutesTotal",
         se.night_minutes AS "nightMinutes",
         se.holiday_minutes AS "holidayMinutes",
         se.weekend_minutes AS "weekendMinutes",
         se.overtime_minutes AS "overtimeMinutes"${hasBreakMinutesApplied ? ', se.break_minutes_applied AS "breakMinutesApplied"' : ', NULL::integer AS "breakMinutesApplied"'}`
      : '';
    const entriesResult = await pool.query(
      `SELECT se.employee_id AS "employeeId", se.day, se.shift_code AS "shiftCode"${entriesSelectExtras}
       FROM schedule_entries se
       JOIN schedules s ON s.id = se.schedule_id
       WHERE se.schedule_id = $1 AND s.tenant_id = $2
       ORDER BY se.day, se.employee_id`,
      [scheduleId, req.tenantId]
    );

    const hasShiftTemplatesTenant = await hasShiftTemplatesTenantId();
    const hasShiftTemplatesDepartment = await hasShiftTemplatesDepartmentId();
    const scopedShiftTemplates = buildShiftTemplateScopeCondition({
      hasDepartmentId: hasShiftTemplatesDepartment,
      departmentId: schedule.department_id || null,
      tenantScoped: hasShiftTemplatesTenant ? req.tenantId : null,
    });
    const shiftTemplatesResult = await pool.query(
      `SELECT id, code, name,
              start_time AS start,
              end_time AS "end",
              hours
       FROM shift_templates
       ${scopedShiftTemplates.whereSql}
       ORDER BY created_at, code`,
      scopedShiftTemplates.values
    );

    res.json({
      schedule,
      employees: employeesResult.rows,
      entries: entriesResult.rows.map((entry) => ({
        ...entry,
        validation: { errors: [], warnings: [] },
      })),
      shiftTemplates: appendSystemShiftTemplates(shiftTemplatesResult.rows),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules/:id/entry', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  const employeeId = cleanStr(req.body?.employee_id || req.body?.employeeId);
  const day = Number(req.body?.day);
  const monthKey = cleanStr(req.body?.month_key || req.body?.monthKey);
  const requestedShiftId = cleanStr(req.body?.shift_id || req.body?.shiftId);
  const requestedShiftCode = normalizeShiftCode(req.body?.shift_code || req.body?.shiftCode);

  if (!isValidUuid(scheduleId) || !isValidUuid(employeeId)) {
    return res.status(400).json({ message: 'Невалиден scheduleId или employeeId.' });
  }

  if (!Number.isInteger(day) || day < 1 || day > 31 || (monthKey && !isValidMonthKey(monthKey))) {
    return res.status(400).json({ message: 'Невалидни данни за запис в график.' });
  }

  try {
    const hasTenantId = await hasShiftTemplatesTenantId();
    await ensureDefaultShiftTemplatesForTenant(req.tenantId);

    const scheduleResult = await pool.query(
      `SELECT id, department, department_id, status, month_key,
              COALESCE(sirv_enabled, FALSE) AS sirv_enabled,
              COALESCE(sirv_period_months, 1) AS sirv_period_months
       FROM schedules WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );

    if (scheduleResult.rowCount === 0) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];
    if (schedule.status === 'locked') {
      return res.status(403).json({ message: 'Графикът е заключен.' });
    }

    const existingEntryResult = await pool.query(
      `SELECT shift_code, shift_id FROM schedule_entries WHERE schedule_id = $1 AND employee_id = $2 AND day = $3 LIMIT 1`,
      [scheduleId, employeeId, day]
    );
    const existingEntry = existingEntryResult.rows[0] || null;

    const employeeResult = await pool.query(
      `SELECT e.id, COALESCE(d.name, e.department) AS department,
              e.start_date::text AS "startDate", e.end_date::text AS "endDate",
              COALESCE(e.is_sirv, FALSE) AS "isSirv"
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.id = $1 AND e.tenant_id = $2`,
      [employeeId, req.tenantId]
    );

    if (employeeResult.rowCount === 0) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const employee = employeeResult.rows[0];
    if (schedule.department && employee.department !== schedule.department) {
      return res.status(400).json({
        message: `Служителят не е от отдел ${schedule.department}.`,
      });
    }

    const effectiveMonth = monthKey || cleanStr(schedule.month_key);
    if (!effectiveMonth || !isValidMonthKey(effectiveMonth)) {
      return res.status(400).json({ message: 'Липсва валиден monthKey (YYYY-MM) за записа.' });
    }

    const entryDate = normalizeDateOnly(`${effectiveMonth}-${String(day).padStart(2, '0')}`);
    if (!entryDate || !isValidEmploymentRange(employee.startDate, employee.endDate || entryDate)) {
      return res.status(400).json({ message: 'Невалиден период на заетост за служителя.' });
    }
    if (entryDate < employee.startDate || (employee.endDate && entryDate > employee.endDate)) {
      return res.status(409).json({ message: 'Денят е извън периода на заетост на служителя.' });
    }

    let resolvedShiftCode = requestedShiftCode;
    let resolvedShiftId = requestedShiftId || null;

    const hasShiftTemplatesDepartment = await hasShiftTemplatesDepartmentId();
    const shiftScopeForLookup = buildShiftTemplateScopeCondition({
      hasDepartmentId: hasShiftTemplatesDepartment,
      departmentId: schedule.department_id || null,
      tenantScoped: hasTenantId ? req.tenantId : null,
      startIndex: 2,
    });
    const shiftScope = buildShiftTemplateScopeCondition({
      hasDepartmentId: hasShiftTemplatesDepartment,
      departmentId: schedule.department_id || null,
      tenantScoped: hasTenantId ? req.tenantId : null,
    });

    if (requestedShiftId) {
      if (!isValidUuid(requestedShiftId)) {
        return res.status(400).json({ message: 'Невалиден shiftId.' });
      }
      const shiftByIdQuery = {
        text: `SELECT id, code FROM shift_templates WHERE id = $1${shiftScopeForLookup.whereSql ? ` AND ${shiftScopeForLookup.whereSql.replace(/^WHERE\s+/i, '')}` : ''} LIMIT 1`,
        values: [requestedShiftId, ...shiftScopeForLookup.values],
      };
      const shiftByIdResult = await pool.query(shiftByIdQuery.text, shiftByIdQuery.values);
      if (shiftByIdResult.rowCount === 0) {
        return res.status(404).json({ message: 'Смяната не е намерена.' });
      }
      resolvedShiftCode = normalizeShiftCode(shiftByIdResult.rows[0].code);
      resolvedShiftId = shiftByIdResult.rows[0].id;
    } else if (requestedShiftCode && !['P', 'O', 'B', 'R'].includes(requestedShiftCode)) {
      const codeScope = buildShiftTemplateScopeCondition({
        hasDepartmentId: hasShiftTemplatesDepartment,
        departmentId: schedule.department_id || null,
        tenantScoped: hasTenantId ? req.tenantId : null,
      });
      const shiftByCodeQuery = {
        text: `SELECT id, code FROM shift_templates ${codeScope.whereSql}${codeScope.whereSql ? ' AND' : ' WHERE'} UPPER(code) = $${codeScope.values.length + 1} LIMIT 1`,
        values: [...codeScope.values, requestedShiftCode],
      };
      const shiftByCodeResult = await pool.query(shiftByCodeQuery.text, shiftByCodeQuery.values);
      if (shiftByCodeResult.rowCount > 0) {
        resolvedShiftCode = normalizeShiftCode(shiftByCodeResult.rows[0].code);
        resolvedShiftId = shiftByCodeResult.rows[0].id;
      }
    }

    if (!resolvedShiftCode) {
      return res.status(400).json({ message: 'Липсва shift_code/shift_id.' });
    }

    const hasScheduleEntriesMonthKey = await tableHasColumn('schedule_entries', 'month_key');
    const hasWorkMinutes = await tableHasColumn('schedule_entries', 'work_minutes');
    const hasNightMinutes = await tableHasColumn('schedule_entries', 'night_minutes');
    const hasHolidayMinutes = await tableHasColumn('schedule_entries', 'holiday_minutes');
    const hasWeekendMinutes = await tableHasColumn('schedule_entries', 'weekend_minutes');
    const hasOvertimeMinutes = await tableHasColumn('schedule_entries', 'overtime_minutes');
    const hasWorkMinutesTotal = await tableHasColumn('schedule_entries', 'work_minutes_total');
    const hasBreakMinutesApplied = await tableHasColumn('schedule_entries', 'break_minutes_applied');
    const hasShiftIdColumn = await tableHasColumn('schedule_entries', 'shift_id');
    const hasIsManualColumn = await tableHasColumn('schedule_entries', 'is_manual');
    const hasNotesColumn = await tableHasColumn('schedule_entries', 'notes');
    const hasUpdatedAtColumn = await tableHasColumn('schedule_entries', 'updated_at');
    const hasShiftTemplatesBreakMinutes = await tableHasColumn('shift_templates', 'break_minutes');
    const hasShiftTemplatesBreakIncluded = await tableHasColumn('shift_templates', 'break_included');
    const hasShiftTemplatesSirvShift = await tableHasColumn('shift_templates', 'is_sirv_shift');
    const shiftTemplatesSelect = `SELECT id, code, name, start_time, end_time, hours${hasShiftTemplatesBreakMinutes ? ', COALESCE(break_minutes, 0) AS break_minutes' : ', 0::integer AS break_minutes'}${hasShiftTemplatesBreakIncluded ? ', COALESCE(break_included, FALSE) AS break_included' : ', FALSE::boolean AS break_included'}${hasShiftTemplatesSirvShift ? ', is_sirv_shift' : ', NULL::boolean AS is_sirv_shift'} FROM shift_templates`;

    const holidayResolver = await buildHolidayResolver();
    let snapshot = computeSystemShiftSnapshot(resolvedShiftCode, entryDate);

    const shiftTemplatesForCalcResult = snapshot
      ? { rows: [] }
      : await pool.query(`${shiftTemplatesSelect} ${shiftScope.whereSql}`, shiftScope.values);

    const selectedShiftForSnapshot = snapshot
      ? null
      : (appendSystemShiftTemplates(shiftTemplatesForCalcResult.rows).find((row) => {
        if (resolvedShiftId) {
          return String(row.id) === String(resolvedShiftId);
        }
        return normalizeShiftCode(row.code) === resolvedShiftCode;
      }) || { code: resolvedShiftCode, start_time: '00:00', end_time: '00:00', hours: 0, break_minutes: 0, break_included: false });

    if (!snapshot) {
      snapshot = await computeEntrySnapshot({
        date: entryDate,
        shift: selectedShiftForSnapshot,
        isHoliday: holidayResolver,
        sirvEnabled: Boolean(schedule.sirv_enabled),
        dailyNormMinutes: Number(employee.workdayMinutes || 480),
      });
    }

    const previousDay = dateAdd(entryDate, -1);
    const previousDayInt = Number(String(previousDay).slice(-2));
    const prevEntryResult = await pool.query(
      `SELECT se.shift_code, se.shift_id
       FROM schedule_entries se
       WHERE se.schedule_id = $1 AND se.employee_id = $2 AND se.day = $3
       LIMIT 1`,
      [scheduleId, employeeId, previousDayInt]
    );
    let validation = { errors: [], warnings: [] };
    if (selectedShiftForSnapshot) {
      let prevShiftEndAt = null;
      if (prevEntryResult.rowCount) {
        const prevCode = normalizeShiftCode(prevEntryResult.rows[0].shift_code);
        const prevShift = appendSystemShiftTemplates(shiftTemplatesForCalcResult.rows).find((row) => normalizeShiftCode(row.code) === prevCode);
        if (prevShift) {
          const prevEnd = String(prevShift.end_time || prevShift.end || '00:00');
          const [h, m] = prevEnd.split(':').map(Number);
          prevShiftEndAt = h * 60 + m;
        }
      }
      validation = validateScheduleEntry({ prevShiftEndAt, shift: selectedShiftForSnapshot });
    }

    const isManual = Boolean(req.body?.is_manual ?? req.body?.isManual ?? false);
    const notes = cleanStr(req.body?.notes || '') || null;

    if (hasScheduleEntriesMonthKey) {
      const columns = ['schedule_id', 'employee_id', 'day', 'shift_code', 'month_key'];
      const values = [scheduleId, employeeId, day, resolvedShiftCode, effectiveMonth];

      if (hasShiftIdColumn) {
        columns.push('shift_id');
        values.push(resolvedShiftId);
      }
      if (hasWorkMinutes) {
        columns.push('work_minutes');
        values.push(snapshot.work_minutes);
      }
      if (hasWorkMinutesTotal) {
        columns.push('work_minutes_total');
        values.push(snapshot.work_minutes_total ?? snapshot.work_minutes);
      }
      if (hasNightMinutes) {
        columns.push('night_minutes');
        values.push(snapshot.night_minutes);
      }
      if (hasHolidayMinutes) {
        columns.push('holiday_minutes');
        values.push(snapshot.holiday_minutes);
      }
      if (hasWeekendMinutes) {
        columns.push('weekend_minutes');
        values.push(snapshot.weekend_minutes);
      }
      if (hasOvertimeMinutes) {
        columns.push('overtime_minutes');
        values.push(snapshot.overtime_minutes);
      }
      if (hasBreakMinutesApplied) {
        columns.push('break_minutes_applied');
        values.push(snapshot.break_minutes_applied ?? 0);
      }
      if (hasIsManualColumn) {
        columns.push('is_manual');
        values.push(isManual);
      }
      if (hasNotesColumn) {
        columns.push('notes');
        values.push(notes);
      }
      if (hasUpdatedAtColumn) {
        columns.push('updated_at');
      }

      const placeholders = columns.map((_, index) => (columns[index] === 'updated_at' ? 'NOW()' : `$${values.length >= index + 1 ? index + 1 : values.length}`));
      const updateAssignments = ['shift_code = EXCLUDED.shift_code', 'month_key = EXCLUDED.month_key'];

      if (hasShiftIdColumn) {
        updateAssignments.push('shift_id = EXCLUDED.shift_id');
      }
      if (hasWorkMinutes) {
        updateAssignments.push('work_minutes = EXCLUDED.work_minutes');
      }
      if (hasWorkMinutesTotal) {
        updateAssignments.push('work_minutes_total = EXCLUDED.work_minutes_total');
      }
      if (hasNightMinutes) {
        updateAssignments.push('night_minutes = EXCLUDED.night_minutes');
      }
      if (hasHolidayMinutes) {
        updateAssignments.push('holiday_minutes = EXCLUDED.holiday_minutes');
      }
      if (hasWeekendMinutes) {
        updateAssignments.push('weekend_minutes = EXCLUDED.weekend_minutes');
      }
      if (hasOvertimeMinutes) {
        updateAssignments.push('overtime_minutes = EXCLUDED.overtime_minutes');
      }
      if (hasBreakMinutesApplied) {
        updateAssignments.push('break_minutes_applied = EXCLUDED.break_minutes_applied');
      }
      if (hasIsManualColumn) {
        updateAssignments.push('is_manual = EXCLUDED.is_manual');
      }
      if (hasNotesColumn) {
        updateAssignments.push('notes = EXCLUDED.notes');
      }
      if (hasUpdatedAtColumn) {
        updateAssignments.push('updated_at = NOW()');
      }

      await pool.query(
        `INSERT INTO schedule_entries (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT (schedule_id, employee_id, day)
         DO UPDATE SET ${updateAssignments.join(', ')}`,
        values
      );
    } else {
      await pool.query(
        `INSERT INTO schedule_entries (schedule_id, employee_id, day, shift_code)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (schedule_id, employee_id, day)
         DO UPDATE SET shift_code = EXCLUDED.shift_code`,
        [scheduleId, employeeId, day, resolvedShiftCode]
      );
    }

    const [shiftTemplatesResult, entriesResult, employeesResult] = await Promise.all([
      pool.query(`${shiftTemplatesSelect} ${shiftScope.whereSql}`, shiftScope.values),
      pool.query(
        `SELECT schedule_id, employee_id, day, shift_code${hasWorkMinutes ? ', work_minutes, night_minutes, holiday_minutes, weekend_minutes, overtime_minutes' : ''}
         FROM schedule_entries
         WHERE schedule_id = $1`,
        [scheduleId]
      ),
      pool.query(
        `SELECT e.id,
                e.start_date::text AS start_date,
                e.end_date::text AS end_date,
                COALESCE(e.is_sirv, FALSE) AS is_sirv,
                COALESCE(e.sirv_period_months, 1) AS sirv_period_months,
                COALESCE(e.workday_minutes, 480) AS workday_minutes
         FROM employees e
         WHERE e.tenant_id = $1 AND (
           e.id = $2 OR COALESCE(e.department, '') = COALESCE($3, '')
         )`,
        [req.tenantId, employeeId, schedule.department]
      )
    ]);

    const summaryMap = computeMonthlySummary({
      monthKey: effectiveMonth,
      employees: employeesResult.rows,
      schedules: [{ id: scheduleId }],
      scheduleEntries: entriesResult.rows,
      shiftTemplates: appendSystemShiftTemplates(shiftTemplatesResult.rows).map((row) => ({
        code: row.code,
        start: row.start_time,
        end: row.end_time,
        hours: row.hours,
      })),
      selectedScheduleIds: [scheduleId],
      weekendRate: DEFAULT_WEEKEND_RATE,
      holidayRate: DEFAULT_HOLIDAY_RATE,
    });

    const rowSummary = summaryMap.get(employeeId) || emptyComputedSummary();
    const validationStatus = summarizeViolationStatus(rowSummary.violations);
    let scheduleSummary = emptyComputedSummary();
    for (const value of summaryMap.values()) {
      scheduleSummary = addSummaries(scheduleSummary, value);
    }

    const updatedEntry = {
      scheduleId,
      employeeId,
      day,
      shiftCode: resolvedShiftCode,
      shiftId: resolvedShiftId,
      date: entryDate,
      workMinutes: snapshot.work_minutes,
      nightMinutes: snapshot.night_minutes,
      holidayMinutes: snapshot.holiday_minutes,
      weekendMinutes: snapshot.weekend_minutes,
      overtimeMinutes: snapshot.overtime_minutes,
      workMinutesTotal: snapshot.work_minutes_total ?? snapshot.work_minutes,
      breakMinutesApplied: snapshot.break_minutes_applied ?? 0,
      isManual,
      notes,
      validation,
    };

    await insertAuditLog('set_shift', 'schedule_entry', {
      tenantId: req.tenantId,
      actorUserId: req.user?.id,
      scheduleId,
      employeeId,
      entryDate,
      oldShiftCode: existingEntry?.shift_code || null,
      newShiftCode: resolvedShiftCode,
      oldShiftId: existingEntry?.shift_id || null,
      newShiftId: resolvedShiftId,
      before: existingEntry,
      after: updatedEntry,
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    const selectedShift = appendSystemShiftTemplates(shiftTemplatesResult.rows).find((row) => {
      if (resolvedShiftId) {
        return String(row.id) === String(resolvedShiftId);
      }
      return normalizeShiftCode(row.code) === resolvedShiftCode;
    }) || null;
    const shiftHours = selectedShift
      ? calcShiftDurationHours(selectedShift.start_time || selectedShift.start, selectedShift.end_time || selectedShift.end, selectedShift.hours)
      : 0;
    const nightHours = selectedShift
      ? calcNightHours(selectedShift.start_time || selectedShift.start, selectedShift.end_time || selectedShift.end)
      : 0;

    return res.json({
      ok: true,
      entry: {
        ...updatedEntry,
        workedHours: shiftHours,
        nightHours,
      },
      rowSummary,
      scheduleSummary,
      validation: {
        status: validation.errors.length ? 'error' : (validation.warnings.length ? 'warning' : validationStatus),
        message: validation.errors.length
          ? 'Има критични нарушения в смяната.'
          : (validation.warnings.length ? 'Има предупреждения по трудови правила.' : (validationStatus === 'error' ? 'Нарушени са ограниченията за СИРВ/почивки. Коригирайте смяната.' : (validationStatus === 'warning' ? 'Има предупреждения в трудовите ограничения.' : 'OK'))),
        errors: validation.errors,
        warnings: validation.warnings,
        violations: rowSummary.violations || [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


app.post('/api/schedules/:id/generate', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = cleanStr(req.params.id);
  const departmentId = cleanStr(req.body?.department_id || req.body?.departmentId);
  const employeeIdsRaw = Array.isArray(req.body?.employee_ids)
    ? req.body.employee_ids
    : (Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : []);
  const templateType = cleanStr(req.body?.template_type || req.body?.templateType);
  const options = req.body?.options && typeof req.body.options === 'object' ? req.body.options : {};

  const allowedTemplates = new Set(['SIRV_12H_2_2', 'SIRV_12H_2_4', '3_SHIFT_8H', '8H_STANDARD_WEEKDAYS']);
  const overwriteMode = ['empty_only', 'overwrite_auto_only', 'overwrite_all'].includes(cleanStr(options.overwrite_mode || options.overwriteMode))
    ? cleanStr(options.overwrite_mode || options.overwriteMode)
    : 'empty_only';
  const restMinHours = Math.max(0, Number(options.rest_min_hours ?? options.restMinHours ?? 12) || 12);
  const rotateEmployees = Boolean(options.rotate_employees ?? options.rotateEmployees ?? false);
  const includeWeekends = Boolean(options.include_weekends ?? options.includeWeekends ?? false);
  const startPatternDayRaw = Number(options.start_pattern_day ?? options.startPatternDay ?? 1);
  const startPatternDay = Number.isInteger(startPatternDayRaw) && startPatternDayRaw >= 1 && startPatternDayRaw <= 31 ? startPatternDayRaw : 1;

  if (!isValidUuid(scheduleId) || !isValidUuid(departmentId)) {
    return res.status(400).json({ message: 'Невалиден schedule_id или department_id.' });
  }
  if (!allowedTemplates.has(templateType)) {
    return res.status(400).json({ message: 'Невалиден template_type.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, tenant_id, department_id, month_key, status
       FROM schedules
       WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );

    if (!scheduleResult.rowCount) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }

    const schedule = scheduleResult.rows[0];
    if (!isValidMonthKey(schedule.month_key)) {
      return res.status(400).json({ message: 'Графикът няма валиден month_key.' });
    }
    if (schedule.status === 'locked') {
      return res.status(403).json({ message: 'Графикът е заключен.' });
    }
    if (String(schedule.department_id || '') !== departmentId) {
      return res.status(400).json({ message: 'Избраният отдел не съвпада с отдела на графика.' });
    }

    const departmentResult = await pool.query(
      `SELECT id, name FROM departments WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [departmentId, req.tenantId]
    );
    if (!departmentResult.rowCount) {
      return res.status(404).json({ message: 'Отделът не е намерен.' });
    }

    const hasShiftTemplatesTenant = await hasShiftTemplatesTenantId();
    const hasShiftTemplatesDepartment = await hasShiftTemplatesDepartmentId();
    const shiftScope = buildShiftTemplateScopeCondition({
      hasDepartmentId: hasShiftTemplatesDepartment,
      departmentId,
      tenantScoped: hasShiftTemplatesTenant ? req.tenantId : null,
    });

    const shiftTemplatesResult = await pool.query(
      `SELECT id, code, name, start_time, end_time, hours, break_minutes, break_included
       FROM shift_templates
       ${shiftScope.whereSql}
       ORDER BY created_at, code`,
      shiftScope.values
    );
    const shiftTemplates = appendSystemShiftTemplates(shiftTemplatesResult.rows);
    const byCode = new Map(shiftTemplates.map((row) => [normalizeShiftCode(row.code), row]));

    const shiftIds = {
      day12ShiftId: byCode.get('D')?.id || null,
      night12ShiftId: byCode.get('N')?.id || null,
      morning8ShiftId: byCode.get('M')?.id || byCode.get('R')?.id || null,
      evening8ShiftId: byCode.get('E')?.id || null,
      night8ShiftId: byCode.get('N8')?.id || byCode.get('N')?.id || null,
    };

    const missing = [];
    if (templateType === 'SIRV_12H_2_2' || templateType === 'SIRV_12H_2_4') {
      if (!shiftIds.day12ShiftId) missing.push('day12ShiftId (code D)');
      if (!shiftIds.night12ShiftId) missing.push('night12ShiftId (code N)');
    }
    if (templateType === '3_SHIFT_8H') {
      if (!shiftIds.morning8ShiftId) missing.push('morning8ShiftId (code M или R)');
      if (!shiftIds.evening8ShiftId) missing.push('evening8ShiftId (code E)');
      if (!shiftIds.night8ShiftId) missing.push('night8ShiftId (code N8 или N)');
    }
    if (templateType === '8H_STANDARD_WEEKDAYS' && !shiftIds.morning8ShiftId) {
      missing.push('morning8ShiftId (code M или R)');
    }

    if (missing.length) {
      return res.status(400).json({
        message: `Липсват смени за този отдел: ${missing.join(', ')}`,
        missingShifts: missing,
      });
    }

    const monthDays = getDaysOfMonth(schedule.month_key);
    if (!monthDays.length) {
      return res.status(400).json({ message: 'Невалиден month_key.' });
    }

    const employeeIds = employeeIdsRaw
      .map((id) => cleanStr(id))
      .filter((id) => isValidUuid(id));

    const employeeParams = [req.tenantId, departmentId];
    let employeeSql = `SELECT e.id, e.name
      FROM employees e
      WHERE e.tenant_id = $1 AND e.department_id = $2`;
    if (employeeIds.length) {
      employeeParams.push(employeeIds);
      employeeSql += ` AND e.id = ANY($3::uuid[])`;
    }
    employeeSql += ' ORDER BY e.name';

    const employeesResult = await pool.query(employeeSql, employeeParams);
    const employees = employeesResult.rows;
    if (!employees.length) {
      return res.status(400).json({ message: 'Няма служители за генерация в избрания отдел.' });
    }

    const existingEntriesResult = await pool.query(
      `SELECT schedule_id, employee_id, day, shift_id, shift_code, is_manual
       FROM schedule_entries
       WHERE schedule_id = $1 AND employee_id = ANY($2::uuid[])`,
      [scheduleId, employees.map((e) => e.id)]
    );
    const existingMap = new Map(existingEntriesResult.rows.map((row) => [`${row.employee_id}|${row.day}`, row]));

    const byShiftId = new Map(shiftTemplates.map((row) => [String(row.id || ''), row]));
    const pattern = buildPattern(templateType, shiftIds, { include_weekends: includeWeekends });
    if (!pattern) {
      return res.status(400).json({ message: 'Невалиден шаблон за генерация.' });
    }

    const hasScheduleEntriesMonthKey = await tableHasColumn('schedule_entries', 'month_key');
    const hasWorkMinutes = await tableHasColumn('schedule_entries', 'work_minutes');
    const hasNightMinutes = await tableHasColumn('schedule_entries', 'night_minutes');
    const hasHolidayMinutes = await tableHasColumn('schedule_entries', 'holiday_minutes');
    const hasWeekendMinutes = await tableHasColumn('schedule_entries', 'weekend_minutes');
    const hasOvertimeMinutes = await tableHasColumn('schedule_entries', 'overtime_minutes');
    const hasWorkMinutesTotal = await tableHasColumn('schedule_entries', 'work_minutes_total');
    const hasBreakMinutesApplied = await tableHasColumn('schedule_entries', 'break_minutes_applied');
    const hasShiftIdColumn = await tableHasColumn('schedule_entries', 'shift_id');
    const hasIsManualColumn = await tableHasColumn('schedule_entries', 'is_manual');
    const hasUpdatedAtColumn = await tableHasColumn('schedule_entries', 'updated_at');

    let generatedCount = 0;
    let skippedCount = 0;
    const warnings = [];
    const errors = [];

    for (let employeeIndex = 0; employeeIndex < employees.length; employeeIndex += 1) {
      const employee = employees[employeeIndex];
      let prevAssigned = null;

      for (let dayIdx = 0; dayIdx < monthDays.length; dayIdx += 1) {
        const dateISO = monthDays[dayIdx];
        const dayNumber = Number(dateISO.slice(-2));
        const cycleDayIndex = dayNumber - startPatternDay;
        const employeeOffset = rotateEmployees ? employeeIndex : 0;
        const nextShiftId = pattern({ dayIndex: cycleDayIndex, employeeOffset, dateISO }) || null;

        const existingEntry = existingMap.get(`${employee.id}|${dayNumber}`) || null;
        if (!applyOverwriteMode(existingEntry, overwriteMode)) {
          skippedCount += 1;
          continue;
        }

        const shiftTemplate = nextShiftId ? byShiftId.get(String(nextShiftId)) : null;
        if (nextShiftId && !shiftTemplate) {
          skippedCount += 1;
          errors.push({ employee_id: employee.id, date: dateISO, msg: 'Липсва shift template за избраната смяна.' });
          continue;
        }

        const enforce24 = options.enforce_24h_after_12h === undefined
          ? (templateType.startsWith('SIRV_12H'))
          : Boolean(options.enforce_24h_after_12h);

        if (prevAssigned && shiftTemplate) {
          const restCheck = validateRest(
            { dateISO: prevAssigned.dateISO, shift: prevAssigned.shift },
            { dateISO, shift: shiftTemplate },
            restMinHours,
            enforce24
          );
          if (!restCheck.ok) {
            warnings.push({ employee_id: employee.id, date: dateISO, msg: restCheck.reason });
            skippedCount += 1;
            continue;
          }
        }

        const snapshot = shiftTemplate
          ? await computeEntrySnapshot({ date: dateISO, shift: shiftTemplate, isHoliday: null, sirvEnabled: false, dailyNormMinutes: 480 })
          : {
              work_minutes: 0,
              work_minutes_total: 0,
              night_minutes: 0,
              holiday_minutes: 0,
              weekend_minutes: 0,
              overtime_minutes: 0,
              break_minutes_applied: 0,
            };

        const values = [scheduleId, employee.id, dayNumber, shiftTemplate ? normalizeShiftCode(shiftTemplate.code) : null];
        const columns = ['schedule_id', 'employee_id', 'day', 'shift_code'];

        if (hasScheduleEntriesMonthKey) {
          columns.push('month_key');
          values.push(schedule.month_key);
        }
        if (hasShiftIdColumn) {
          columns.push('shift_id');
          values.push(shiftTemplate ? shiftTemplate.id : null);
        }
        if (hasWorkMinutes) { columns.push('work_minutes'); values.push(snapshot.work_minutes); }
        if (hasWorkMinutesTotal) { columns.push('work_minutes_total'); values.push(snapshot.work_minutes_total); }
        if (hasNightMinutes) { columns.push('night_minutes'); values.push(snapshot.night_minutes); }
        if (hasHolidayMinutes) { columns.push('holiday_minutes'); values.push(snapshot.holiday_minutes); }
        if (hasWeekendMinutes) { columns.push('weekend_minutes'); values.push(snapshot.weekend_minutes); }
        if (hasOvertimeMinutes) { columns.push('overtime_minutes'); values.push(snapshot.overtime_minutes); }
        if (hasBreakMinutesApplied) { columns.push('break_minutes_applied'); values.push(snapshot.break_minutes_applied); }
        if (hasIsManualColumn) { columns.push('is_manual'); values.push(false); }

        const placeholders = columns.map((_, index) => `$${index + 1}`);
        const updates = columns
          .filter((col) => !['schedule_id', 'employee_id', 'day'].includes(col))
          .map((col) => `${col} = EXCLUDED.${col}`);
        if (hasUpdatedAtColumn) {
          updates.push('updated_at = NOW()');
        }

        await pool.query(
          `INSERT INTO schedule_entries (${columns.join(', ')})
           VALUES (${placeholders.join(', ')})
           ON CONFLICT (schedule_id, employee_id, day)
           DO UPDATE SET ${updates.join(', ')}`,
          values
        );

        existingMap.set(`${employee.id}|${dayNumber}`, {
          employee_id: employee.id,
          day: dayNumber,
          shift_id: shiftTemplate ? shiftTemplate.id : null,
          shift_code: shiftTemplate ? normalizeShiftCode(shiftTemplate.code) : null,
          is_manual: false,
        });

        if (shiftTemplate) {
          prevAssigned = { dateISO, shift: shiftTemplate };
        }
        generatedCount += 1;
      }
    }

    return res.json({ generatedCount, skippedCount, warnings, errors });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/shift-template', requireAuth, requireTenantContext, async (req, res) => {
  const code = cleanStr(req.body?.code);
  const name = cleanStr(req.body?.name);
  const start = cleanStr(req.body?.start);
  const end = cleanStr(req.body?.end);
  const hours = Number(req.body?.hours);
  const breakMinutes = Math.max(0, Number(req.body?.break_minutes ?? req.body?.breakMinutes ?? 0));
  const breakIncluded = Boolean(req.body?.break_included ?? req.body?.breakIncluded ?? false);
  const isSirvShift = req.body?.is_sirv_shift === undefined && req.body?.isSirvShift === undefined
    ? null
    : Boolean(req.body?.is_sirv_shift ?? req.body?.isSirvShift);
  const departmentIdRaw = req.body?.department_id ?? req.body?.departmentId;
  const departmentId = departmentIdRaw === null || departmentIdRaw === '' ? null : cleanStr(departmentIdRaw);

  if (!code || !name || !start || !end || !(hours > 0)) {
    return res.status(400).json({ message: 'Невалидни данни за смяна.' });
  }

  try {
    const hasTenantId = await hasShiftTemplatesTenantId();
    const hasDepartmentId = await hasShiftTemplatesDepartmentId();

    if (hasDepartmentId && departmentId && !isValidUuid(departmentId)) {
      return res.status(400).json({ message: 'Невалиден department_id за смяната.' });
    }

    if (hasDepartmentId && departmentId) {
      const departmentExists = await pool.query(
        `SELECT id FROM departments WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [departmentId, req.tenantId]
      );
      if (!departmentExists.rowCount) {
        return res.status(400).json({ message: 'Избраният отдел за смяната не е намерен.' });
      }
    }

    if (hasTenantId) {
      if (hasDepartmentId) {
        if (departmentId) {
          await pool.query(
            `INSERT INTO shift_templates (tenant_id, department_id, code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (tenant_id, department_id, code) WHERE department_id IS NOT NULL
             DO UPDATE SET
               name = EXCLUDED.name,
               start_time = EXCLUDED.start_time,
               end_time = EXCLUDED.end_time,
               break_minutes = EXCLUDED.break_minutes,
               break_included = EXCLUDED.break_included,
               is_sirv_shift = EXCLUDED.is_sirv_shift,
               hours = EXCLUDED.hours`,
            [req.tenantId, departmentId, code, name, start, end, breakMinutes, breakIncluded, isSirvShift, hours]
          );
        } else {
          await pool.query(
            `INSERT INTO shift_templates (tenant_id, department_id, code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
             VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (tenant_id, code) WHERE department_id IS NULL
             DO UPDATE SET
               name = EXCLUDED.name,
               start_time = EXCLUDED.start_time,
               end_time = EXCLUDED.end_time,
               break_minutes = EXCLUDED.break_minutes,
               break_included = EXCLUDED.break_included,
               is_sirv_shift = EXCLUDED.is_sirv_shift,
               hours = EXCLUDED.hours`,
            [req.tenantId, code, name, start, end, breakMinutes, breakIncluded, isSirvShift, hours]
          );
        }
      } else {
        await pool.query(
          `INSERT INTO shift_templates (tenant_id, code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (tenant_id, code)
           DO UPDATE SET
             name = EXCLUDED.name,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             break_minutes = EXCLUDED.break_minutes,
             break_included = EXCLUDED.break_included,
             is_sirv_shift = EXCLUDED.is_sirv_shift,
             hours = EXCLUDED.hours`,
          [req.tenantId, code, name, start, end, breakMinutes, breakIncluded, isSirvShift, hours]
        );
      }
    } else {
      await pool.query(
        `INSERT INTO shift_templates (code, name, start_time, end_time, break_minutes, break_included, is_sirv_shift, hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (code)
         DO UPDATE SET
           name = EXCLUDED.name,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           hours = EXCLUDED.hours`,
        [code, name, start, end, breakMinutes, breakIncluded, isSirvShift, hours]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/shift-template/:code', requireAuth, requireTenantContext, async (req, res) => {
  try {
    const hasTenantId = await hasShiftTemplatesTenantId();
    const hasDepartmentId = await hasShiftTemplatesDepartmentId();
    const departmentIdRaw = req.query?.department_id ?? req.query?.departmentId;
    const departmentId = departmentIdRaw === null || departmentIdRaw === '' ? null : cleanStr(departmentIdRaw);

    if (hasDepartmentId && departmentId && !isValidUuid(departmentId)) {
      return res.status(400).json({ message: 'Невалиден department_id за изтриване на смяна.' });
    }

    if (hasTenantId) {
      if (hasDepartmentId) {
        if (departmentId) {
          await pool.query('DELETE FROM shift_templates WHERE tenant_id = $1 AND code = $2 AND department_id = $3', [req.tenantId, req.params.code, departmentId]);
        } else {
          await pool.query('DELETE FROM shift_templates WHERE tenant_id = $1 AND code = $2 AND department_id IS NULL', [req.tenantId, req.params.code]);
        }
      } else {
        await pool.query('DELETE FROM shift_templates WHERE tenant_id = $1 AND code = $2', [req.tenantId, req.params.code]);
      }
    } else {
      await pool.query('DELETE FROM shift_templates WHERE code = $1', [req.params.code]);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/calc/summary', requireAuth, requireTenantContext, async (req, res, next) => {
  try {
    const hasTenantId = await hasShiftTemplatesTenantId();
    await ensureDefaultShiftTemplatesForTenant(req.tenantId);
    const monthKey = cleanStr(req.body?.monthKey);
    if (!isValidMonthKey(monthKey)) {
      return res.status(400).json({ message: 'Невалиден monthKey. Очаква се YYYY-MM.' });
    }

    const requiredTables = ['employees', 'schedules', 'schedule_entries', 'shift_templates'];
    for (const tableName of requiredTables) {
      if (!(await tableExists(tableName))) {
        return res.status(501).json({ message: `Липсва required table: ${tableName}` });
      }
    }

    const actor = await resolveActorTenant(req);
    const hasEmployeesTenantColumn = await tableHasColumn('employees', 'tenant_id');
    if (!hasEmployeesTenantColumn) {
      return res.status(501).json({ message: 'Липсва employees.tenant_id за tenant-safe филтриране.' });
    }

    const employeeQuery = await pool.query(
      `SELECT id,
              department_id,
              start_date::text AS start_date,
              end_date::text AS end_date,
              COALESCE(is_sirv, FALSE) AS is_sirv,
              COALESCE(sirv_period_months, 1) AS sirv_period_months,
              COALESCE(workday_minutes, 480) AS workday_minutes
       FROM employees
       WHERE tenant_id = $1
       ORDER BY id`,
      [actor.tenantId]
    );

    const employees = employeeQuery.rows;
    const employeeIds = employees.map((employee) => employee.id);

    const shiftTemplatesQuery = hasTenantId
      ? await pool.query(
        `SELECT code,
                name,
                start_time,
                end_time,
                hours
         FROM shift_templates
         WHERE tenant_id = $1
         ORDER BY code`,
        [actor.tenantId]
      )
      : await pool.query(
        `SELECT code,
                name,
                start_time,
                end_time,
                hours
         FROM shift_templates
         ORDER BY code`
      );

    const schedulesQuery = await pool.query(
      `SELECT id, name, month_key, department, status
       FROM schedules
       WHERE tenant_id = $1 AND month_key = $2
       ORDER BY created_at, id`,
      [actor.tenantId, monthKey]
    );

    const bodyScheduleIdsRaw = Array.isArray(req.body?.selectedScheduleIds)
      ? req.body.selectedScheduleIds.map((value) => cleanStr(value)).filter(Boolean)
      : [];

    const validScheduleIds = schedulesQuery.rows.map((schedule) => String(schedule.id));
    const validScheduleIdSet = new Set(validScheduleIds);

    if (bodyScheduleIdsRaw.some((scheduleId) => !isValidUuid(scheduleId))) {
      return res.status(400).json({ message: 'selectedScheduleIds трябва да съдържа валидни UUID.' });
    }

    const selectedFromBody = bodyScheduleIdsRaw.filter((scheduleId) => validScheduleIdSet.has(scheduleId));
    if (bodyScheduleIdsRaw.length && selectedFromBody.length !== bodyScheduleIdsRaw.length) {
      return res.status(400).json({ message: 'Невалидни schedule id за този monthKey.' });
    }

    let selectedScheduleIds = selectedFromBody;
    if (!selectedScheduleIds.length) {
      const locked = schedulesQuery.rows.filter((schedule) => cleanStr(schedule.status).toLowerCase() === 'locked');
      selectedScheduleIds = (locked.length ? locked : schedulesQuery.rows).map((schedule) => String(schedule.id));
    }

    if (!selectedScheduleIds.length || !employeeIds.length) {
      return res.json({
        ok: true,
        monthKey,
        summaryByEmployee: {},
        meta: {
          selectedScheduleIds,
          rates: {
            weekendRate: Number(req.body?.weekendRate) || DEFAULT_WEEKEND_RATE,
            holidayRate: Number(req.body?.holidayRate) || DEFAULT_HOLIDAY_RATE,
          },
        },
      });
    }

    const hasEntrySnapshotColumns = await tableHasColumn('schedule_entries', 'work_minutes');
    const entriesQuery = await pool.query(
      `SELECT schedule_id, employee_id, day, shift_code${hasEntrySnapshotColumns ? ', work_minutes, night_minutes, holiday_minutes, weekend_minutes, overtime_minutes' : ''}
       FROM schedule_entries
       WHERE schedule_id = ANY($1::uuid[])
         AND employee_id = ANY($2::uuid[])
       ORDER BY employee_id, day`,
      [selectedScheduleIds, employeeIds]
    );

    const weekendRate = Number(req.body?.weekendRate) || DEFAULT_WEEKEND_RATE;
    const holidayRate = Number(req.body?.holidayRate) || DEFAULT_HOLIDAY_RATE;

    const summaryMap = computeMonthlySummary({
      monthKey,
      employees,
      schedules: schedulesQuery.rows,
      scheduleEntries: entriesQuery.rows,
      shiftTemplates: appendSystemShiftTemplates(shiftTemplatesQuery.rows),
      selectedScheduleIds,
      weekendRate,
      holidayRate,
    });

    const summaryByEmployee = {};
    for (const [employeeId, summary] of summaryMap.entries()) {
      summaryByEmployee[employeeId] = summary;
    }

    return res.json({
      ok: true,
      monthKey,
      summaryByEmployee,
      meta: {
        selectedScheduleIds,
        rates: { weekendRate, holidayRate },
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = cleanStr(req.body?.email).toLowerCase();
  const password = cleanStr(req.body?.password);

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const userResult = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, is_super_admin, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );

    if (!userResult.rowCount) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    if (user.is_super_admin === true) {
      const tenantsResult = await pool.query(
        `SELECT id AS "tenantId", name AS "tenantName", status
         FROM tenants
         WHERE status = 'approved'
         ORDER BY name ASC, created_at ASC`
      );

      const superAdminTenants = tenantsResult.rows.map((row) => ({
        id: row.tenantId,
        name: cleanStr(row.tenantName),
        role: 'super_admin',
      }));

      if (superAdminTenants.length === 1) {
        const selectedTenant = superAdminTenants[0];
        const token = signAccessToken({ user, tenantId: selectedTenant.id, role: 'admin' });
        return res.json({
          mode: 'ok',
          token,
          user: buildUserPayload(user, selectedTenant.id, 'admin'),
          tenant: { id: selectedTenant.id, name: selectedTenant.name },
        });
      }

      if (superAdminTenants.length > 1) {
        const loginToken = signLoginSelectionToken(user.id);
        return res.json({
          mode: 'choose_tenant',
          loginToken,
          tenants: superAdminTenants,
          user: buildUserPayload(user, null, 'admin'),
        });
      }

      const token = signAccessToken({ user, tenantId: null, role: 'admin' });
      return res.json({
        mode: 'ok',
        token,
        user: buildUserPayload(user, null, 'admin'),
        tenant: null,
      });
    }

    const membershipsResult = await pool.query(
      `SELECT tu.tenant_id AS "tenantId", tu.role, t.name AS "tenantName", t.status
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE tu.user_id = $1
         AND t.status = 'approved'
       ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
                t.name ASC,
                tu.created_at ASC`,
      [user.id]
    );

    const memberships = membershipsResult.rows.map(mapTenantMembership);

    if (!memberships.length) {
      return res.status(403).json({ message: 'Потребителят няма активен достъп до организация.' });
    }

    if (memberships.length === 1) {
      const selectedTenant = memberships[0];
      const token = signAccessToken({ user, tenantId: selectedTenant.id, role: selectedTenant.role });

      return res.json({
        mode: 'ok',
        token,
        user: buildUserPayload(user, selectedTenant.id, selectedTenant.role),
        tenant: {
          id: selectedTenant.id,
          name: selectedTenant.name,
        },
      });
    }

    const loginToken = signLoginSelectionToken(user.id);
    return res.json({
      mode: 'choose_tenant',
      loginToken,
      tenants: memberships.map((tenant) => ({ id: tenant.id, name: tenant.name, role: tenant.role })),
      user: buildUserPayload(user, null, 'user'),
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/select-tenant', async (req, res, next) => {
  const loginToken = cleanStr(req.body?.loginToken);
  const tenantId = cleanStr(req.body?.tenantId);

  if (!loginToken || !tenantId) {
    return res.status(400).json({ message: 'loginToken и tenantId са задължителни.' });
  }

  if (!isValidUuid(tenantId)) {
    return res.status(400).json({ message: 'Невалиден tenantId.' });
  }

  try {
    const userId = verifyLoginSelectionToken(loginToken);
    const userResult = await pool.query(
      `SELECT id, email, first_name, last_name, is_super_admin, is_active
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    if (!userResult.rowCount) {
      return res.status(401).json({ message: 'Потребителят не е намерен.' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ message: 'Потребителят е неактивен.' });
    }

    if (user.is_super_admin === true) {
      const tenantResult = await pool.query(
        `SELECT id AS "tenantId", name AS "tenantName"
         FROM tenants
         WHERE id = $1
           AND status = 'approved'
         LIMIT 1`,
        [tenantId]
      );

      if (!tenantResult.rowCount) {
        return res.status(403).json({ message: 'Нямате достъп до избраната фирма.' });
      }

      const row = tenantResult.rows[0];
      const token = signAccessToken({ user, tenantId: row.tenantId, role: 'admin' });
      return res.json({
        mode: 'ok',
        token,
        tenant: { id: row.tenantId, name: cleanStr(row.tenantName) },
        user: buildUserPayload(user, row.tenantId, 'admin'),
      });
    }

    const membershipResult = await pool.query(
      `SELECT tu.role,
              t.id AS "tenantId", t.name AS "tenantName"
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE tu.user_id = $1
         AND tu.tenant_id = $2
         AND t.status = 'approved'
       LIMIT 1`,
      [userId, tenantId]
    );

    if (!membershipResult.rowCount) {
      return res.status(403).json({ message: 'Нямате достъп до избраната фирма.' });
    }

    const row = membershipResult.rows[0];
    const role = normalizeTenantRole(row.role);
    const token = signAccessToken({ user, tenantId: row.tenantId, role });

    return res.json({
      mode: 'ok',
      token,
      tenant: { id: row.tenantId, name: cleanStr(row.tenantName) },
      user: buildUserPayload(user, row.tenantId, role),
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/me/tenants', requireAuth, async (req, res, next) => {
  try {
    if (req.user?.is_super_admin === true) {
      const tenantsResult = await pool.query(
        `SELECT id AS "tenantId", name AS "tenantName", status
         FROM tenants
         WHERE status = 'approved'
         ORDER BY name ASC, created_at ASC`
      );

      return res.json({
        tenants: tenantsResult.rows.map((row) => ({
          id: row.tenantId,
          name: cleanStr(row.tenantName),
          role: 'super_admin',
          status: normalizeTenantStatus(row.status),
        })),
      });
    }

    const membershipsResult = await pool.query(
      `SELECT tu.tenant_id AS "tenantId", tu.role, t.name AS "tenantName", t.status
       FROM tenant_users tu
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE tu.user_id = $1
       ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
                t.name ASC,
                tu.created_at ASC`,
      [req.user?.id]
    );

    return res.json({
      tenants: membershipsResult.rows.map(mapTenantMembership),
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/auth/switch-tenant', requireAuth, async (req, res, next) => {
  const tenantId = cleanStr(req.body?.tenantId);

  if (!tenantId || !isValidUuid(tenantId)) {
    return res.status(400).json({ message: 'Невалиден tenantId.' });
  }

  try {
    if (req.user?.is_super_admin === true) {
      const tenantResult = await pool.query(
        `SELECT id, name
         FROM tenants
         WHERE id = $1
           AND status = 'approved'
         LIMIT 1`,
        [tenantId]
      );

      if (!tenantResult.rowCount) {
        return res.status(404).json({ message: 'Tenant не е намерен.' });
      }

      const currentUserResult = await pool.query(
        `SELECT id, email, first_name, last_name, is_super_admin
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [req.user?.id]
      );

      if (!currentUserResult.rowCount) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const token = signAccessToken({ user: currentUserResult.rows[0], tenantId, role: 'admin' });

      return res.json({
        token,
        tenant: tenantResult.rows[0],
      });
    }

    const membershipResult = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_super_admin,
              tu.role,
              t.id AS "tenantId", t.name AS "tenantName"
       FROM users u
       JOIN tenant_users tu ON tu.user_id = u.id
       JOIN tenants t ON t.id = tu.tenant_id
       WHERE u.id = $1
         AND tu.tenant_id = $2
       LIMIT 1`,
      [req.user?.id, tenantId]
    );

    if (!membershipResult.rowCount) {
      return res.status(403).json({ message: 'Нямате достъп до избраната фирма.' });
    }

    const row = membershipResult.rows[0];
    const role = normalizeTenantRole(row.role);
    const token = signAccessToken({ user: row, tenantId: row.tenantId, role });

    return res.json({
      token,
      tenant: {
        id: row.tenantId,
        name: cleanStr(row.tenantName),
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/logs/connection', requireAuth, async (req, res, next) => {
  const tenantIdFromBody = cleanStr(req.body?.tenantId);
  const action = cleanStr(req.body?.action || 'backend_connection_lost') || 'backend_connection_lost';
  const details = req.body?.details && typeof req.body.details === 'object' ? req.body.details : {};

  try {
    let tenantId = tenantIdFromBody;

    if (tenantId && !isValidUuid(tenantId)) {
      return res.status(400).json({ message: 'Невалиден tenantId в лога.' });
    }

    if (!tenantId) {
      tenantId = await resolveTenantId(req);
    }

    if (tenantId && req.user?.is_super_admin !== true) {
      const access = await pool.query(
        `SELECT 1
         FROM tenant_users
         WHERE tenant_id = $1
           AND user_id = $2
         LIMIT 1`,
        [tenantId, req.user?.id]
      );
      if (!access.rowCount) {
        return res.status(403).json({ message: 'Нямате достъп до този tenant за запис на лог.' });
      }
    }

    await insertAuditLog(action, 'backend_connection', {
      tenantId: tenantId || null,
      actorUserId: req.user?.id || null,
      after: {
        ...details,
        readableMessage: cleanStr(details.error || 'Грешка при връзка със сървъра.'),
      },
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/platform/register', async (req, res, next) => {
  const companyName = cleanStr(req.body?.companyName);
  const companyEik = cleanStr(req.body?.companyEik);
  const ownerFullName = cleanStr(req.body?.ownerFullName);
  const ownerEmail = cleanStr(req.body?.ownerEmail).toLowerCase();
  const ownerPhone = cleanStr(req.body?.ownerPhone);
  const password = cleanStr(req.body?.password);

  if (!companyName || !companyEik || !/^\d{9,13}$/.test(companyEik) || !ownerFullName || !ownerEmail || !ownerPhone || !password || password.length < 8) {
    return res.status(400).json({ message: 'Попълнете коректно фирма, ЕИК (9-13 цифри), собственик, имейл, телефон и парола (мин. 8 символа).' });
  }

  const { firstName, lastName } = splitFullName(ownerFullName);

  try {
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, eik, owner_phone, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, name, eik, owner_phone AS "ownerPhone", status, created_at AS "createdAt", approved_at AS "approvedAt"`,
      [companyName, companyEik, ownerPhone]
    );

    const tenant = tenantResult.rows[0];

    const passwordHash = await bcrypt.hash(password, 12);

    const ownerUserResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive"`,
      [ownerEmail, passwordHash, firstName, lastName]
    );

    const ownerUser = ownerUserResult.rows[0];

    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'owner'`,
      [tenant.id, ownerUser.id]
    );

    await insertAuditLog('tenant_registered', 'tenant', {
      tenantId: tenant.id,
      actorUserId: ownerUser.id,
      entityId: tenant.id,
      after: { tenant, ownerUser, role: 'owner' },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({ ok: true, tenant, ownerUser });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/platform/users', requireAuth, async (req, res, next) => {

  const employeeId = cleanStr(req.body?.employeeId);
  const email = cleanStr(req.body?.email).toLowerCase();
  const password = cleanStr(req.body?.password);
  const role = cleanStr(req.body?.role).toLowerCase();

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Невалидни данни за потребител.' });
  }
  if (!['manager', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Позволени роли за добавяне: manager и user.' });
  }
  if (!isValidUuid(employeeId)) {
    return res.status(400).json({ message: 'Изберете валиден служител.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const tenantId = actor.tenantId;
    if (!['owner', 'admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ message: 'Само owner/admin може да добавя потребители.' });
    }

    const employeeCheck = await pool.query(
      `SELECT id, name
       FROM employees
       WHERE id = $1 AND tenant_id = $2`,
      [employeeId, tenantId]
    );
    if (!employeeCheck.rowCount) {
      return res.status(404).json({ message: 'Служителят не е намерен.' });
    }

    const { firstName, lastName } = splitFullName(employeeCheck.rows[0].name);

    const passwordHash = await bcrypt.hash(password, 12);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name
       RETURNING id, email, first_name AS "firstName", last_name AS "lastName", is_active AS "isActive", created_at AS "createdAt"`,
      [email, passwordHash, firstName, lastName]
    );

    const user = userResult.rows[0];

    await pool.query(
      `INSERT INTO tenant_users (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [tenantId, user.id, role]
    );

    await insertAuditLog('tenant_user_upserted', 'tenant_user', {
      tenantId,
      actorUserId: null,
      entityId: user.id,
      after: { userId: user.id, role, tenantId },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(201).json({ ok: true, user: { ...user, tenantId, role } });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/platform/users', requireAuth, async (req, res, next) => {
  try {
    const actor = await resolveActorTenant(req);
    const tenantId = actor.tenantId;

    if (!['owner', 'admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ message: 'Само owner/admin може да разглежда потребители.' });
    }

    const result = await pool.query(
      `SELECT u.id,
              u.email,
              u.first_name AS "firstName",
              u.last_name AS "lastName",
              u.is_active AS "isActive",
              u.created_at AS "createdAt",
              u.last_login_at AS "lastLoginAt",
              tu.role
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1
       ORDER BY u.created_at DESC, u.email ASC`,
      [tenantId]
    );

    const users = result.rows.map((row) => ({
      ...row,
      fullName: `${cleanStr(row.firstName)} ${cleanStr(row.lastName)}`.trim(),
      tenantId,
    }));

    return res.json({ ok: true, users });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/platform/users/:userId', requireAuth, async (req, res, next) => {
  const userId = cleanStr(req.params.userId);
  const role = cleanStr(req.body?.role).toLowerCase();
  const hasIsActive = Object.prototype.hasOwnProperty.call(req.body || {}, 'isActive');
  const isActive = hasIsActive ? req.body.isActive === true : null;

  if (!isValidUuid(userId)) {
    return res.status(400).json({ message: 'Невалиден user id.' });
  }
  if (role && !['admin', 'manager', 'user'].includes(role)) {
    return res.status(400).json({ message: 'Позволени роли: admin, manager, user.' });
  }
  if (!role && !hasIsActive) {
    return res.status(400).json({ message: 'Липсват данни за промяна.' });
  }

  try {
    const actor = await resolveActorTenant(req);
    const tenantId = actor.tenantId;

    if (!['owner', 'admin', 'super_admin'].includes(actor.role)) {
      return res.status(403).json({ message: 'Само owner/admin може да редактира потребители.' });
    }

    const membership = await pool.query(
      `SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [tenantId, userId]
    );

    if (!membership.rowCount) {
      return res.status(404).json({ message: 'Потребителят не е намерен за тази фирма.' });
    }

    const currentRole = cleanStr(membership.rows[0].role).toLowerCase();

    if (role) {
      if (currentRole === 'owner' && role !== 'owner') {
        return res.status(403).json({ message: 'Ролята owner не може да бъде понижена.' });
      }

      await pool.query(
        `UPDATE tenant_users
         SET role = $3
         WHERE tenant_id = $1 AND user_id = $2`,
        [tenantId, userId, role]
      );
    }

    if (hasIsActive) {
      await pool.query(
        `UPDATE users
         SET is_active = $2
         WHERE id = $1`,
        [userId, isActive]
      );
    }

    const updated = await pool.query(
      `SELECT u.id,
              u.email,
              u.first_name AS "firstName",
              u.last_name AS "lastName",
              u.is_active AS "isActive",
              u.created_at AS "createdAt",
              u.last_login_at AS "lastLoginAt",
              tu.role
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1 AND u.id = $2
       LIMIT 1`,
      [tenantId, userId]
    );

    await insertAuditLog('tenant_user_updated', 'tenant_user', {
      tenantId,
      actorUserId: req.user?.id || null,
      entityId: userId,
      after: { role: updated.rows[0]?.role, isActive: updated.rows[0]?.isActive },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    const row = updated.rows[0];
    return res.json({
      ok: true,
      user: {
        ...row,
        fullName: `${cleanStr(row.firstName)} ${cleanStr(row.lastName)}`.trim(),
        tenantId,
      },
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/platform/super-admin/overview', requireSuperAdmin, async (req, res, next) => {

  try {
    const tableExists = async (tableName) => {
      const check = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
      return Boolean(check.rows[0]?.exists);
    };

    const tableHasColumn = async (tableName, columnName) => {
      const check = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
         LIMIT 1`,
        [tableName, columnName]
      );
      return Boolean(check.rowCount);
    };

    const countAllRows = async (tableName) => {
      if (!(await tableExists(tableName))) {
        return 0;
      }
      const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
      return countResult.rows[0]?.count || 0;
    };

    const countRowsByTenant = async (tableName) => {
      const hasTable = await tableExists(tableName);
      if (!hasTable || !(await tableHasColumn(tableName, 'tenant_id'))) {
        return new Map();
      }

      const rows = await pool.query(
        `SELECT tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM ${tableName}
         WHERE tenant_id IS NOT NULL
         GROUP BY tenant_id`
      );

      return new Map(rows.rows.map((row) => [String(row.tenantId), row.count]));
    };

    const countEmployeesByTenant = async () => {
      const hasEmployees = await tableExists('employees');
      const hasDepartments = await tableExists('departments');
      if (!hasEmployees || !hasDepartments) {
        return new Map();
      }

      const [hasDepartmentIdOnEmployees, hasTenantIdOnDepartments] = await Promise.all([
        tableHasColumn('employees', 'department_id'),
        tableHasColumn('departments', 'tenant_id'),
      ]);

      if (!hasDepartmentIdOnEmployees || !hasTenantIdOnDepartments) {
        return new Map();
      }

      const rows = await pool.query(
        `SELECT d.tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM employees e
         JOIN departments d ON d.id = e.department_id
         WHERE d.tenant_id IS NOT NULL
         GROUP BY d.tenant_id`
      );

      return new Map(rows.rows.map((row) => [String(row.tenantId), row.count]));
    };

    const [
      hasTenants,
      hasTenantUsers,
      hasUsers,
      hasAuditLog,
      hasRequestLog,
      hasTenantsEik,
      hasTenantsOwnerPhone,
      hasTenantsApprovedAt,
      hasUsersFirstName,
      hasUsersLastName,
      hasAuditBeforeJson,
      hasAuditAfterJson,
      hasAuditIp,
      hasAuditUserAgent,
    ] = await Promise.all([
      tableExists('tenants'),
      tableExists('tenant_users'),
      tableExists('users'),
      tableExists('audit_log'),
      tableExists('request_log'),
      tableHasColumn('tenants', 'eik'),
      tableHasColumn('tenants', 'owner_phone'),
      tableHasColumn('tenants', 'approved_at'),
      tableHasColumn('users', 'first_name'),
      tableHasColumn('users', 'last_name'),
      tableHasColumn('audit_log', 'before_json'),
      tableHasColumn('audit_log', 'after_json'),
      tableHasColumn('audit_log', 'ip'),
      tableHasColumn('audit_log', 'user_agent'),
    ]);

    const tenantsSelect = [
      't.id',
      't.name',
      hasTenantsEik ? 't.eik' : "''::text AS eik",
      hasTenantsOwnerPhone ? 't.owner_phone AS "ownerPhone"' : "''::text AS \"ownerPhone\"",
      't.status',
      't.created_at AS "createdAt"',
      hasTenantsApprovedAt ? 't.approved_at AS "approvedAt"' : 'NULL::timestamptz AS "approvedAt"',
    ];

    const ownerNameExpr = hasUsersFirstName || hasUsersLastName
      ? "NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '')"
      : 'u.email';

    const tenantsResult = hasTenants
      ? await pool.query(
        `SELECT
           ${tenantsSelect.join(',\n           ')},
           owner.owner_full_name AS "ownerFullName",
           owner.owner_email AS "ownerEmail"
         FROM tenants t
         LEFT JOIN LATERAL (
           SELECT
             ${ownerNameExpr} AS owner_full_name,
             u.email AS owner_email
           FROM tenant_users tu
           JOIN users u ON u.id = tu.user_id
           WHERE tu.tenant_id = t.id
             AND tu.role = 'owner'
           ORDER BY tu.created_at ASC
           LIMIT 1
         ) owner ON ${hasTenantUsers && hasUsers ? 'TRUE' : 'FALSE'}
         ORDER BY t.created_at DESC`
      )
      : { rows: [] };

    const usersByRoleResult = hasTenantUsers
      ? await pool.query(
        `SELECT tu.role, COUNT(*)::int AS count
         FROM tenant_users tu
         GROUP BY tu.role
         ORDER BY tu.role`
      )
      : { rows: [] };

    const [employeesCount, schedulesCount, scheduleEntriesCount, tenantsCount, usersCount, databaseSizeBytes] = await Promise.all([
      countAllRows('employees'),
      countAllRows('schedules'),
      countAllRows('schedule_entries'),
      countAllRows('tenants'),
      countAllRows('users'),
      pool.query('SELECT pg_database_size(current_database())::bigint AS "databaseSizeBytes"').then((r) => r.rows[0]?.databaseSizeBytes || 0),
    ]);

    const usage = {
      databaseSizeBytes,
      employeesCount,
      schedulesCount,
      scheduleEntriesCount,
      tenantsCount,
      usersCount,
    };

    const [employeesByTenant, departmentsByTenant, schedulesByTenant, scheduleEntriesByTenant, auditByTenant, requestsByTenant] = await Promise.all([
      countEmployeesByTenant(),
      countRowsByTenant('departments'),
      countRowsByTenant('schedules'),
      countRowsByTenant('schedule_entries'),
      countRowsByTenant('audit_log'),
      countRowsByTenant('request_log'),
    ]);

    const usersByTenant = new Map();
    tenantsResult.rows.forEach((tenant) => {
      usersByTenant.set(String(tenant.id), 0);
    });

    if (hasTenantUsers) {
      const tenantUserCounts = await pool.query(
        `SELECT tenant_id AS "tenantId", COUNT(*)::int AS count
         FROM tenant_users
         GROUP BY tenant_id`
      );
      tenantUserCounts.rows.forEach((row) => {
        usersByTenant.set(String(row.tenantId), row.count);
      });
    }

    const latestLogs = hasAuditLog
      ? await pool.query(
        `SELECT
           id,
           tenant_id AS "tenantId",
           actor_user_id AS "actorUserId",
           action,
           entity,
           entity_id AS "entityId",
           ${hasAuditBeforeJson ? 'before_json AS "beforeJson"' : 'NULL::jsonb AS "beforeJson"'},
           ${hasAuditAfterJson ? 'after_json AS "afterJson"' : 'NULL::jsonb AS "afterJson"'},
           ${hasAuditIp ? 'ip' : "NULL::text AS ip"},
           ${hasAuditUserAgent ? 'user_agent AS "userAgent"' : 'NULL::text AS "userAgent"'},
           created_at AS "createdAt"
         FROM audit_log
         ORDER BY created_at DESC
         LIMIT 200`
      )
      : { rows: [] };

    const tenantUsage = tenantsResult.rows.map((tenant) => {
      const tenantId = String(tenant.id);
      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        usersCount: usersByTenant.get(tenantId) ?? 0,
        employeesCount: employeesByTenant.get(tenantId) ?? 0,
        departmentsCount: departmentsByTenant.get(tenantId) ?? 0,
        schedulesCount: schedulesByTenant.get(tenantId) ?? 0,
        scheduleEntriesCount: scheduleEntriesByTenant.get(tenantId) ?? 0,
        auditEventsCount: auditByTenant.get(tenantId) ?? 0,
        requestsCount: requestsByTenant.get(tenantId) ?? 0,
      };
    });

    return res.json({
      ok: true,
      tenants: tenantsResult.rows,
      usersByRole: usersByRoleResult.rows,
      usage,
      tenantUsage,
      logs: latestLogs.rows,
    });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/platform/super-admin/registrations/:id/status', requireSuperAdmin, async (req, res, next) => {

  const id = cleanStr(req.params.id);
  const status = cleanStr(req.body?.status).toLowerCase();

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Невалиден tenant id.' });
  }
  if (!['pending', 'approved', 'disabled'].includes(status)) {
    return res.status(400).json({ message: 'Невалиден статус.' });
  }

  try {
    const updated = await pool.query(
      `UPDATE tenants
       SET status = $2,
           approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END
       WHERE id = $1
       RETURNING id, name, status, created_at AS "createdAt", approved_at AS "approvedAt"`,
      [id, status]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Организацията не е намерена.' });
    }

    await insertAuditLog('tenant_status_changed', 'tenant', {
      tenantId: id,
      entityId: id,
      after: { status },
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.json({ ok: true, tenant: updated.rows[0] });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/platform/super-admin/tables/:tableName', requireSuperAdmin, async (req, res, next) => {

  const tableName = cleanStr(req.params.tableName).toLowerCase();
  const allowedTables = new Set(['tenants', 'users', 'tenant_users', 'audit_log', 'request_log', 'employees', 'departments', 'schedules', 'schedule_entries', 'shift_templates']);
  if (!allowedTables.has(tableName)) {
    return res.status(400).json({ message: 'Таблицата не е позволена за директен достъп.' });
  }

  try {
    const result = await pool.query(`SELECT row_to_json(t) AS row FROM (SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT 200) t`);
    return res.json({ ok: true, tableName, rows: result.rows.map((item) => item.row) });
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(path.join(__dirname)));

app.use((error, req, res, next) => {
  const status = Number(error?.status) || 500;
  const message = status >= 500 ? 'Internal server error' : error.message || 'Request failed';

  if (status >= 500) {
    console.error('Unhandled error:', error);
  }

  if (res.headersSent) {
    return next(error);
  }

  return res.status(status).json({ message });
});


app.get('/api/schedules/:id/totals', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  const period = cleanStr(req.query?.period || 'month').toLowerCase();
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }
  if (!['month', 'sirv'].includes(period)) {
    return res.status(400).json({ message: 'period трябва да е month|sirv.' });
  }

  try {
    const scheduleResult = await pool.query(
      `SELECT id, month_key, status, COALESCE(sirv_enabled, FALSE) AS sirv_enabled, COALESCE(sirv_period_months, 1) AS sirv_period_months
       FROM schedules
       WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );
    if (!scheduleResult.rowCount) {
      return res.status(404).json({ message: 'Графикът не е намерен.' });
    }
    const schedule = scheduleResult.rows[0];

    const sumMonth = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(work_minutes_total, work_minutes, 0)),0)::int AS total_work,
              COALESCE(SUM(COALESCE(night_minutes, 0)),0)::int AS night,
              COALESCE(SUM(COALESCE(weekend_minutes, 0)),0)::int AS weekend,
              COALESCE(SUM(COALESCE(holiday_minutes, 0)),0)::int AS holiday,
              COALESCE(SUM(COALESCE(overtime_minutes, 0)),0)::int AS overtime
       FROM schedule_entries
       WHERE schedule_id = $1`,
      [scheduleId]
    );

    const totals = sumMonth.rows[0];
    if (period === 'month' || !schedule.sirv_enabled) {
      return res.json({ ok: true, period: 'month', totals, overtime_mode: 'daily' });
    }

    const bounds = getSirvPeriodBounds(schedule.month_key, schedule.sirv_period_months);
    const periodScheduleIds = await pool.query(
      `SELECT id FROM schedules
       WHERE tenant_id = $1 AND month_key >= $2 AND month_key <= $3`,
      [req.tenantId, bounds.periodStart.slice(0, 7), bounds.periodEnd.slice(0, 7)]
    );
    const ids = periodScheduleIds.rows.map((r) => r.id);
    const periodWorkedResult = ids.length
      ? await pool.query(
        `SELECT COALESCE(SUM(COALESCE(work_minutes_total, work_minutes, 0)), 0)::int AS worked
         FROM schedule_entries
         WHERE schedule_id = ANY($1::uuid[])`,
        [ids]
      )
      : { rows: [{ worked: 0 }] };

    const holidayResolver = await buildHolidayResolver();
    const businessDays = countBusinessDays(bounds.periodStart, bounds.periodEnd, holidayResolver);
    const periodNorm = businessDays * 480;
    const overtimePeriod = Math.max(0, Number(periodWorkedResult.rows[0].worked || 0) - periodNorm);

    return res.json({
      ok: true,
      period: 'sirv',
      period_start: bounds.periodStart,
      period_end: bounds.periodEnd,
      totals: {
        ...totals,
        overtime_estimated: schedule.status === 'locked' ? undefined : overtimePeriod,
        overtime_final: schedule.status === 'locked' ? overtimePeriod : undefined,
      },
      sirv_enabled: true,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Schedule backend ready on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Database init error:', error);
    process.exit(1);
  });

app.post('/api/schedules/:id/lock', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }
  try {
    const result = await pool.query(
      `UPDATE schedules
       SET status = 'locked', locked_at = NOW(), locked_by = $3
       WHERE id = $1 AND tenant_id = $2 AND status <> 'locked'
       RETURNING id, status, locked_at, locked_by`,
      [scheduleId, req.tenantId, req.user?.id || null]
    );
    if (!result.rowCount) {
      return res.status(409).json({ message: 'Графикът е вече заключен или липсва.' });
    }

    const scheduleMetaResult = await pool.query(
      `SELECT month_key, COALESCE(sirv_enabled, FALSE) AS sirv_enabled, COALESCE(sirv_period_months,1) AS sirv_period_months
       FROM schedules
       WHERE id = $1 AND tenant_id = $2`,
      [scheduleId, req.tenantId]
    );
    const scheduleMeta = scheduleMetaResult.rows[0] || null;
    if (scheduleMeta?.sirv_enabled) {
      const bounds = getSirvPeriodBounds(scheduleMeta.month_key, scheduleMeta.sirv_period_months);
      const scheduleIdsRes = await pool.query(
        `SELECT id FROM schedules WHERE tenant_id = $1 AND month_key >= $2 AND month_key <= $3`,
        [req.tenantId, bounds.periodStart.slice(0, 7), bounds.periodEnd.slice(0, 7)]
      );
      const scopeIds = scheduleIdsRes.rows.map((r) => r.id);
      const rowsRes = scopeIds.length
        ? await pool.query(
          `SELECT se.schedule_id, se.employee_id, se.day, s.month_key,
                  COALESCE(se.work_minutes_total, se.work_minutes, 0)::int AS work_minutes_total
           FROM schedule_entries se
           JOIN schedules s ON s.id = se.schedule_id
           WHERE se.schedule_id = ANY($1::uuid[])
           ORDER BY se.employee_id, s.month_key, se.day`,
          [scopeIds]
        )
        : { rows: [] };

      const holidayResolver = await buildHolidayResolver();
      const businessDays = countBusinessDays(bounds.periodStart, bounds.periodEnd, holidayResolver);
      const periodNorm = businessDays * 480;

      const byEmployee = new Map();
      for (const row of rowsRes.rows) {
        const key = String(row.employee_id);
        if (!byEmployee.has(key)) byEmployee.set(key, []);
        byEmployee.get(key).push(row);
      }

      for (const [, entries] of byEmployee.entries()) {
        const worked = entries.reduce((acc, r) => acc + Number(r.work_minutes_total || 0), 0);
        let remaining = Math.max(0, worked - periodNorm);
        const updates = [];

        const dailyCandidate = new Map(entries.map((e) => [`${e.schedule_id}|${e.employee_id}|${e.day}`, Math.max(0, Number(e.work_minutes_total || 0) - 480)]));
        for (let i = entries.length - 1; i >= 0; i -= 1) {
          const e = entries[i];
          const key = `${e.schedule_id}|${e.employee_id}|${e.day}`;
          const candidate = dailyCandidate.get(key) || 0;
          const assigned = Math.min(remaining, candidate);
          updates.push({ ...e, overtime: assigned });
          remaining -= assigned;
        }
        if (remaining > 0) {
          for (let i = 0; i < updates.length && remaining > 0; i += 1) {
            const extra = Math.min(remaining, Number(updates[i].work_minutes_total || 0));
            updates[i].overtime += extra;
            remaining -= extra;
          }
        }

        for (const up of updates) {
          await pool.query(
            `UPDATE schedule_entries
             SET overtime_minutes = $1
             WHERE schedule_id = $2 AND employee_id = $3 AND day = $4`,
            [up.overtime, up.schedule_id, up.employee_id, up.day]
          );
        }
      }
    }

    await insertAuditLog('lock_schedule', 'schedule', {
      tenantId: req.tenantId,
      actorUserId: req.user?.id,
      scheduleId,
      employeeId: req.user?.id,
      entryDate: normalizeDateOnly(new Date().toISOString().slice(0, 10)),
      after: result.rows[0],
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    return res.json({ ok: true, schedule: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/schedules/:id/unlock', requireAuth, requireTenantContext, async (req, res) => {
  const scheduleId = req.params.id;
  if (!isValidUuid(scheduleId)) {
    return res.status(400).json({ message: 'Невалиден schedule id.' });
  }

  const role = cleanStr(req.user?.role || req.get('x-user-role')).toLowerCase();
  if (!['owner', 'super_admin'].includes(role) && req.user?.is_super_admin !== true) {
    return res.status(403).json({ message: 'Само owner/superadmin може да отключва.' });
  }

  try {
    const result = await pool.query(
      `UPDATE schedules
       SET status = 'draft', locked_at = NULL, locked_by = NULL
       WHERE id = $1 AND tenant_id = $2 AND status <> 'draft'
       RETURNING id, status, locked_at, locked_by`,
      [scheduleId, req.tenantId]
    );
    if (!result.rowCount) {
      return res.status(409).json({ message: 'Графикът е вече отключен или липсва.' });
    }

    await insertAuditLog('unlock_schedule', 'schedule', {
      tenantId: req.tenantId,
      actorUserId: req.user?.id,
      scheduleId,
      employeeId: req.user?.id,
      entryDate: normalizeDateOnly(new Date().toISOString().slice(0, 10)),
      after: result.rows[0],
      ip: req.ip,
      userAgent: req.get('user-agent') || null,
    });

    return res.json({ ok: true, schedule: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
