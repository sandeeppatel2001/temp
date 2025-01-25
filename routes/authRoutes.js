const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../mongodb/models/user");
const { redis } = require("../services/queueService");
const logger = require("../config/logger");
const auth = require("../middleware/auth");
const verifyOtp = require("../middleware/verifyotp");
// Rate limiting configuration
const rateLimit = require("express-rate-limit");
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 requests per windowMs
});

// Login route
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Find user
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(201).json({
        error: true,
        message: "User Not Registered",
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(201).json({
        error: true,
        message: "Invalid UserID or Password",
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d", // 30 days is more precise than "1month" since months vary in length
    });

    // Store session in Redis with token as key
    await redis.setex(
      `session:${token}`,
      30 * 24 * 60 * 60, // 30 days in seconds to match JWT expiry
      JSON.stringify({
        _id: user._id,
        username: user.username,
        mobile: user.mobile,
      })
    );
    // console.log("user", user);
    res.json({
      error: false,
      token,
      user: {
        _id: user._id,
        username: user.username,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    console.log("error", error);
    logger.error("Login error:", error);
    res.status(500).json({
      error: true,
      message: "Error logging in",
    });
  }
});

// Signup route
router.post("/signup", authLimiter, verifyOtp, async (req, res) => {
  try {
    const { username, mobile, password } = req.body;
    console.log("from signup", req.body);

    const existingUser = await User.findOne({
      $or: [{ mobile }],
    });
    console.log("existingUser", existingUser);
    if (existingUser) {
      return res.status(201).json({
        error: true,
        message: "User already exists",
      });
    }

    const user = new User({
      username,
      mobile,
      password,
    });
    await user.save({ alter: true });
    console.log("user saved", user);
    // Store session in Redis with token as key
    // await redis.setex(
    //   `session:${token}`,
    //   86400,
    //   JSON.stringify({
    //     _id: user._id,
    //     username: user.username,
    //     mobile: user.mobile,
    //   })
    // );

    res.status(200).json({
      error: false,
      user: {
        _id: user._id,
        username: user.username,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    console.log("error", error);
    logger.error("Signup error:", error);
    res.status(500).json({
      error: true,
      message: "Error creating user",
    });
  }
});

// Logout route
router.post("/logout", auth, async (req, res) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    await redis.del(`session:${token}`);
    res.json({ error: false, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({ error: true, message: "Error logging out" });
  }
});

router.post("/forgotpassword", verifyOtp, async (req, res) => {
  try {
    const { mobile, password } = req.body;
    console.log("from forgot password", req.body);

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(201).json({
        error: true,
        message: "User not found",
      });
    }
    user.password = password;
    await user.save();
    console.log("password updated", user);
    res.status(200).json({
      error: false,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.log("error", error);
    logger.error("Reset password error:", error);
    res.status(500).json({ error: true, message: "Error resetting password" });
  }
});
module.exports = router;
