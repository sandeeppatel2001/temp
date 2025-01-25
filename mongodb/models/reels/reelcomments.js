const mongoose = require("mongoose");

const reelCommentsSchema = new mongoose.Schema({
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
    ref: "ReelComments",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("ReelComments", reelCommentsSchema);
