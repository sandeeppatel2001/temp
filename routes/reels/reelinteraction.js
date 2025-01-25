const express = require("express");
const router = express.Router();
const ReelsInteraction = require("../../mongodb/models/reels/reelslike");
const ReelsComment = require("../../mongodb/models/reels/reelcomments");
const {
  createReelComment,
  getReelComments,
} = require("../../services/createReelcomments");
const auth = require("../../middleware/auth");
const {
  toggleReelsInteraction,
  increaseReelsView,
} = require("../../services/reelinteractionService");
router.post("/interaction", auth, async (req, res) => {
  console.log("request heated in reelsinteraction/interaction", req.body);
  try {
    const { type, videoId } = req.body;
    const userId = req.user._id;

    if (!videoId || !type) {
      return res.status(400).json({ message: "VideoId and type are required" });
    }

    if (!["like", "dislike"].includes(type)) {
      return res.status(400).json({ message: "Invalid interaction type" });
    }

    const result = await toggleReelsInteraction(videoId, userId, type);
    res.status(200).json(result);
  } catch (error) {
    console.error("Interaction error:", error);
    res.status(500).json({
      message: "Failed to process interaction",
      error: error.message,
    });
  }
});
router.get("/getuserinteraction", auth, async (req, res) => {
  const videoId = req.body.videoId;
  const userId = req.user._id;
  const interaction = await ReelsInteraction.findOne({ videoId, userId });
  res.status(200).json({ interaction: interaction ? interaction.type : null });
});
router.post("/comment", auth, async (req, res) => {
  console.log("request heated in reelsinteraction/comment", req.body);
  try {
    const { videoId, content } = req.body;
    const userId = req.user._id;
    const username = req.user.username;
    console.log("req.body from comment", req.body);
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    const comment = await createReelComment(videoId, userId, username, content);
    console.log("comment added", comment);
    res.status(201).json({ comment });
  } catch (error) {
    console.error("Error creating comment:", error);
    res
      .status(500)
      .json({ message: "Error creating comment", error: error.message });
  }
});
router.get("/comments/:videoId", auth, async (req, res) => {
  console.log(
    "request heated in reelsinteraction/comments/:videoId",
    req.query
  );
  try {
    const { videoId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const comments = await getReelComments(videoId, page, limit);

    res.status(200).json({
      comments,
      page,
      limit,
      hasMore: comments.length === limit,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching comments", error: error.message });
  }
});
router.get("/comments/:commentId/replies", auth, async (req, res) => {
  console.log(
    "request heated in reelsinteraction/comments/:commentId/replies",
    req.query
  );
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const replies = await ReelsComment.find({ parentCommentId: commentId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("userId", "username avatar");

    res.status(200).json({
      replies,
      page,
      limit,
      hasMore: replies.length === limit,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching replies", error: error.message });
  }
});

router.get("/viewincrease/:videoId", auth, async (req, res) => {
  try {
    console.log("request heated in reelsviewincrease/:videoId", req.params);
    const videoId = req.params.videoId;
    await increaseReelsView(videoId);
    res.status(200).json({ message: "View count updated" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching views", error: error.message });
  }
});
module.exports = router;
