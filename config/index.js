const dotenv = require("dotenv");
dotenv.config({ path: "../.env" });
// console.log("from config=======", process.env);
module.exports = {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
  },
  aws: {
    bucket: process.env.AWS_BUCKET,
    region: process.env.AWS_REGION,
    accessKey: process.env.AWS_ACCESS_KEY,
    secretKey: process.env.AWS_SECRET_KEY,
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
    iv: process.env.ENCRYPTION_IV,
  },
  app: {
    host: process.env.SERVER_HOST || "localhost",
    port: process.env.PORT || 3001,
  },
  mongo: {
    url: process.env.MONGO_URI,
  },
};
