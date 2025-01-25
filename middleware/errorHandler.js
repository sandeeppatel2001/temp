const logger = require("../config/logger");

function errorHandler(error, req, res, next) {
  logger.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
}

module.exports = errorHandler;
