const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  videoId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comment",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for faster queries
commentSchema.index({ videoId: 1, createdAt: -1 });

module.exports = mongoose.model("Comment", commentSchema);
