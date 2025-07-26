const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load .env variables

const authCodes = {}; // In-memory temporary store

// Nodemailer Gmail Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post('/generate-auth-code', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const code = uuidv4().slice(0, 6).toUpperCase(); // 6-char auth code

    // Save to temporary store (in production, use a database)
    authCodes[email] = { code, password, timestamp: Date.now() };

    const adminMessage = `Authorization code for user ${email}: ${code}`;

    // Send to admin via email
    await transporter.sendMail({
      to: 'ahoy_sailorboy@yahoo.com',
      subject: 'New User Authorization Code',
      text: adminMessage,
    });

    // TODO: Send to WhatsApp as well (Twilio or other API)

    console.log(`Auth code sent for ${email}: ${code}`);
    res.status(200).json({ success: true, message: 'Authorization code sent to admin.' });

  } catch (error) {
    console.error('Error in /generate-auth-code:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;