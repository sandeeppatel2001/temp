const Bull = require("bull");
const Redis = require("ioredis");
const config = require("../config");
const logger = require("../config/logger");
const { processBufferToHLS } = require("./videoProcessing");
const videoIdModel = require("../mongodb/models/videomodel");
const { videoQualities } = require("../routes/videoRoutes");
console.log("redis=======", config.redis);

// Configure Redis with memory management settings
const redisConfig = {
  ...config.redis,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false,
  // maxmemory: "2gb", // Set maximum memory limit
  // maxmemory_policy: "allkeys-lru", // Least Recently Used eviction policy
};

const redis = new Redis(redisConfig);

// Create a new Bull queue with optimized settings
const videoQueue = new Bull("video-processing", {
  redis: redisConfig,
  limiter: {
    max: 2, // Reduce concurrent jobs
    duration: 2000, // Increase duration between jobs
  },
  settings: {
    lockDuration: 300000, // 5 minutes
    stalledInterval: 30000, // 30 seconds
    maxStalledCount: 2,
  },
});

// Handle queue events
videoQueue.on("error", (error) => {
  logger.error("Queue error:", error);
});

videoQueue.on("failed", (job, error) => {
  logger.error(`Job ${job.id} failed:`, error);
});

videoQueue.on("stalled", (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

// Process queue with chunking for large files
videoQueue.process(async (job) => {
  const { videoId, videoBuffer } = job.data;
  logger.info("Processing video in queue", { videoId });

  try {
    await redis.set(`video:${videoId}:status`, "processing");
    // await Promise.all(
    //   videoQualities.map((quality) =>
    //     processBufferToHLS(videoBuffer, videoId, quality)
    //   )
    // );
    // Process video qualities sequentially instead of parallel
    for (const quality of videoQualities) {
      await processBufferToHLS(videoBuffer, videoId, quality);
      // Clear some Redis memory after each quality processing
      await redis.del(`video:${videoId}:processing:${quality.resolution}`);
    }
    // const metadata = await VideoMetaData(videoBuffer);
    // console.log("metadata", metadata);

    await redis.set(`video:${videoId}:status`, "completed");
    await videoIdModel.create({ videoId });

    // Clean up any temporary data
    const keys = await redis.keys(`video:${videoId}:processing:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    return { success: true, videoId };
  } catch (error) {
    logger.error("Video processing failed:", error);
    await redis.set(`video:${videoId}:status`, "failed");

    // Clean up on error
    const keys = await redis.keys(`video:${videoId}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    throw error;
  }
});

// Add queue cleanup on shutdown
process.on("SIGTERM", async () => {
  await videoQueue.close();
  await redis.quit();
});

module.exports = {
  videoQueue,
  redis,
};
