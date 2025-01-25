const admin = require("firebase-admin");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Initialize Firebase Admin SDK
const serviceAccount = require("./serviceAccountsKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const sendOtp = async () => {
  const phoneNumber = "8081984299";

  try {
    // Use Firebase's Recaptcha-less verification for trusted server environments
    const verificationId = await auth.createCustomToken(phoneNumber);
    console.log("OTP sent successfully", verificationId);
  } catch (error) {
    console.error("Error sending OTP:", error);
  }
};
sendOtp();
