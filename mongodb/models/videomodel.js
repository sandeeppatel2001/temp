const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    unique: true,
  },
  thumbnailUrl: {
    type: String,
    default: "",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  username: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    select: false,
  },
  visibility: {
    type: String,
    enum: ["public", "unlisted", "private"],
    default: "private",
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing",
  },
  maxQuality: {
    type: Number,
    default: 0,
  },
  views: { type: Number, default: 0 },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  likes: {
    type: Number,
    default: 0,
    index: true,
  },
  dislikes: {
    type: Number,
    default: 0,
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
});
module.exports = mongoose.model("VideoID", videoSchema);

// module.exports = mongoose.model("Video", videoSchema);
