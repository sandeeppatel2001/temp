const AWS = require("aws-sdk");
const config = require("../config");
const logger = require("../config/logger");

const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKey,
  secretAccessKey: config.aws.secretKey,
});

async function uploadToS3(bucket, buffer, key) {
  logger.info("Starting S3 upload", { bucket, key });
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
  uploadToS3,
};
