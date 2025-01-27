const ffmpeg = require("fluent-ffmpeg");
const { PassThrough } = require("stream");
const logger = require("../config/logger");
const { uploadChunkToS3 } = require("./s3Upload");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

async function createThumbnailFromBuffer(buffer, videoId, type) {
  if (!buffer) {
    throw new Error("Video buffer is required");
  }

  // Create temporary file for the video segment
  const tempDir = path.join(os.tmpdir(), "video-thumbnails");
  await fs.mkdir(tempDir, { recursive: true });
  const tempVideoPath = path.join(tempDir, `${videoId}-temp.mp4`);
  const tempThumbPath = path.join(tempDir, `${videoId}-thumb.jpg`);

  try {
    // Write buffer to temporary file
    await fs.writeFile(tempVideoPath, buffer);

    return new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .screenshots({
          timestamps: type === "reel" ? ["00:00:03"] : ["00:00:07"],
          filename: path.basename(tempThumbPath),
          folder: path.dirname(tempThumbPath),
        })
        .on("end", async () => {
          try {
            const thumbBuffer = await fs.readFile(tempThumbPath);
            const s3Response = await uploadChunkToS3(
              process.env.AWS_BUCKET2,
              `videos/${videoId}/thumbnail.jpg`,
              thumbBuffer
            );

            // Cleanup temporary files
            await fs.unlink(tempVideoPath);
            await fs.unlink(tempThumbPath);

            resolve(s3Response.Location);
          } catch (error) {
            reject(error);
          }
        })
        .on("error", (err) => {
          logger.error("FFmpeg thumbnail error:", err);
          reject(err);
        });
    });
  } catch (error) {
    console.log("error", error);
    logger.error("Thumbnail generation error:", error);
    throw error;
  }
}

module.exports = {
  createThumbnailFromBuffer,
};
