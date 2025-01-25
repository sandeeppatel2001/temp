const mongoose = require("mongoose");

const reelsDescriptionSchema = new mongoose.Schema({
  videoId: { type: String, required: true },
  description: { type: String, required: true },
});

module.exports = mongoose.model("ReelsDescription", reelsDescriptionSchema);
