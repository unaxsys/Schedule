const APP_CONFIG = {
  port: Number(process.env.PORT || 4000),
  jwtExpiresIn: String(process.env.JWT_EXPIRES_IN || '12h').trim(),
  loginTokenExpiresIn: String(process.env.LOGIN_TOKEN_EXPIRES_IN || '5m').trim(),
};

module.exports = { APP_CONFIG };
