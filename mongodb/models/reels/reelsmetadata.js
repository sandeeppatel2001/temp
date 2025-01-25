//    NOT USSING THIS MODEL
const mongoose = require("mongoose");

const reelsMetadataSchema = new mongoose.Schema({
  videoId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  description: { type: String, required: true },
  metadata: {
    duration: Number,
    resolution: String,
    fps: Number,
    originalBitrate: Number,
    fileSize: Number,
  },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ReelsMetadata", reelsMetadataSchema);
