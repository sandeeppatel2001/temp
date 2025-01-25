const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: () => {
        return new Date()
          .toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })
          .replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$2-$1");
      },
    }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "./error.log", level: "error" }),
    new winston.transports.File({ filename: "./combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

module.exports = logger;
