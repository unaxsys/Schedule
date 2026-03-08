const { createHolidayService } = require('../holidayService');

function createTenantHolidayService(pool) {
  return createHolidayService(pool);
}

module.exports = { createTenantHolidayService };
