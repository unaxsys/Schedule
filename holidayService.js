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
      if (String(row.source || '').includes('(easter)')) return false;
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
          name: `${weekendHoliday.name} (компенсация по КТ)`,
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
  rows.push({ date: toISODate(addDays(easter, -2)), name: 'Велики петък', is_official: true, source: 'BG official (easter)' });
  rows.push({ date: toISODate(addDays(easter, -1)), name: 'Велика събота', is_official: true, source: 'BG official (easter)' });
  rows.push({ date: toISODate(easter), name: 'Великден', is_official: true, source: 'BG official (easter)' });
  rows.push({ date: toISODate(addDays(easter, 1)), name: 'Великден', is_official: true, source: 'BG official (easter)' });

  rows.push(...buildObservedNonWorkingDays(rows));

  return Array.from(new Map(rows.map((row) => [row.date, row])).values()).sort((a, b) => a.date.localeCompare(b.date));
}


function getBgOfficialHolidayMapForRange(fromISO, toISO) {
  const fromYear = Number(String(fromISO).slice(0, 4));
  const toYear = Number(String(toISO).slice(0, 4));
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) return new Map();

  const byDate = new Map();
  for (let year = fromYear; year <= toYear; year += 1) {
    const rows = getBgHolidaySeedRows(year);
    for (const row of rows) {
      if (row.date >= fromISO && row.date <= toISO) {
        byDate.set(row.date, row);
      }
    }
  }
  return byDate;
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
    const hasNew = await pool.query("SELECT to_regclass('public.public_holidays_bg') IS NOT NULL AS exists");
    if (hasNew.rows[0]?.exists) {
      publicTableCache = 'public_holidays_bg';
      return publicTableCache;
    }
    const hasLegacy = await pool.query("SELECT to_regclass('public.holidays') IS NOT NULL AS exists");
    publicTableCache = hasLegacy.rows[0]?.exists ? 'holidays' : '';
    return publicTableCache;
  }

  function isMissingColumnError(error) {
    return String(error?.code || '') === '42703' || String(error?.message || '').toLowerCase().includes('column');
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
    if (table) {
      const officialRes = await pool.query(`SELECT name FROM ${table} WHERE date = $1::date LIMIT 1`, [date]);
      if (officialRes.rowCount) return { isHoliday: true, name: officialRes.rows[0].name, type: 'official' };
    }

    const fallback = getBgOfficialHolidayMapForRange(date, date).get(date);
    if (fallback) return { isHoliday: true, name: fallback.name, type: 'official' };
    return { isHoliday: false, type: 'none' };
  }

  async function listCombined(tenantId, fromISO, toISO) {
    const from = normalizeDateOnly(fromISO);
    const to = normalizeDateOnly(toISO);
    if (!from || !to || from > to) return [];

    const byDate = new Map();
    const fallbackOfficial = getBgOfficialHolidayMapForRange(from, to);
    for (const [date, row] of fallbackOfficial.entries()) {
      byDate.set(date, { date, name: row.name, type: 'official', isHoliday: true });
    }

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


  async function listPublicHolidays(fromISO, toISO) {
    const from = normalizeDateOnly(fromISO);
    const to = normalizeDateOnly(toISO);
    if (!from || !to || from > to) return [];

    const byDate = new Map();
    const fallbackOfficial = getBgOfficialHolidayMapForRange(from, to);
    for (const [date, row] of fallbackOfficial.entries()) {
      byDate.set(date, { date, name: row.name, isOfficial: true, source: row.source || 'BG official' });
    }

    const table = await publicTableName();
    if (table) {
      let rows;
      try {
        rows = await pool.query(
          `SELECT date::text AS date, name, COALESCE(is_official, TRUE) AS is_official, source
           FROM ${table}
           WHERE date BETWEEN $1::date AND $2::date
           ORDER BY date`,
          [from, to]
        );
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }
        rows = await pool.query(
          `SELECT date::text AS date, name
           FROM ${table}
           WHERE date BETWEEN $1::date AND $2::date
           ORDER BY date`,
          [from, to]
        );
      }

      for (const row of rows.rows) {
        byDate.set(row.date, {
          date: row.date,
          name: row.name,
          isOfficial: Boolean(row.is_official ?? true),
          source: row.source || 'BG official',
        });
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async function upsertPublicHoliday({ date, name, source = 'platform' }) {
    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate || !String(name || '').trim()) {
      throw new Error('date and name are required');
    }
    const table = await publicTableName();
    if (!table) {
      throw new Error('public holidays table is missing');
    }

    let result;
    try {
      result = await pool.query(
        `INSERT INTO ${table}(date, name, is_official, source)
         VALUES ($1::date, $2, TRUE, $3)
         ON CONFLICT (date) DO UPDATE
         SET name = EXCLUDED.name,
             is_official = EXCLUDED.is_official,
             source = COALESCE(EXCLUDED.source, ${table}.source)
         RETURNING date::text AS date, name, COALESCE(is_official, TRUE) AS "isOfficial", source`,
        [normalizedDate, String(name).trim(), String(source || '').trim() || 'platform']
      );
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
      result = await pool.query(
        `INSERT INTO ${table}(date, name)
         VALUES ($1::date, $2)
         ON CONFLICT (date) DO UPDATE
         SET name = EXCLUDED.name
         RETURNING date::text AS date, name`,
        [normalizedDate, String(name).trim()]
      );
    }

    return {
      date: result.rows[0]?.date || normalizedDate,
      name: result.rows[0]?.name || String(name).trim(),
      isOfficial: true,
      source: result.rows[0]?.source || String(source || '').trim() || 'platform',
    };
  }

  async function deletePublicHoliday(date) {
    const normalizedDate = normalizeDateOnly(date);
    if (!normalizedDate) {
      throw new Error('invalid date');
    }
    const table = await publicTableName();
    if (!table) {
      return { rowCount: 0 };
    }

    return pool.query(`DELETE FROM ${table} WHERE date = $1::date`, [normalizedDate]);
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

  return { isHoliday, listCombined, upsertTenantHoliday, deleteTenantHoliday, listPublicHolidays, upsertPublicHoliday, deletePublicHoliday, seedYear };
}

module.exports = { createHolidayService, getBgHolidaySeedRows };
