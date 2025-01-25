const fast2sms = require("fast-two-sms");
const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
dotenv.config({ path: "../../.env" });
const { redis } = require("../../services/queueService");
const generateOtp = () => {
  //6 digit otp
  return Math.floor(100000 + Math.random() * 900000).toString();
};

router.post("/send-otp", async (req, res) => {
  try {
    const { mobile } = req.body;
    const otp = generateOtp();
    options = {
      authorization: process.env.SMS_API_KEY, //fill this with your api
      message: `Your OTP verification code is ${otp} from Golden Memory`,
      numbers: [mobile],
    };
    const response = await fast2sms.sendMessage(options);
    console.log("response===>", response);
    if (response.return === true) {
      console.log("otp", otp);
      await redis.set(`otp:${mobile}`, otp, "EX", 60 * 2); // expire in 2 min
      res.status(200).send("OTP sent successfully");
    } else {
      console.log(" getting error in sending otp");
      res.status(500).send("Error sending OTP");
    }
  } catch (error) {
    console.log("error", error);
    res.status(500).send("Error sending OTP");
  }
});

module.exports = router;
