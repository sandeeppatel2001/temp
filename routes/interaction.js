const express = require("express");
const router = express.Router();
const Interaction = require("../mongodb/models/interactionmodel");
const Comment = require("../mongodb/models/commentmodel");
const {
  createComment,
  getVideoComments,
} = require("../services/commentService");
const auth = require("../middleware/auth");
const {
  toggleInteraction,
  increaseView,
} = require("../services/interactionService");
router.post("/interaction", auth, async (req, res) => {
  try {
    const { type, videoId } = req.body;
    const userId = req.user._id;

    if (!videoId || !type) {
      return res.status(400).json({ message: "VideoId and type are required" });
    }

    if (!["like", "dislike"].includes(type)) {
      return res.status(400).json({ message: "Invalid interaction type" });
    }

    const result = await toggleInteraction(videoId, userId, type);
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
  const interaction = await Interaction.findOne({ videoId, userId });
  res.status(200).json({ interaction: interaction ? interaction.type : null });
});
router.post("/comment", auth, async (req, res) => {
  try {
    const { videoId, content } = req.body;
    const userId = req.user._id;
    const username = req.user.username;
    console.log("req.body from comment", req.body);
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: "Comment content is required" });
    }

    const comment = await createComment(videoId, userId, username, content);
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
  try {
    const { videoId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    console.log("request heated in comments/:videoId", req.query);
    const comments = await getVideoComments(videoId, page, limit);

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
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const replies = await Comment.find({ parentCommentId: commentId })
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
    console.log("request heated in viewincrease/:videoId", req.params);
    const videoId = req.params.videoId;
    await increaseView(videoId);
    res.status(200).json({ message: "View count updated" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching views", error: error.message });
  }
});
module.exports = router;
