const test = require('node:test');
const assert = require('node:assert/strict');

function cleanStoredValue(value) {
  return String(value || '').trim();
}

function filterShiftTemplatesByDepartment(shiftTemplates = [], departmentId = null) {
  const normalizedDepartmentId = cleanStoredValue(departmentId) || null;
  return (Array.isArray(shiftTemplates) ? shiftTemplates : []).filter((shift) => {
    const shiftDepartmentId = cleanStoredValue(shift?.departmentId || shift?.department_id) || null;
    if (!normalizedDepartmentId) {
      return !shiftDepartmentId;
    }
    return !shiftDepartmentId || shiftDepartmentId === normalizedDepartmentId;
  });
}

function getDepartmentShiftCacheKey({ tenantId, departmentId }) {
  const normalizedTenantId = cleanStoredValue(tenantId) || 'default';
  const normalizedDepartmentId = cleanStoredValue(departmentId) || 'global';
  return `${normalizedTenantId}::${normalizedDepartmentId}`;
}

test('Hotel вижда само global + Hotel смени', () => {
  const shifts = [
    { code: 'P', departmentId: null },
    { code: 'O', departmentId: null },
    { code: 'B', departmentId: null },
    { code: 'R', departmentId: null },
    { code: '1СМ', departmentId: 'hotel' },
    { code: '2СМ', departmentId: 'hotel' },
    { code: 'ADMIN1', departmentId: 'admin' },
  ];

  const visible = filterShiftTemplatesByDepartment(shifts, 'hotel').map((s) => s.code);
  assert.deepEqual(visible, ['P', 'O', 'B', 'R', '1СМ', '2СМ']);
});

test('Администрация вижда само global + Администрация смени', () => {
  const shifts = [
    { code: 'P', departmentId: null },
    { code: 'O', departmentId: null },
    { code: 'B', departmentId: null },
    { code: 'R', departmentId: null },
    { code: '1СМ', departmentId: 'hotel' },
    { code: 'АДМ', departmentId: 'admin' },
  ];

  const visible = filterShiftTemplatesByDepartment(shifts, 'admin').map((s) => s.code);
  assert.deepEqual(visible, ['P', 'O', 'B', 'R', 'АДМ']);
});

test('Cache ключът включва tenantId + departmentId', () => {
  assert.equal(getDepartmentShiftCacheKey({ tenantId: 't1', departmentId: 'hotel' }), 't1::hotel');
  assert.equal(getDepartmentShiftCacheKey({ tenantId: 't2', departmentId: 'hotel' }), 't2::hotel');
  assert.notEqual(
    getDepartmentShiftCacheKey({ tenantId: 't1', departmentId: 'hotel' }),
    getDepartmentShiftCacheKey({ tenantId: 't2', departmentId: 'hotel' })
  );
});
