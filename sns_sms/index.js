const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config({ path: "../../.env" });
console.log(
  "accessKeyId: ",
  process.env.AWS_ACCESS_KEY_ID,
  "secretAccessKey: ",
  process.env.AWS_SECRET_ACCESS_KEY,
  "region: ",
  process.env.AWS_REGION
);
const sns = new AWS.SNS({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const sendSms = async (phoneNumber, message) => {
  const params = {
    Message: message,
    PhoneNumber: phoneNumber,
  };
  const response = await sns.publish(params).promise();
  console.log(response);
};
sendSms("+918081984299", "Hello, this is a test message");
module.exports = { sendSms };
