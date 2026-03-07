async function findUserByEmail(pool, email) {
  return pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
}

module.exports = {
  findUserByEmail,
};
