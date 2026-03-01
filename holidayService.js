function normalizeDateOnly(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function orthodoxEasterDate(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  return julian;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekendDate(date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function buildObservedNonWorkingDays(rows) {
  const occupiedDates = new Set(rows.map((row) => row.date));
  const observedRows = [];
  const weekendRows = rows
    .filter((row) => {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      return !Number.isNaN(date.valueOf()) && isWeekendDate(date);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const weekendHoliday of weekendRows) {
    const cursor = new Date(`${weekendHoliday.date}T00:00:00.000Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);

    while (true) {
      const candidate = toISODate(cursor);
      const isBusy = occupiedDates.has(candidate);
      const isWeekend = isWeekendDate(cursor);
      if (!isBusy && !isWeekend) {
        occupiedDates.add(candidate);
        observedRows.push({
          date: candidate,
          name: `${weekendHoliday.name} (компенсация)`,
          is_official: true,
          source: 'BG official (observed)'
        });
        break;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return observedRows;
}

function getBgHolidaySeedRows(year) {
  const fixed = [
    ['01-01', 'Нова година'],
    ['03-03', 'Освобождение на България'],
    ['05-01', 'Ден на труда'],
    ['05-06', 'Гергьовден'],
    ['05-24', 'Ден на българската просвета и култура'],
    ['09-06', 'Съединението'],
    ['09-22', 'Независимостта на България'],
    ['12-24', 'Бъдни вечер'],
    ['12-25', 'Рождество Христово'],
    ['12-26', 'Рождество Христово'],
  ];

  const rows = fixed.map(([mmdd, name]) => ({ date: `${year}-${mmdd}`, name, is_official: true, source: 'BG official' }));
  const easter = orthodoxEasterDate(year);
  rows.push({ date: toISODate(addDays(easter, -2)), name: 'Велики петък', is_official: true, source: 'BG official' });
  rows.push({ date: toISODate(addDays(easter, -1)), name: 'Велика събота', is_official: true, source: 'BG official' });
  rows.push({ date: toISODate(easter), name: 'Великден', is_official: true, source: 'BG official' });
  rows.push({ date: toISODate(addDays(easter, 1)), name: 'Великден', is_official: true, source: 'BG official' });

  rows.push(...buildObservedNonWorkingDays(rows));

  return Array.from(new Map(rows.map((row) => [row.date, row])).values()).sort((a, b) => a.date.localeCompare(b.date));
}

function createHolidayService(pool) {
  let tenantTableExistsCache = null;
  let publicTableCache = null;

  async function tenantTableExists() {
    if (tenantTableExistsCache === null) {
      const res = await pool.query("SELECT to_regclass('public.tenant_holidays') IS NOT NULL AS exists");
      tenantTableExistsCache = Boolean(res.rows[0]?.exists);
    }
    return tenantTableExistsCache;
  }

  async function publicTableName() {
    if (publicTableCache !== null) {
      return publicTableCache;
    }
    const hasLegacy = await pool.query("SELECT to_regclass('public.holidays') IS NOT NULL AS exists");
    if (hasLegacy.rows[0]?.exists) {
      publicTableCache = 'holidays';
      return publicTableCache;
    }
    const hasNew = await pool.query("SELECT to_regclass('public.public_holidays_bg') IS NOT NULL AS exists");
    publicTableCache = hasNew.rows[0]?.exists ? 'public_holidays_bg' : '';
    return publicTableCache;
  }

  async function isHoliday(tenantId, dateISO) {
    const date = normalizeDateOnly(dateISO);
    if (!date) return { isHoliday: false, type: 'none' };

    if (await tenantTableExists()) {
      const tenantRes = await pool.query(
        `SELECT name, COALESCE(is_working_day_override, FALSE) AS is_working_day_override,
                COALESCE(is_company_day_off, TRUE) AS is_company_day_off
         FROM tenant_holidays
         WHERE tenant_id = $1 AND date = $2::date
         LIMIT 1`,
        [tenantId, date]
      );
      if (tenantRes.rowCount) {
        const row = tenantRes.rows[0];
        if (row.is_working_day_override) return { isHoliday: false, name: row.name, type: 'override_working' };
        if (row.is_company_day_off) return { isHoliday: true, name: row.name, type: 'company' };
      }
    }

    const table = await publicTableName();
    if (!table) return { isHoliday: false, type: 'none' };

    const officialRes = await pool.query(`SELECT name FROM ${table} WHERE date = $1::date LIMIT 1`, [date]);
    if (officialRes.rowCount) return { isHoliday: true, name: officialRes.rows[0].name, type: 'official' };
    return { isHoliday: false, type: 'none' };
  }

  async function listCombined(tenantId, fromISO, toISO) {
    const from = normalizeDateOnly(fromISO);
    const to = normalizeDateOnly(toISO);
    if (!from || !to || from > to) return [];

    const byDate = new Map();
    const table = await publicTableName();
    if (table) {
      const officialRows = await pool.query(`SELECT date::text AS date, name FROM ${table} WHERE date BETWEEN $1::date AND $2::date ORDER BY date`, [from, to]);
      for (const row of officialRows.rows) {
        byDate.set(row.date, { date: row.date, name: row.name, type: 'official', isHoliday: true });
      }
    }

    if (await tenantTableExists()) {
      const tenantRows = await pool.query(
        `SELECT date::text AS date, name,
                COALESCE(is_working_day_override, FALSE) AS is_working_day_override,
                COALESCE(is_company_day_off, TRUE) AS is_company_day_off
         FROM tenant_holidays
         WHERE tenant_id = $1 AND date BETWEEN $2::date AND $3::date
         ORDER BY date`,
        [tenantId, from, to]
      );
      for (const row of tenantRows.rows) {
        if (row.is_working_day_override) byDate.set(row.date, { date: row.date, name: row.name, type: 'override_working', isHoliday: false });
        else if (row.is_company_day_off) byDate.set(row.date, { date: row.date, name: row.name, type: 'company', isHoliday: true });
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async function upsertTenantHoliday({ tenantId, date, name, isCompanyDayOff = true, isWorkingDayOverride = false, note = null, createdBy = null }) {
    if (!(await tenantTableExists())) {
      throw new Error('tenant_holidays table is missing');
    }
    return pool.query(
      `INSERT INTO tenant_holidays (tenant_id, date, name, is_company_day_off, is_working_day_override, note, created_by)
       VALUES ($1, $2::date, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_id, date)
       DO UPDATE SET name = EXCLUDED.name,
                     is_company_day_off = EXCLUDED.is_company_day_off,
                     is_working_day_override = EXCLUDED.is_working_day_override,
                     note = EXCLUDED.note,
                     created_by = EXCLUDED.created_by
       RETURNING id, tenant_id AS "tenantId", date::text AS date, name,
                 is_company_day_off AS "isCompanyDayOff", is_working_day_override AS "isWorkingDayOverride", note`,
      [tenantId, date, name, Boolean(isCompanyDayOff), Boolean(isWorkingDayOverride), note, createdBy]
    );
  }

  async function deleteTenantHoliday(tenantId, date) {
    if (!(await tenantTableExists())) {
      return { rowCount: 0 };
    }
    return pool.query('DELETE FROM tenant_holidays WHERE tenant_id = $1 AND date = $2::date', [tenantId, date]);
  }

  async function seedYear(year) {
    const table = await publicTableName();
    if (!table) return 0;
    const rows = getBgHolidaySeedRows(year);
    for (const row of rows) {
      await pool.query(
        `INSERT INTO ${table}(date, name, is_official, source)
         VALUES ($1::date, $2, $3, $4)
         ON CONFLICT (date) DO UPDATE
           SET name = EXCLUDED.name,
               is_official = EXCLUDED.is_official,
               source = COALESCE(EXCLUDED.source, ${table}.source)`,
        [row.date, row.name, row.is_official, row.source]
      );
    }
    return rows.length;
  }

  return { isHoliday, listCombined, upsertTenantHoliday, deleteTenantHoliday, seedYear };
}

module.exports = { createHolidayService, getBgHolidaySeedRows };
