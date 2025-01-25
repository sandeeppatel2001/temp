// NOT USING THIS MODEL

//

const mongoose = require("mongoose");

const videoPlayerSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  videoId: { type: String, required: true },
  metadata: {
    duration: Number,
    resolution: String,
    fps: Number,
    originalBitrate: Number,
    fileSize: Number,
  },
  description: String,
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
});

module.exports = mongoose.model("VideoPlayer", videoPlayerSchema);
