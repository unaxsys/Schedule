function cleanStr(v) {
  return String(v ?? '').trim();
}

function isValidUuid(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  cleanStr,
  isValidUuid,
  createHttpError,
};
