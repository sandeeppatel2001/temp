const mongoose = require("mongoose");
const Interaction = require("../mongodb/models/interactionmodel");
const Video = require("../mongodb/models/videomodel");

async function toggleInteraction(videoId, userId, interactionType) {
  const session = await mongoose.startSession();
  session.startTransaction();

  if (!userId) {
    throw new Error("userId is required");
  }

  try {
    // Find the video first to ensure it exists
    const video = await Video.findOne({ videoId: videoId }).session(session);

    if (!video) {
      throw new Error("Video not found");
    }

    // Check if any interaction exists
    const existingInteraction = await Interaction.findOne({
      videoId: videoId, // Using the string videoId
      userId: userId,
    }).session(session);

    if (existingInteraction) {
      if (existingInteraction.type === interactionType) {
        // Remove the interaction if clicking the same button
        await Interaction.deleteOne({ _id: existingInteraction._id }).session(
          session
        );

        // Decrease the counter for that type
        await Video.updateOne(
          { videoId: videoId }, // Using videoId field instead of _id
          { $inc: { [interactionType + "s"]: -1 } }
        ).session(session);
      } else {
        // Switch from like to dislike or vice versa
        await Interaction.updateOne(
          { _id: existingInteraction._id },
          { type: interactionType }
        ).session(session);

        // Update both counters
        await Video.updateOne(
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
      await Interaction.create(
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
      await Video.updateOne(
        { videoId: videoId }, // Using videoId field instead of _id
        { $inc: { [interactionType + "s"]: 1 } }
      ).session(session);
    }

    await session.commitTransaction();

    // Return updated counts
    const updatedVideo = await Video.findOne({ videoId: videoId }).select(
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

// Helper functions for cleaner API
async function toggleLike(videoId, userId) {
  return toggleInteraction(videoId, userId, "like");
}

async function toggleDislike(videoId, userId) {
  return toggleInteraction(videoId, userId, "dislike");
}

async function increaseView(videoId) {
  try {
    await Video.updateOne({ videoId: videoId }, { $inc: { views: 1 } });
    console.log("view count updated");
  } catch (error) {
    throw error;
  }
}

module.exports = {
  toggleInteraction,
  toggleLike,
  toggleDislike,
  increaseView,
};
