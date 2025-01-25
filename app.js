const express = require("express");
const cors = require("cors");
const cluster = require("cluster");
const numCPUs = require("os").cpus().length;
const config = require("./config");
const logger = require("./config/logger");

const { router } = require("./routes/videoRoutes");
const videoRoutes = router;
const { router: reelsRoutes } = require("./routes/reels/reelsRoutes");
const statusRoutes = require("./routes/statusRoutes");
const securityHeaders = require("./middleware/security");
const errorHandler = require("./middleware/errorHandler");
const memoryMonitor = require("./utils/memoryMonitor");
const connectDB = require("./mongodb/mongoconnection");
const { videoQueue, redis } = require("./services/queueService");
const authRoutes = require("./routes/authRoutes");
const updateVideoStatus = require("./routes/updateVideoStatus");
const interactionRoutes = require("./routes/interaction");
const reelsinteractionRoutes = require("./routes/reels/reelinteraction");
const sendOtp = require("./routes/otp/sendotp");
console.log("Starting server initialization...");
const path = require("path");
// Add process error handlers
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  logger.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
const app = express();
if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  logger.info(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < 1; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    logger.info(`Worker ${worker.process.pid} died`);
    // Replace the dead worker
    cluster.fork();
  });

  // Keep the master process running
  process.stdin.resume();
} else {
  // Test Redis connection
  redis.on("connect", () => {
    console.log(`Worker ${process.pid}: Redis connected successfully`);
  });

  redis.on("error", (err) => {
    console.error(`Worker ${process.pid}: Redis connection error:`, err);
  });

  // Connect to MongoDB with explicit success/error logging
  console.log(`Worker ${process.pid}: Attempting to connect to MongoDB...`);
  connectDB()
    .then(() => {
      console.log(`Worker ${process.pid}: MongoDB connected successfully`);
      startServer();
    })
    .catch((error) => {
      console.error(`Worker ${process.pid}: MongoDB connection error:`, error);
      // Continue with server startup even if MongoDB fails
      startServer();
    });

  function startServer() {
    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(securityHeaders);

    // Routes
    app.use("/api/videos", videoRoutes);
    app.use("/api/status", statusRoutes);
    app.use("/api/updatevisibility", updateVideoStatus);
    app.use("/api/auth", authRoutes);
    app.use("/", express.static(path.join(__dirname, "../client/build")));
    // all reels routes
    app.use("/api/reels", reelsRoutes);
    app.use("/api/interactions", interactionRoutes);
    app.use("/api/reelsinteractions", reelsinteractionRoutes);
    app.use("/api/otp", sendOtp);
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../client/build", "index.html"));
    });
    // Error handling
    app.use(errorHandler);

    // Monitor memory usage on queue processing
    videoQueue.on("active", memoryMonitor);

    // Add a basic health check route
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "OK",
        timestamp: new Date(),
        pid: process.pid,
      });
    });

    // Start server with error handling
    const server = app
      .listen(config.app.port, config.app.host, () => {
        console.log(`Worker ${process.pid} started on port ${config.app.port}`);
        logger.info(`Worker ${process.pid} started on port ${config.app.port}`);
      })
      .on("error", (error) => {
        console.error(`Worker ${process.pid}: Server failed to start:`, error);
        logger.error(`Worker ${process.pid}: Server failed to start:`, error);
      });

    // Handle server shutdown gracefully
    process.on("SIGTERM", () => {
      console.log(
        `Worker ${process.pid}: SIGTERM received. Shutting down gracefully...`
      );
      server.close(() => {
        console.log(`Worker ${process.pid}: Server closed`);
        process.exit(0);
      });
    });
  }
}

module.exports = app;
