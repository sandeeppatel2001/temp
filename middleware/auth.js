const jwt = require("jsonwebtoken");
const { redis } = require("../services/queueService");
const logger = require("../config/logger");
const mongoose = require("mongoose");
const auth = async (req, res, next) => {
  try {
    // req.user = {
    //   _id: new mongoose.Types.ObjectId("666666666666666666666666"), // convert string to MongoDB ObjectId
    //   username: "test",
    //   mobile: "1234567890",
    // };
    // return next();
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      console.log("No token, authorization denied");
      return res
        .status(401)
        .json({ error: false, message: "No token, authorization denied" });
    }

    const userSession = await redis.get(`session:${token}`);
    if (!userSession) {
      console.log("Session expired or invalid");
      return res
        .status(401)
        .json({ error: false, message: "Session expired or invalid" });
    }

    req.user = JSON.parse(userSession);
    console.log("user", req.user);
    // await redis.expire(`session:${token}`, 24 * 60 * 60); // Extend session duration
    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    res.status(500).json({ error: true, message: "Server error" });
  }
};

module.exports = auth;
