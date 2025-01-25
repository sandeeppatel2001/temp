const express = require("express");
const router = express.Router();
const { redis } = require("../services/queueService");
const logger = require("../config/logger");

router.get("/progress/:videoId", (req, res) => {
  const progress = progressTracker.get(req.params.videoId) || 0;
  res.json({ progress });
});

router.get("/status/:videoId", async (req, res) => {
  try {
    const status = await redis.get(`video:${videoId}:status`);
    res.json({ status: status || "not_found" });
  } catch (error) {
    logger.error("Status check failed:", error);
    res.status(500).json({ error: "Status check failed" });
  }
});

router.get("/checkpid", (req, res) => {
  res.json({ pid: process.pid });
});

module.exports = router;
