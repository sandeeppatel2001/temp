const fast2sms = require("fast-two-sms");
const express = require("express");
const router = express.Router();
const dotenv = require("dotenv");
dotenv.config({ path: "../../../.env" });
const generateOtp = () => {
  //6 digit otp
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOtp = async (mobile) => {
  try {
    const otp = generateOtp();
    options = {
      authorization: process.env.SMS_API_KEY, //fill this with your api
      message: `your OTP verification code is ${otp} from Golden Memory`,
      numbers: [mobile],
    };
    console.log("options", options);
    console.log("otp", otp);
    const response = await fast2sms.sendMessage(options);
    console.log("response===>", response);
    return response;
  } catch (error) {
    console.log("error===>", error);
  }
};
sendOtp("7004720713");
module.exports = { sendOtp };
