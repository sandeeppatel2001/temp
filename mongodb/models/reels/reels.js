const mongoose = require("mongoose");

const reelsSchema = new mongoose.Schema({
  videoId: { type: String, required: true },
  userId: { type: String, required: true },
  username: { type: String, required: true },
  title: { type: String, required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  visibility: { type: String, default: "private" },
  maxQuality: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  description: { type: String, default: "" },
});

module.exports = mongoose.model("Reels", reelsSchema);
