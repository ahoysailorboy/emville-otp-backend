// routes/signup.js

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// In-memory temporary store (replace with database in production)
const authCodes = {};

// Email transporter (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Route to generate an authorization code and send to admin
router.post('/generate-auth-code', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const code = uuidv4().slice(0, 6).toUpperCase(); // Generate a 6-character code

    authCodes[email] = {
      code,
      password,
      timestamp: Date.now(),
    };

    const adminMessage = `Authorization code for user ${email}: ${code}`;

    // Send to admin email
    await transporter.sendMail({
      to: 'ahoy_sailorboy@yahoo.com',
      subject: 'New User Authorization Code',
      text: adminMessage,
    });

    console.log(`Auth code generated and emailed for ${email}: ${code}`);
    res.status(200).json({ success: true, message: 'Authorization code sent to admin.' });
  } catch (error) {
    console.error('Error generating auth code:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Route to verify the entered authorization code
router.post('/verify-auth-code', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Email and code are required.' });
  }

  const record = authCodes[email];
  if (!record) {
    return res.status(400).json({ success: false, message: 'No authorization code found for this email.' });
  }

  if (record.code === code.toUpperCase()) {
    // Optional: Expire code after 10 minutes
    const ageMs = Date.now() - record.timestamp;
    const maxAgeMs = 10 * 60 * 1000; // 10 minutes
    if (ageMs > maxAgeMs) {
      delete authCodes[email];
      return res.status(400).json({ success: false, message: 'Authorization code has expired. Please request a new one.' });
    }

    delete authCodes[email]; // Remove once used
    return res.status(200).json({ success: true, message: 'Authorization code verified.' });
  }

  return res.status(400).json({ success: false, message: 'Invalid authorization code.' });
});

module.exports = router;