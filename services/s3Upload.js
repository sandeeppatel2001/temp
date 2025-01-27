const AWS = require("aws-sdk");
const config = require("../config");
const logger = require("../config/logger");

const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKey,
  secretAccessKey: config.aws.secretKey,
});

// async function uploadToS3(bucket, buffer, key) {
//   logger.info("Starting S3 upload", { bucket, key });
//   return s3
//     .upload({
//       Bucket: bucket,
//       Key: key,
//       Body: buffer,
//       ContentEncryption: "AES256",
//     })
//     .promise();
// }
/**
 * Uploads a stream chunk to S3 with retries.
 */
async function uploadChunkToS3(
  bucket,
  key,
  buffer,
  maxRetries = 3,
  initialDelay = 1000
) {
  // let attempt = 0;
  // let delay = initialDelay;
  // console.log("uploadChunkToS3", bucket, key);
  // while (attempt <= maxRetries) {
  //   try {
  //     const response = await s3
  //       .upload({
  //         Bucket: bucket,
  //         Key: key,
  //         Body: stream,
  //         ContentEncryption: "AES256",
  //       })
  //       .promise();
  //     console.log(`Uploaded ${key} successfully`);
  //     return response;
  //   } catch (error) {
  //     attempt++;
  //     if (attempt > maxRetries) {
  //       console.error(
  //         `Failed to upload ${key} after ${maxRetries} attempts`,
  //         error
  //       );
  //       throw error;
  //     }
  //     console.warn(
  //       `Upload failed for ${key}. Retrying in ${delay}ms (attempt ${attempt})...`
  //     );
  //     await new Promise((resolve) => setTimeout(resolve, delay));
  //     delay *= 2; // Exponential backoff
  //   }
  // }
  return s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentEncryption: "AES256",
    })
    .promise();
}
module.exports = {
  s3,
  uploadChunkToS3,
};
