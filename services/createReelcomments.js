const mongoose = require("mongoose");
const ReelsComment = require("../mongodb/models/reels/reelcomments");
const Reels = require("../mongodb/models/reels/reels");
async function createReelComment(
  videoId,
  userId,
  username,
  content,
  parentCommentId = null
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find video using string videoId
    const video = await Reels.findOne({ videoId }).session(session);
    if (!video) {
      throw new Error("Reels Video not found");
    }

    // Create comment with string videoId
    const comment = await ReelsComment.create(
      [
        {
          videoId: videoId.toString(), // Ensure videoId is string
          userId,
          username,
          content,
          parentCommentId,
        },
      ],
      { session }
    );
    console.log("completed till Reels comment creation", comment);

    // Update video using string videoId
    await Reels.findOneAndUpdate(
      { videoId },
      { $inc: { commentsCount: 1 } }
    ).session(session);

    await session.commitTransaction();
    return comment[0];
  } catch (error) {
    await session.abortTransaction();
    console.log("error in createReelComment", error);
  } finally {
    session.endSession();
  }
}

async function getReelComments(videoId, page = 1, limit = 20) {
  return ReelsComment.find({
    videoId,
    parentCommentId: null, // Get only top-level comments
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("userId", "username avatar"); // Assuming you want user details
}
module.exports = {
  createReelComment,
  getReelComments,
};
