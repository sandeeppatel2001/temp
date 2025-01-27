const ffmpeg = require("../config/ffmpeg");
const path = require("path");
const fs = require("fs").promises;
const logger = require("../config/logger");
const { uploadChunkToS3 } = require("./s3Upload");
const os = require("os");

async function processFileToHLS(inputPath, videoId, quality, metadata) {
  console.log("processFileToHLS----------------", quality, inputPath);
  const outputDir = path.join(
    __dirname,
    "../tempvideos",
    videoId,
    quality.resolution
  );
  await fs.mkdir(outputDir, { recursive: true });

  // Calculate optimal bitrate based on resolution and source
  const targetBitrate = Math.min(
    parseInt(quality.bitrate),
    Math.round(
      metadata.video.bitrate ||
        800000 * (quality.height / metadata.video.height)
    )
  );

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .size(`?x${quality.height}`)
      .videoBitrate(targetBitrate)
      .audioBitrate(Math.min(192, metadata.audio?.bitrate || 192) + "k")
      .format("hls")
      .addOptions([
        "-y", // Overwrite output files
        "-hide_banner", // Hide FFmpeg compilation info
        "-threads 0", // Use optimal number of threads
        "-movflags +faststart", // Enable fast start for web playback
        "-strict experimental", // Allow experimental codecs
        "-err_detect ignore_err", // Continue on errors when possible
        "-sn", // Add this line to disable subtitle processing
      ])
      .outputOptions([
        "-hls_time 10",
        "-hls_list_size 0",
        "-hls_segment_type mpegts",
        "-hls_segment_filename",
        `${outputDir}/segment%d.ts`,
        "-hls_flags delete_segments",
        "-start_number 0",
        "-g " + Math.round((metadata.video.fps || 24) * 2), // GOP size = 2 seconds
        "-sc_threshold 0",
        "-b_strategy 0",
        "-preset ultrafast", // Changed from fast to ultrafast for better compatibility
        "-profile:v baseline", // Changed from main to baseline for better compatibility
        "-level:v 3.0",
        "-max_muxing_queue_size 2048",
        // "-pix_fmt yuv420p", // Ensure pixel format compatibility
      ])
      .on("start", (commandLine) => {
        logger.info(`FFmpeg started with command: ${commandLine}`);
      })
      .on("progress", (progress) => {
        console.log("Processing: ", quality.resolution, progress.percent, "%");
        logger.info(
          `Processing ${quality.resolution}: ${progress.percent}% done`
        );
      })
      .on("end", async () => {
        try {
          const files = await fs.readdir(outputDir);
          for (const file of files) {
            const fileBuffer = await fs.readFile(path.join(outputDir, file));
            await uploadChunkToS3(
              process.env.AWS_BUCKET1,
              `videos/${videoId}/${quality.resolution}/${file}`,
              fileBuffer
            );
          }
          await fs.rm(outputDir, { recursive: true, force: true });
          resolve();
        } catch (error) {
          logger.error("Error in end handler:", error);
          reject(error);
        }
      })
      .on("error", (err, stdout, stderr) => {
        logger.error("FFmpeg error:", {
          error: err.message,
          stdout,
          stderr,
        });
        reject(err);
      })
      .save(`${outputDir}/playlist.m3u8`);
  });
}

async function processBufferToHLS(buffer, videoId, quality) {
  const outputDir = path.join(os.tmpdir(), videoId, quality.resolution);
  await fs.mkdir(outputDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const inputStream = require("stream").Readable.from(buffer);

    ffmpeg()
      .input(inputStream)
      .inputFormat("mp4")
      .videoCodec("libx264")
      .audioCodec("aac")
      .size(`?x${quality.height}`)
      .videoBitrate(quality.bitrate)
      .format("hls")
      .addOptions([
        "-y",
        "-hide_banner",
        "-threads 0",
        "-movflags +faststart",
        "-strict experimental",
        "-err_detect ignore_err",
      ])
      .outputOptions([
        "-hls_time 10",
        "-hls_list_size 0",
        "-hls_segment_type mpegts",
        "-hls_segment_filename",
        `${outputDir}/segment%d.ts`,
        "-preset ultrafast",
        "-profile:v baseline",
        "-level:v 3.0",
        "-pix_fmt yuv420p",
      ])
      .on("end", async () => {
        try {
          const files = await fs.readdir(outputDir);
          for (const file of files) {
            const fileBuffer = await fs.readFile(path.join(outputDir, file));
            await uploadChunkToS3(
              process.env.AWS_BUCKET1,
              `videos/${videoId}/${quality.resolution}/${file}`,
              fileBuffer
            );
          }
          await fs.rm(outputDir, { recursive: true, force: true });
          resolve();
        } catch (error) {
          logger.error("Error in buffer processing:", error);
          reject(error);
        }
      })
      .on("error", (err, stdout, stderr) => {
        logger.error("FFmpeg buffer processing error:", {
          error: err.message,
          stdout,
          stderr,
        });
        reject(err);
      })
      .save(`${outputDir}/playlist.m3u8`);
  });
}

module.exports = {
  processFileToHLS,
  processBufferToHLS,
};
