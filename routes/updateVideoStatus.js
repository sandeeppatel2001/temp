const router = require("express").Router();
const videoIdModel = require("../mongodb/models/videomodel");
const auth = require("../middleware/auth");
const { deleteVideo } = require("../services/deleteVideo");
const ReelsvideoIdModel = require("../mongodb/models/reels/reels");
const logger = require("../config/logger");
router.post("/updateVideoStatus", auth, async (req, res) => {
  console.log("request heated in updateVideoStatus", req.body);
  try {
    const { videoId, visibility } = req.body;
    const userId = req.user._id;
    const isReels = req.body.isReels;
    logger.info(
      `Updating visibility to ${visibility} for video ${videoId} (isReels: ${isReels})`
    );

    let video;
    try {
      if (isReels) {
        // Use findOneAndUpdate to avoid race conditions
        video = await ReelsvideoIdModel.findOneAndUpdate(
          { videoId: videoId },
          {
            $set: {
              visibility,
              userId: userId || "6751151c4f22cb8031a2549a",
            },
          },
          {
            new: true, // Return updated document
            runValidators: true, // Run model validators
          }
        );
      } else {
        video = await videoIdModel.findOneAndUpdate(
          { videoId: videoId },
          {
            $set: {
              visibility,
              userId: userId || "6751151c4f22cb8031a2549a",
            },
          },
          {
            new: true,
            runValidators: true,
          }
        );
      }

      if (!video) {
        logger.warn(`Video not found: ${videoId}`);
        return res.status(404).json({
          success: false,
          message: "Video not found",
        });
      }

      logger.info(
        `Successfully updated visibility to ${visibility} for video ${videoId}`
      );
      return res.status(200).json({
        success: true,
        message: "Visibility updated",
        video: {
          videoId: video.videoId,
          visibility: video.visibility,
        },
      });
    } catch (dbError) {
      logger.error(`Database error while updating video ${videoId}:`, dbError);
      return res.status(500).json({
        success: false,
        message: "Video not found or update failed",
        error: dbError.message,
      });
    }
  } catch (error) {
    logger.error("Error in updateVideoStatus route:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

router.delete("/deleteVideo", auth, async (req, res) => {
  console.log("request heated in deleteVideo", req.body);
  const { videoId } = req.body;
  const isReels = req.body.isReels;
  const deleted = await deleteVideo(videoId, isReels);
  if (deleted) {
    logger.info(`Video deleted: ${videoId}`);
    console.log("Video deleted");
    res.status(200).json({ message: "Video deleted" });
  } else {
    logger.error(`Error deleting video: ${videoId}`);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
