const videoIdModel = require("../mongodb/models/videomodel");
const ReelsvideoIdModel = require("../mongodb/models/reels/reels");
const { s3 } = require("./s3Upload");

const deleteVideo = async (videoId, isReels) => {
  try {
    if (isReels) {
      await ReelsvideoIdModel.deleteOne({ videoId: videoId });
    } else {
      await videoIdModel.deleteOne({ videoId: videoId });
    }
    // const video = await videoIdModel.findOne({ videoId: videoId });
    // delete thumbnail
    await s3
      .deleteObject({
        Bucket: process.env.AWS_BUCKET2,
        Key: `videos/${videoId}/thumbnail.jpg`,
      })
      .promise();
    // delete video
    await s3
      .deleteObject({
        Bucket: process.env.AWS_BUCKET1,
        Key: `videos/${videoId}`,
      })
      .promise();
    return true;
  } catch (error) {
    console.error("Error deleting video:", error);
    return false;
  }
};
module.exports = { deleteVideo };
