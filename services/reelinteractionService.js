const mongoose = require("mongoose");
const ReelsInteraction = require("../mongodb/models/reels/reelslike");
const Reels = require("../mongodb/models/reels/reels");

async function toggleReelsInteraction(videoId, userId, interactionType) {
  const session = await mongoose.startSession();
  session.startTransaction();

  if (!userId) {
    throw new Error("userId is required");
  }

  try {
    // Find the video first to ensure it exists
    const video = await Reels.findOne({ videoId: videoId }).session(session);

    if (!video) {
      throw new Error("Video not found");
    }

    // Check if any interaction exists
    const existingInteraction = await ReelsInteraction.findOne({
      videoId: videoId, // Using the string videoId
      userId: userId,
    }).session(session);

    if (existingInteraction) {
      if (existingInteraction.type === interactionType) {
        // Remove the interaction if clicking the same button
        await ReelsInteraction.deleteOne({
          _id: existingInteraction._id,
        }).session(session);

        // Decrease the counter for that type
        await Reels.updateOne(
          { videoId: videoId }, // Using videoId field instead of _id
          { $inc: { [interactionType + "s"]: -1 } }
        ).session(session);
      } else {
        // Switch from like to dislike or vice versa
        await ReelsInteraction.updateOne(
          { _id: existingInteraction._id },
          { type: interactionType }
        ).session(session);

        // Update both counters
        await Reels.updateOne(
          { videoId: videoId }, // Using videoId field instead of _id
          {
            $inc: {
              [existingInteraction.type + "s"]: -1,
              [interactionType + "s"]: 1,
            },
          }
        ).session(session);
      }
    } else {
      // Create new interaction
      await ReelsInteraction.create(
        [
          {
            videoId: videoId,
            userId: userId,
            type: interactionType,
          },
        ],
        { session }
      );

      // Increment the counter
      await Reels.updateOne(
        { videoId: videoId }, // Using videoId field instead of _id
        { $inc: { [interactionType + "s"]: 1 } }
      ).session(session);
    }

    await session.commitTransaction();

    // Return updated counts
    const updatedVideo = await Reels.findOne({ videoId: videoId }).select(
      "likes dislikes"
    );

    return {
      likes: updatedVideo.likes,
      dislikes: updatedVideo.dislikes,
      userInteraction: interactionType,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

async function increaseReelsView(videoId) {
  try {
    await Reels.updateOne({ videoId: videoId }, { $inc: { views: 1 } });
    console.log("view count updated");
  } catch (error) {
    throw error;
  }
}

module.exports = {
  toggleReelsInteraction,
  increaseReelsView,
};
