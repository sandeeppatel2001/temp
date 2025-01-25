function securityHeaders(req, res, next) {
  res.setHeader("Content-Security-Policy", "media-src 'self' blob:;");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

module.exports = securityHeaders;
