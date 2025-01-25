const mongoose = require("mongoose");
const Comment = require("../mongodb/models/commentmodel");
const Video = require("../mongodb/models/videomodel");

async function createComment(
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
    const video = await Video.findOne({ videoId }).session(session);
    if (!video) {
      throw new Error("Video not found");
    }

    // Create comment with string videoId
    const comment = await Comment.create(
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
    console.log("completed till comment creation", comment);

    // Update video using string videoId
    await Video.findOneAndUpdate(
      { videoId },
      { $inc: { commentsCount: 1 } }
    ).session(session);

    await session.commitTransaction();
    return comment[0];
  } catch (error) {
    await session.abortTransaction();
    console.log("error in createComment", error);
  } finally {
    session.endSession();
  }
}

async function getVideoComments(videoId, page = 1, limit = 20) {
  return Comment.find({
    videoId,
    parentCommentId: null, // Get only top-level comments
  })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("userId", "username avatar"); // Assuming you want user details
}
module.exports = {
  createComment,
  getVideoComments,
};
