const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config({ path: "../../.env" });
const { redis } = require("../../services/queueService");

const sns = new AWS.SNS({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const generateOtp = () => {
  //6 digit otp
  return Math.floor(100000 + Math.random() * 900000).toString();
};

router.post("/send-otp", async (req, res) => {
  try {
    const { mobile } = req.body;
    const phoneNumber = "+91" + mobile;
    const otp = generateOtp();
    const params = {
      Message: `Your OTP is ${otp} from Golden Memory`,
      PhoneNumber: phoneNumber,
    };
    console.log("sending otp to ", phoneNumber);
    const response = await sns.publish(params).promise();
    console.log(response);
    await redis.set(`otp:${phoneNumber}`, otp, "EX", 60 * 5); // expire in 5 min
    res.status(200).send("OTP sent successfully");
  } catch (error) {
    console.log("error in send otp", error);
    res.status(500).send("Error sending OTP");
  }
});

module.exports = router;
