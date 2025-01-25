const mongoose = require("mongoose");
const logger = require("../config/logger");
const config = require("../config");
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongo.url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
