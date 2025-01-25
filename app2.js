const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs").promises;
const exists = require("fs").exists;
const cors = require("cors");
const crypto = require("crypto");
const Bull = require("bull");
const AWS = require("aws-sdk");
const Redis = require("ioredis");
const cluster = require("cluster");
const numCPUs = require("os").cpus().length;
const winston = require("winston");
const dotenv = require("dotenv");
const connectDB = require("./mongodb/mongoconnection");
dotenv.config({ path: "../.env" });
connectDB();
const videoIdModel = require("./mongodb/models/videomodel");
const os = require("os");
const { PassThrough } = require("stream");

// Configuration and Environment Variables
const config = {
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
    key: process.env.ENCRYPTION_KEY || crypto.randomBytes(16),
    iv: process.env.ENCRYPTION_IV || crypto.randomBytes(16),
  },
  app: {
    port: process.env.PORT || 3001,
  },
};

// Initialize Services
const redis = new Redis(config.redis);
const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKey,
  secretAccessKey: config.aws.secretKey,
});

// Setup Logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Video Processing Queue
const videoQueue = new Bull("video-processing", {
  redis: config.redis,
  limiter: {
    max: 5, // Process max 5 jobs at once
    duration: 1000,
  },
});

// Video quality configurations
const videoQualities = [
  { resolution: "144p", height: 144, bitrate: "400k" },
  { resolution: "240p", height: 240, bitrate: "800k" },
  { resolution: "360p", height: 360, bitrate: "1000k" },
  { resolution: "480p", height: 480, bitrate: "1500k" },
  { resolution: "720p", height: 720, bitrate: "2500k" },
  { resolution: "1080p", height: 1080, bitrate: "4000k" },
];
let app;
if (cluster.isMaster) {
  // Master process
  logger.info(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < 1; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.info(`Worker ${worker.process.pid} died`);
    // Replace the dead worker
    cluster.fork();
  });
} else {
  // Worker process
  app = express();
  app.use(cors());
  app.use(express.json());

  // Middleware for security headers
  app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "media-src 'self' blob:;");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  // Configure multer for S3
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 1000 * 1024 * 1024, // 100MB limit
    },
  });

  // Helper function to upload to S3
  async function uploadToS3(bucket, buffer, key) {
    console.log("inside uploadToS3 function");
    return s3
      .upload({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentEncryption: "AES256",
      })
      .promise();
  }

  // Helper function to process buffer directly to HLS
  async function processBufferToHLS(buffer, videoId, quality) {
    const outputDir = path.join(os.tmpdir(), videoId, quality.resolution);
    await fs.mkdir(outputDir, { recursive: true });
    console.log("inside processBufferToHLS function");
    console.log("outputDir", outputDir);
    return new Promise((resolve, reject) => {
      // Create a temporary input stream from buffer
      const inputStream = require("stream").Readable.from(buffer);
      console.log("inside processBufferToHLS function");
      ffmpeg()
        .input(inputStream)
        .inputFormat("mp4") // Specify input format since we're using buffer
        .size(`?x${quality.height}`)
        .videoBitrate(quality.bitrate)
        .format("hls")
        .outputOptions([
          "-hls_time 10",
          "-hls_list_size 0",
          "-hls_segment_type mpegts",
          "-hls_segment_filename",
          `${outputDir}/segment%d.ts`,
          `-hls_key_info_file ${outputDir}/enc.keyinfo`,
        ])
        .on("start", (commandLine) => {
          logger.info(`Started FFmpeg with command: ${commandLine}`);
        })
        .on("progress", (progress) => {
          logger.info(
            `Processing ${quality.resolution}: ${progress.percent}% done`
          );
        })
        .on("end", async () => {
          try {
            // Upload processed segments to S3
            const files = await fs.readdir(outputDir);
            for (const file of files) {
              const fileBuffer = await fs.readFile(path.join(outputDir, file));
              await uploadToS3(
                process.env.AWS_BUCKET1,
                fileBuffer,
                `videos/${videoId}/${quality.resolution}/${file}`
              );
            }

            // Cleanup temporary directory
            await fs.rm(outputDir, { recursive: true, force: true });
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on("error", (err) => {
          logger.error(`FFmpeg error: ${err.message}`);
          reject(err);
        })
        .save(`${outputDir}/playlist.m3u8`);
    });
  }

  // Memory management configuration
  const MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 100MB threshold

  // Hybrid approach based on file size
  async function processVideo(videoId, buffer, quality) {
    if (buffer.length > MAX_BUFFER_SIZE) {
      // Use file-based approach for large files
      const tempPath = path.join(os.tmpdir(), `${videoId}_input.mp4`);
      await fs.writeFile(tempPath, buffer);
      try {
        await processFileToHLS(tempPath, videoId, quality);
      } finally {
        await fs.unlink(tempPath);
      }
    } else {
      // Use buffer-based approach for smaller files
      await processBufferToHLS(buffer, videoId, quality);
    }
  }

  // Updated queue processor
  videoQueue.process(async (job) => {
    const { videoId, videoBuffer } = job.data;
    console.log("inside videoQueue.process");
    try {
      await redis.set(`video:${videoId}:status`, "processing");

      // Process all quality variants using the buffer directly
      await Promise.all(
        videoQualities.map(
          (quality) => processBufferToHLS(videoBuffer, videoId, quality)
          // processVideo(videoId, videoBuffer, quality)
        )
      );

      await redis.set(`video:${videoId}:status`, "completed");
      //  save videoid in mongodb
      await videoIdModel.create({ videoId });
      return { success: true, videoId };
    } catch (error) {
      logger.error("Video processing failed:", error);
      await redis.set(`video:${videoId}:status`, "failed");
      throw error;
    }
  });
  app.get("/checkpid", (req, res) => {
    res.json({ pid: process.pid });
  });
  async function createThumbnailFromBuffer(thumbnailBuffer, videoId) {
    return new Promise((resolve, reject) => {
      console.log("inside createThumbnailFromBuffer function");
      let outputBuffer = Buffer.alloc(0);
      const inputStream = new PassThrough();

      ffmpeg()
        .input(inputStream)
        .inputFormat("mp4") // Generic input format
        .inputOptions(["-ignore_unknown", "-err_detect ignore_err"])
        .outputOptions([
          "-frames:v 1",
          "-an",
          "-vf",
          "scale=480:270:force_original_aspect_ratio=decrease",
          "-q:v 2",
          "-preset",
          "fast",
          "-y",
        ])
        .format("image2")
        .on("error", (err) => {
          logger.error(
            `Thumbnail generation error for videoId ${videoId}. Attempting fallback...`,
            err.message
          );
          // Try fallback immediately
          createThumbnailFallback(thumbnailBuffer, videoId, resolve, reject);
        })
        .on("start", (cmd) => {
          logger.info(`Starting thumbnail generation for videoId ${videoId}`);
          logger.debug(`FFmpeg command: ${cmd}`);
        })
        .stream()
        .on("data", (chunk) => {
          outputBuffer = Buffer.concat([outputBuffer, chunk]);
        })
        .on("end", async () => {
          try {
            if (!outputBuffer.length) {
              throw new Error("Generated thumbnail is empty");
            }

            const s3Response = await uploadToS3(
              process.env.AWS_BUCKET2,
              outputBuffer,
              `videos/${videoId}/thumbnail.jpg`
            );

            const thumbnailUrl = s3Response.Location;
            logger.info(
              `Thumbnail uploaded successfully for videoId ${videoId}: ${thumbnailUrl}`
            );
            resolve(thumbnailUrl);
          } catch (error) {
            logger.error(
              `Thumbnail processing failed for videoId ${videoId}: ${error.message}`
            );
            // Try fallback if main process fails
            createThumbnailFallback(thumbnailBuffer, videoId, resolve, reject);
          }
        });

      inputStream.end(thumbnailBuffer);
    });
  }

  // Updated fallback function with similar settings
  function createThumbnailFallback(thumbnailBuffer, videoId, resolve, reject) {
    let outputBuffer = Buffer.alloc(0);
    const inputStream = new PassThrough();

    ffmpeg()
      .input(inputStream)
      .videoCodec("libx264")
      .inputOptions(["-f", "h264", "-i_qfactor", "1.0", "-qdiff", "4"])
      .outputOptions([
        "-vframes",
        "1",
        "-an",
        "-vf",
        "scale=480:270",
        "-q:v 2",
        "-preset",
        "ultrafast", // Try ultrafast preset
        "-y",
      ])
      .format("mjpeg") // Try different output format
      .on("error", (err) => {
        logger.error(
          `Fallback thumbnail generation failed for videoId ${videoId}: ${err.message}`
        );
        reject(err);
      })
      .stream()
      .on("data", (chunk) => {
        outputBuffer = Buffer.concat([outputBuffer, chunk]);
      })
      .on("end", async () => {
        try {
          if (!outputBuffer.length) {
            throw new Error("Fallback generated thumbnail is empty");
          }

          const s3Response = await uploadToS3(
            process.env.AWS_BUCKET2,
            outputBuffer,
            `videos/${videoId}/thumbnail.jpg`
          );

          const thumbnailUrl = s3Response.Location;
          logger.info(
            `Fallback thumbnail uploaded successfully for videoId ${videoId}: ${thumbnailUrl}`
          );
          resolve(thumbnailUrl);
        } catch (error) {
          logger.error(
            `Final fallback attempt failed for videoId ${videoId}: ${error.message}`
          );
          reject(error);
        }
      });

    inputStream.end(thumbnailBuffer);
  }

  // Updated upload endpoint
  app.post("/upload", upload.single("video"), async (req, res) => {
    try {
      console.log("pid", process.pid);
      // Validate file type and buffer
      if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
        throw new Error("Invalid upload: No file or empty buffer received");
      }

      if (!req.file.mimetype.startsWith("video/")) {
        throw new Error("Invalid file type. Only video files are allowed.");
      }

      const videoId = crypto.randomUUID();

      // Create a buffer for thumbnail generation - increased size
      const THUMBNAIL_BUFFER_SIZE = 20 * 1024 * 1024; // Increased to 20MB
      // const thumbnailBuffer = Buffer.from(
      //   req.file.buffer.slice(
      //     0,
      //     Math.min(THUMBNAIL_BUFFER_SIZE, req.file.buffer.length)
      //   )
      // );
      const thumbnailBuffer = req.file.buffer;

      // Run thumbnail generation with better error handling
      try {
        const thumbnailUrl = await createThumbnailFromBuffer(
          thumbnailBuffer,
          videoId
        );
        console.log("Thumbnail generated:", thumbnailUrl);

        // Update MongoDB with thumbnail URL
        await videoIdModel.findOneAndUpdate(
          { videoId },
          { thumbnailUrl },
          { upsert: true }
        );
      } catch (thumbnailError) {
        logger.error(
          `Thumbnail generation failed for videoId ${videoId}:`,
          thumbnailError
        );
        // Continue with video processing even if thumbnail fails
      }

      // Save initial data to MongoDB without thumbnail
      await videoIdModel.create({
        videoId,
        status: "processing",
      });

      // Process the video immediately without waiting for thumbnail
      if (req.file.buffer.length > MAX_BUFFER_SIZE) {
        console.log("Processing large file");

        const tempDir = path.join(__dirname, "tempvideos", videoId, "original");
        await fs.mkdir(tempDir, { recursive: true });

        const tempPath = path.join(tempDir, "input.mp4");
        await fs.writeFile(tempPath, req.file.buffer);

        try {
          // Validate video file before processing
          await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempPath, (err, metadata) => {
              if (err) {
                reject(new Error("Invalid video file"));
                return;
              }
              if (
                !metadata.streams.some(
                  (stream) => stream.codec_type === "video"
                )
              ) {
                reject(new Error("No video stream found"));
                return;
              }
              resolve();
            });
          });

          await redis.set(`video:${videoId}:status`, "processing");

          // Process one quality at a time to avoid memory issues
          // for (const quality of videoQualities) {
          //   await processFileToHLS(tempPath, videoId, quality);
          // }
          await Promise.all(
            videoQualities.map((quality) =>
              processFileToHLS(tempPath, videoId, quality)
            )
          );

          await redis.set(`video:${videoId}:status`, "completed");
        } catch (error) {
          await redis.set(`video:${videoId}:status`, "failed");
          throw error;
        } finally {
          // Cleanup
          try {
            await fs.rm(path.join(__dirname, "tempvideos", videoId), {
              recursive: true,
              force: true,
            });
          } catch (cleanupError) {
            logger.error(`Cleanup error: ${cleanupError.message}`);
          }
        }
      } else {
        // For smaller files: Use queue
        console.log("inside small file");
        logger.info("Processing small file");
        await videoQueue.add(
          {
            videoId,
            videoBuffer: req.file.buffer,
          },
          {
            removeOnComplete: true,
            attempts: 3,
          }
        );
        logger.info("Added video to queue");
      }
      //  save videoid in mongodb
      await videoIdModel.create({ videoId });
      res.json({
        success: true,
        videoId,
        status: "processing",
      });
    } catch (error) {
      logger.error("Upload failed:", error);
      res.status(500).json({
        error: "Upload failed",
        details: error.message,
      });
    }
  });

  // First, set the FFmpeg path explicitly
  const ffmpeg = require("fluent-ffmpeg");
  const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
  const ffprobePath = require("@ffprobe-installer/ffprobe").path;

  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);

  // Updated processFileToHLS function with better error handling
  async function processFileToHLS(inputPath, videoId, quality) {
    const outputDir = path.join(
      __dirname,
      "tempvideos",
      videoId,
      quality.resolution
    );
    await fs.mkdir(outputDir, { recursive: true });

    // First verify the input file
    try {
      await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) {
            logger.error(`FFprobe error: ${err.message}`);
            reject(err);
            return;
          }
          logger.info(
            `Input file metadata: ${JSON.stringify(metadata.format)}`
          );
          resolve(metadata);
        });
      });
    } catch (error) {
      logger.error(`File validation failed: ${error.message}`);
      throw error;
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264") // Specify video codec
        .audioCodec("aac") // Specify audio codec
        .size(`?x${quality.height}`)
        .videoBitrate(quality.bitrate)
        .format("hls")
        .outputOptions([
          "-hls_time 10",
          "-hls_list_size 0",
          "-hls_segment_type mpegts",
          "-hls_segment_filename",
          `${outputDir}/segment%d.ts`,
          "-hls_flags delete_segments", // Clean up segments
          "-start_number 0",
          "-g 30", // GOP size
          "-sc_threshold 0", // Disable scene change detection
          "-b_strategy 0", // Fast encoding
          "-preset fast", // Encoding preset
          "-profile:v main", // H.264 profile
          "-level:v 3.1", // H.264 level
          "-max_muxing_queue_size 1024", // Prevent muxing queue errors
        ])
        .on("start", (commandLine) => {
          logger.info(`FFmpeg started with command: ${commandLine}`);
        })
        .on("progress", (progress) => {
          logger.info(
            `Processing ${quality.resolution}: ${progress.percent}% done`
          );
          logger.info(`Processing details: ${JSON.stringify(progress)}`);
        })
        .on("end", async () => {
          try {
            logger.info(
              `FFmpeg processing completed for ${quality.resolution}`
            );

            // Verify output files exist
            const files = await fs.readdir(outputDir);
            logger.info(`Generated files: ${files.join(", ")}`);

            // Upload processed segments to S3
            for (const file of files) {
              const fileBuffer = await fs.readFile(path.join(outputDir, file));
              await uploadToS3(
                process.env.AWS_BUCKET1,
                fileBuffer,
                `videos/${videoId}/${quality.resolution}/${file}`
              );
            }

            // Cleanup temporary directory
            await fs.rm(outputDir, { recursive: true, force: true });
            resolve();
          } catch (error) {
            logger.error(`Post-processing error: ${error.message}`);
            reject(error);
          }
        })
        .on("error", (err, stdout, stderr) => {
          logger.error(`FFmpeg error: ${err.message}`);
          logger.error(`FFmpeg stdout: ${stdout}`);
          logger.error(`FFmpeg stderr: ${stderr}`);
          reject(err);
        })
        .save(`${outputDir}/playlist.m3u8`);
    });
  }

  // Optional: Add progress tracking
  const progressTracker = new Map();

  videoQueue.on("progress", (job, progress) => {
    progressTracker.set(job.data.videoId, progress);
  });

  // Add progress endpoint
  app.get("/progress/:videoId", (req, res) => {
    const progress = progressTracker.get(req.params.videoId) || 0;
    res.json({ progress });
  });

  // Status check endpoint
  app.get("/status/:videoId", async (req, res) => {
    try {
      const status = await redis.get(`video:${videoId}:status`);
      res.json({ status: status || "not_found" });
    } catch (error) {
      logger.error("Status check failed:", error);
      res.status(500).json({ error: "Status check failed" });
    }
  });

  // HLS streaming endpoint
  app.get("/hls/:videoId/:quality/:file", async (req, res) => {
    try {
      const { videoId, quality, file } = req.params;
      const key = `videos/${videoId}/${quality}/${file}`;

      // Check if file exists in S3
      const fileStream = s3
        .getObject({
          Bucket: process.env.AWS_BUCKET1,
          Key: key,
        })
        .createReadStream();
      // console.log("fileStream", fileStream);
      // Set appropriate headers
      res.setHeader(
        "Content-Type",
        file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T"
      );

      fileStream.pipe(res);
    } catch (error) {
      logger.error("Streaming failed:", error);
      res.status(404).json({ error: "File not found" });
    }
  });
  app.get("/getvideoId", async (req, res) => {
    console.log("getvideoId get request");
    const videoId = await videoIdModel.find().limit(100);
    console.log("videoId", videoId);
    res.send(videoId);
  });
  // Error handling middleware
  app.use((error, req, res, next) => {
    logger.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  // Add memory monitoring
  const monitorMemory = () => {
    const used = process.memoryUsage();
    logger.info({
      rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    });
  };

  videoQueue.on("active", monitorMemory);

  // Start server
  app.listen(config.app.port, () => {
    logger.info(`Worker ${process.pid} started on port ${config.app.port}`);
  });
}
module.exports = app;
