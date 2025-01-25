const express = require("express");
const router = express.Router();
const { upload } = require("../middleware/upload");
const { videoQueue, redis } = require("../services/queueService");
const { createThumbnailFromBuffer } = require("../services/thumbnailGenerator");
const { processFileToHLS } = require("../services/videoProcessing");
const videoPlayerModel = require("../mongodb/models/videoplayer");
const ReelsvideoIdModel = require("../mongodb/models/reels/reels");
const mongoose = require("mongoose");
const chunkManager = require("../services/chunkManager");
const { uploadMiddleware } = require("../middleware/upload");
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
const videoIdModel = require("../mongodb/models/videomodel");
const logger = require("../config/logger");
const { s3 } = require("../services/s3Upload");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs").promises;
const auth = require("../middleware/auth");
const { VideoMetaData } = require("../services/VideoMetaData");
const videoQualities = [
  { resolution: "144p", height: 144, bitrate: "400k" },
  { resolution: "240p", height: 240, bitrate: "800k" },
  { resolution: "360p", height: 360, bitrate: "1000k" },
  { resolution: "480p", height: 480, bitrate: "1500k" },
  { resolution: "720p", height: 720, bitrate: "2500k" },
  { resolution: "1080p", height: 1080, bitrate: "4000k" },
];

const MAX_BUFFER_SIZE = 0.01 * 1024 * 1024; // for redis db
// add auth middleware
// router.post("/upload", auth, upload.single("video"), async (req, res) => {
//   try {
//     if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
//       throw new Error("Invalid upload: No file or empty buffer received");
//     }

//     if (!req.file.mimetype.startsWith("video/")) {
//       throw new Error("Invalid file type. Only video files are allowed.");
//     }
//     // take all the data from req.body
//     const { title, description } = req.body;
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
//     // await videoIdModel.findOneAndUpdate(
//     //   { videoId },
//     //   {
//     //     thumbnailUrl,
//     //     title,
//     //     visibility: "private",
//     //     userId,
//     //     username,
//     //   },
//     //   { upsert: true }
//     // );
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

//         // Store metadata in database
//         // await videoPlayerModel.findOneAndUpdate(
//         //   { videoId },
//         //   {
//         //     $set: {
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

//         await redis.set(`video:${videoId}:status`, "processing");

//         // Determine appropriate quality levels
//         const targetQualities = determineTargetQualities(metadata.video.height);
//         await videoIdModel.create({
//           videoId,
//           userId,
//           username,
//           title,
//           maxQuality: targetQualities.length,
//           description,
//           visibility: "private",
//         });
//         // await .create({
//         //   videoId,
//         //   description,
//         // });
//         await Promise.all(
//           targetQualities.map((quality) =>
//             processFileToHLS(tempPath, videoId, quality, metadata)
//           )
//         );

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

router.get("/hls/:videoId/:quality/:file", async (req, res) => {
  try {
    const { videoId, quality, file } = req.params;
    const key = `videos/${videoId}/${quality}/${file}`;
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", key);
    const fileStream = s3
      .getObject({
        Bucket: process.env.AWS_BUCKET1,
        Key: key,
      })
      .createReadStream();

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

router.get("/getpublicvideos", auth, async (req, res) => {
  try {
    // find latest video on top and old video on bottom
    // const video = await videoIdModel
    //   .find({ visibility: "public" })
    //   .sort({ createdAt: -1 })
    //   .limit(100);
    const video = await videoIdModel.aggregate([
      { $match: { visibility: "public" } },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);
    res.send(video);
  } catch (error) {
    logger.error("Failed to fetch videoIds:", error);
    res.status(500).json({ error: "Failed to fetch videoIds" });
  }
});
router.get("/getuservideos", auth, async (req, res) => {
  try {
    // console.log("req.user", req.user);
    // req.user {
    //   _id: new ObjectId('666666666666666666666666'),
    //   username: 'test',
    //   mobile: '1234567890'
    // }
    console.log("req.user", req.user);
    const videoId = await videoIdModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user._id) } },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);
    console.log("videoId=======>", videoId);
    // const videoId = await videoIdModel
    //   .find({ userId: req.user._id }) // typecast _id to mongoid
    //   .limit(100);
    // console.log("videoId=======>", videoId);
    // saperate public and private videos
    const publicVideos = videoId.filter(
      (video) => video.visibility === "public"
    );
    const privateVideos = videoId.filter(
      (video) => video.visibility === "private"
    );
    // const reels = await ReelsvideoIdModel.find({ userId: req.user._id }) // typecast _id to mongoid
    //   .limit(100);
    const reels = await ReelsvideoIdModel.aggregate([
      { $match: { userId: req.user._id } },
      { $sort: { createdAt: -1 } },
      { $limit: 100 },
    ]);
    // console.log("videoId=======>", videoId);
    // saperate public and private videos
    const publicReels = reels.filter((video) => video.visibility === "public");
    const privateReels = reels.filter(
      (video) => video.visibility === "private"
    );
    res.send({
      user: req.user,
      publicVideos,
      privateVideos,
      publicReels,
      privateReels,
    });
  } catch (error) {
    console.log("error", error);
    logger.error("Failed to fetch videoIds:", error);
    res.status(500).json({ error: "Failed to fetch videoIds" });
  }
});

router.post("/initiate-upload", auth, async (req, res) => {
  try {
    console.log("initiate-upload----------------");
    const uploadId = crypto.randomUUID();
    const { totalChunks, filename, title, description, type } = req.body;
    await redis.set(
      `video:${uploadId}:info`,
      JSON.stringify({
        title,
        description,
        videoId: uploadId,
        type: type,
      })
    );

    await chunkManager.initializeUpload(uploadId, totalChunks, filename);
    console.log(
      "initiate-upload----------------after chunkManager.initializeUpload"
    );
    res.json({ uploadId });
  } catch (error) {
    logger.error("Failed to initiate upload:", error);
    res.status(500).json({ error: "Failed to initiate upload" });
  }
});

router.post("/upload-chunk", auth, uploadMiddleware, async (req, res) => {
  try {
    const { uploadId, chunkNumber, totalChunks, type } = req.body;

    if (!uploadId || chunkNumber === undefined || !req.file) {
      throw new Error("Missing required upload parameters");
    }
    console.log("upload-chunk----------------", req.body);
    // Generate thumbnail after receiving enough chunks for a proper thumbnail
    if (type !== "reel" && parseInt(chunkNumber) === 5) {
      try {
        const chunkDir = path.join(__dirname, "../tempuploads", uploadId);
        const thumbChunks = [];

        // Combine first 5 chunks for thumbnail generation
        for (let i = 0; i <= 5; i++) {
          const chunkPath = path.join(chunkDir, `thumb-${i}`);
          try {
            // Check if file exists using fs.access
            await fs.access(chunkPath, fs.constants.F_OK);
            const chunkData = await fs.readFile(chunkPath);
            thumbChunks.push(chunkData);
            // Clean up temporary thumbnail chunk
            await fs.unlink(chunkPath);
          } catch (err) {
            // File doesn't exist or other error, continue to next chunk
            logger.debug(
              `Chunk ${i} not found or error accessing: ${err.message}`
            );
            continue;
          }
        }

        if (thumbChunks.length > 0) {
          const thumbnailBuffer = Buffer.concat(thumbChunks);
          thumbnailUrl = await createThumbnailFromBuffer(
            thumbnailBuffer,
            uploadId
          );
          console.log("Thumbnail generated successfully:", thumbnailUrl);
        }
      } catch (thumbnailError) {
        console.log("thumbnailError", thumbnailError);
        logger.error(
          `Thumbnail generation failed for videoId ${uploadId}:`,
          thumbnailError
        );
      }
    }

    const isComplete = await chunkManager.saveChunk(
      uploadId,
      parseInt(chunkNumber),
      req.file
    );

    if (isComplete) {
      console.log("isComplete----------------2");
      try {
        const finalPath = await chunkManager.combineChunks(uploadId);
        console.log("finalPath----------------", finalPath);

        const metadata = await VideoMetaData(finalPath);
        console.log("metadata", metadata);
        const targetQualities = determineTargetQualities(metadata.video.height);
        console.log("targetQualities", targetQualities);
        let videoInfo = await redis.get(`video:${uploadId}:info`);
        videoInfo = JSON.parse(videoInfo);
        console.log("videoInfo", videoInfo);
        const videodata = {
          videoId: videoInfo.videoId,
          userId: req.user._id,
          username: req.user.username,
          title: videoInfo.title,
          maxQuality: targetQualities.length,
          description: videoInfo.description,
          visibility: "private",
        };
        console.log("videodata", videodata);
        if (videoInfo.type === "reel") {
          const chunkData = await fs.readFile(finalPath);
          thumbnailUrl = await createThumbnailFromBuffer(
            chunkData,
            uploadId,
            type
          );
          await ReelsvideoIdModel.create(videodata);
        } else {
          await videoIdModel.create(videodata);
        }
        res.json({
          success: true,
          isComplete,
          progress: 100,
        });
        await Promise.all(
          targetQualities.map((quality) =>
            processFileToHLS(finalPath, uploadId, quality, metadata)
          )
        );
        console.log("processFileToHLS done going to cleanup");
        await chunkManager.cleanup(uploadId);
        console.log("cleanup done");
      } catch (error) {
        console.log("error", error);
        logger.error("Error processing complete upload:", error);
        throw error;
      }
    } else {
      const progress = await chunkManager.getUploadProgress(uploadId);
      res.json({
        success: true,
        isComplete,
        progress,
      });
    }
  } catch (error) {
    console.log("error in upload-chunk", error);
    logger.error("Chunk upload failed:", error);
    res.status(500).json({
      error: "Chunk upload failed",
      details: error.message,
    });
  }
});

// module.exports = router;
module.exports = { router, videoQualities };
