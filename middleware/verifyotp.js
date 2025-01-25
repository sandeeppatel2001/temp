const { redis } = require("../services/queueService");

const verifyOtp = async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    const storedOtp = await redis.get(`otp:${mobile}`);
    console.log("storedOtp", storedOtp);
    console.log("otp", otp);
    if (storedOtp === otp) {
      next();
    } else {
      res.status(400).json({
        error: true,
        message: "OTP verification failed",
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({
      error: true,
      message: "Error verifying OTP",
    });
  }
};

module.exports = verifyOtp;
