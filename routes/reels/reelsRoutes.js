const express = require("express");
const router = express.Router();
const { upload } = require("../../middleware/upload");
const { videoQueue, redis } = require("../../services/queueService");
const {
  createThumbnailFromBuffer,
} = require("../../services/thumbnailGenerator");
const { processFileToHLS } = require("../../services/videoProcessing");
function determineTargetQualities(sourceHeight) {
  const qualityLevels = [
    { resolution: "144p", height: 144, bitrate: "400k" },
    { resolution: "240p", height: 240, bitrate: "800k" },
    { resolution: "360p", height: 360, bitrate: "1000k" },
    { resolution: "480p", height: 480, bitrate: "1500k" },
    { resolution: "720p", height: 720, bitrate: "2500k" },
    { resolution: "1080p", height: 1080, bitrate: "4000k" },
  ];

  // Only process qualities up to the source resolution
  return qualityLevels.filter((quality) => quality.height <= sourceHeight);
}
const ReelsDescriptionModel = require("../../mongodb/models/reels/description");
const ReelsvideoIdModel = require("../../mongodb/models/reels/reels");
const logger = require("../../config/logger");
const { s3 } = require("../../services/s3Upload");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs").promises;
const auth = require("../../middleware/auth");
const { VideoMetaData } = require("../../services/VideoMetaData");
const MAX_BUFFER_SIZE = 0.01 * 1024 * 1024; // for redis db
// add auth middleware
// router.post("/uploadreels", auth, upload.single("video"), async (req, res) => {
//   try {
//     if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
//       throw new Error("Invalid upload: No file or empty buffer received");
//     }

//     if (!req.file.mimetype.startsWith("video/")) {
//       throw new Error("Invalid file type. Only video files are allowed.");
//     }
//     // take all the data from req.body
//     const { title, description } = req.body;
//     console.log("title=======>", title);
//     console.log("description=======>", description);
//     // take user id from req.user
//     const userId = req.user._id;
//     const username = req.user.username;
//     const videoId = crypto.randomUUID();
//     const thumbnailBuffer = req.file.buffer;
//     let thumbnailUrl = "";
//     try {
//       thumbnailUrl = await createThumbnailFromBuffer(thumbnailBuffer, videoId);
//     } catch (thumbnailError) {
//       logger.error(
//         `Thumbnail generation failed for videoId ${videoId}:`,
//         thumbnailError
//       );
//     }

//     // save all details in database

//     if (req.file.buffer.length > MAX_BUFFER_SIZE) {
//       // Process large files
//       console.log("processing long file");
//       const tempDir = path.join(
//         __dirname,
//         "../tempvideos",
//         videoId,
//         "original"
//       );
//       await fs.mkdir(tempDir, { recursive: true });
//       const tempPath = path.join(tempDir, "input.mp4");
//       await fs.writeFile(tempPath, req.file.buffer);

//       try {
//         const metadata = await VideoMetaData(tempPath);

//         // Store metadata in database if already not present then save else update
//         // const result = await ReelsMetadataModel.findOneAndUpdate(
//         //   { videoId },
//         //   {
//         //     $set: {
//         //       description: description,
//         //       username: username,
//         //       userId: userId,
//         //       description: description,
//         //       metadata: {
//         //         duration: metadata.duration,
//         //         resolution: `${metadata.video.width}x${metadata.video.height}`,
//         //         fps: metadata.video.fps,
//         //         originalBitrate: metadata.video.bitrate,
//         //         fileSize: metadata.size,
//         //       },
//         //     },
//         //   },
//         //   { upsert: true }
//         // );
//         // console.log("metadata saved in database", result);

//         await redis.set(`video:${videoId}:status`, "processing");

//         // Determine appropriate quality levels
//         const targetQualities = determineTargetQualities(metadata.video.height);
//         await ReelsvideoIdModel.create({
//           videoId,
//           userId,
//           username,
//           title,
//           maxQuality: targetQualities.length,
//           description: description,
//         });
//         // await ReelsDescriptionModel.create({
//         //   videoId,
//         //   description,
//         // });
//         await Promise.all(
//           targetQualities.map((quality) =>
//             processFileToHLS(tempPath, videoId, quality, metadata)
//           )
//         );
//         console.log("all qualities processed");
//         await redis.set(`video:${videoId}:status`, "completed");
//       } catch (error) {
//         await redis.set(`video:${videoId}:status`, "failed");
//         throw error;
//       } finally {
//         await fs.rm(path.join(__dirname, "../tempvideos", videoId), {
//           recursive: true,
//           force: true,
//         });
//       }
//     } else {
//       // Process small files using queue
//       await videoQueue.add(
//         {
//           videoId,
//           videoBuffer: req.file.buffer,
//         },
//         {
//           removeOnComplete: true,
//           attempts: 3,
//         }
//       );
//     }

//     res.json({
//       success: true,
//       videoId,
//       status: "processing",
//     });
//   } catch (error) {
//     logger.error("Upload failed:", error);
//     res.status(500).json({
//       error: "Upload failed",
//       details: error.message,
//     });
//   }
// });

// router.get("/hls/:videoId/:quality/:file", auth, async (req, res) => {
//   try {
//     const { videoId, quality, file } = req.params;
//     const key = `videos/${videoId}/${quality}/${file}`;

//     const fileStream = s3
//       .getObject({
//         Bucket: process.env.AWS_BUCKET1,
//         Key: key,
//       })
//       .createReadStream();

//     res.setHeader(
//       "Content-Type",
//       file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T"
//     );

//     fileStream.pipe(res);
//   } catch (error) {
//     logger.error("Streaming failed:", error);
//     res.status(404).json({ error: "File not found" });
//   }
// });

router.get("/getpublicreels", auth, async (req, res) => {
  try {
    let video;
    // find only public videos
    const LastId = req.query.LastId;
    const limit = req.query.limit || 100;
    // have  to take data after lastId
    // const video = await ReelsvideoIdModel.find({ visibility: "public" })
    if (LastId) {
      console.log("if in getpublicreels");
      video = await ReelsvideoIdModel.aggregate([
        { $match: { _id: { $gt: LastId }, visibility: "public" } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
      ]);
    } else {
      console.log("else in getpublicreels");
      video = await ReelsvideoIdModel.aggregate([
        { $match: { visibility: "public" } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
      ]);
    }
    console.log("public reels =======>", video);
    res.send(video);
  } catch (error) {
    console.log("error in getpublicreels", error);
    logger.error("Failed to fetch videoIds:", error);
    res.status(500).json({ error: "Failed to fetch videoIds" });
  }
});
router.get("/getuserreels", auth, async (req, res) => {
  try {
    // console.log("req.user", req.user);
    // req.user {
    //   _id: new ObjectId('666666666666666666666666'),
    //   username: 'test',
    //   mobile: '1234567890'
    // }
    const videoId = await ReelsvideoIdModel.aggregate([
      { $match: { userId: req.user._id } },
      { $limit: 100 },
      { $sort: { createdAt: -1 } },
    ]);
    // console.log("videoId=======>", videoId);
    // saperate public and private videos
    const publicVideos = videoId.filter(
      (video) => video.visibility === "public"
    );
    const privateVideos = videoId.filter(
      (video) => video.visibility === "private"
    );
    res.send({ user: req.user, publicVideos, privateVideos });
  } catch (error) {
    logger.error("Failed to fetch videoIds:", error);
    res.status(500).json({ error: "Failed to fetch videoIds" });
  }
});
// module.exports = router;
module.exports = { router };
