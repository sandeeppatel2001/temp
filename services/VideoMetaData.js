const ffmpeg = require("../config/ffmpeg");
const path = require("path");
const fs = require("fs").promises;
const logger = require("../config/logger");
let count = 0;
const VideoMetaData = async (inputPath) => {
  try {
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          logger.error(`FFprobe error: ${err.message}`);
          reject(err);
          return;
        }

        // Get video stream
        const videoStream = metadata.streams.find(
          (s) => s.codec_type === "video"
        );
        const audioStream = metadata.streams.find(
          (s) => s.codec_type === "audio"
        );

        const processedMetadata = {
          duration: parseFloat(metadata.format.duration),
          size: parseInt(metadata.format.size),
          bitrate: parseInt(metadata.format.bit_rate),
          video: videoStream
            ? {
                codec: videoStream.codec_name,
                width: videoStream.width,
                height: videoStream.height,
                fps: eval(videoStream.r_frame_rate), // converts "30/1" to 30
                bitrate: parseInt(videoStream.bit_rate),
              }
            : null,
          audio: audioStream
            ? {
                codec: audioStream.codec_name,
                channels: audioStream.channels,
                sampleRate: audioStream.sample_rate,
                bitrate: parseInt(audioStream.bit_rate),
              }
            : null,
        };

        logger.info(`Processed metadata: ${JSON.stringify(processedMetadata)}`);
        resolve(processedMetadata);
      });
    });
    return metadata;
  } catch (error) {
    logger.error(`File validation failed: ${error.message}`);
    throw error;
  }
};

module.exports = { VideoMetaData };
