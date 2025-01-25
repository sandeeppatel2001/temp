const mongoose = require("mongoose");

const interactionSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ["like", "dislike"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for preventing duplicate interactions
interactionSchema.index({ videoId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Interaction", interactionSchema);
