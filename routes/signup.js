// routes/signup.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const authCodes = {}; // Temporary in-memory store

// Setup nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-admin@gmail.com',
    pass: 'your-app-password', // Use Gmail App Password
  },
});

router.post('/generate-auth-code', async (req, res) => {
  const { email, password } = req.body;
  const code = uuidv4().slice(0, 6).toUpperCase(); // 6-digit code

  authCodes[email] = { code, password, timestamp: Date.now() };

  const adminMessage = `Authorization code for user ${email}: ${code}`;

  // Send to Admin Email
  await transporter.sendMail({
    to: 'ahoy_sailorboy@yahoo.com',
    subject: 'New User Authorization Code',
    text: adminMessage,
  });

  // TODO: Send to WhatsApp

  res.json({ success: true, message: 'Authorization code sent to admin.' });
});

module.exports = router;
