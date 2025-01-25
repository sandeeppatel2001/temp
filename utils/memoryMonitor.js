const logger = require("../config/logger");

function monitorMemory() {
  const used = process.memoryUsage();
  logger.info({
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
  });
}

module.exports = monitorMemory;
