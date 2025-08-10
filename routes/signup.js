// routes/signup.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
require('dotenv').config(); // ensure env vars are loaded

// --- Config ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ahoy_sailorboy@yahoo.com';

// In-memory temporary store: Map<email, { code, password, timestamp }>
const authCodes = new Map();

// Email transporter (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // from .env
    pass: process.env.EMAIL_PASS, // from .env
  },
});

// POST /api/generate-auth-code
// Body: { email, password }
router.post('/generate-auth-code', async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').trim();
    const password = (req.body?.password || '').trim();

    if (!rawEmail || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required.' });
    }

    const email = rawEmail.toLowerCase();
    const code = uuidv4().slice(0, 6).toUpperCase(); // 6-char code
    const record = { code, password, timestamp: Date.now() };

    authCodes.set(email, record);

    const adminMessage = `Authorization code for user ${email}: ${code}`;

    // Send to Admin Email
    await transporter.sendMail({
      to: ADMIN_EMAIL,
      subject: 'New User Authorization Code',
      text: adminMessage,
    });

    // TODO: Also send to WhatsApp (Twilio/WhatsApp Business API) if needed

    console.log(`Auth code generated for ${email}: ${code}`);
    return res
      .status(200)
      .json({ success: true, message: 'Authorization code sent to admin.' });
  } catch (error) {
    console.error('Error generating auth code:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/verify-auth-code
// Body: { email, code }
router.post('/verify-auth-code', (req, res) => {
  const rawEmail = (req.body?.email || '').trim();
  const rawCode = (req.body?.code || '').trim();

  if (!rawEmail || !rawCode) {
    return res
      .status(400)
      .json({ success: false, message: 'Email and code are required.' });
  }

  const email = rawEmail.toLowerCase();
  const record = authCodes.get(email);

  if (!record) {
    return res
      .status(400)
      .json({ success: false, message: 'No authorization code found for this email.' });
  }

  // Expire after 10 minutes
  const ageMs = Date.now() - record.timestamp;
  const maxAgeMs = 10 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    authCodes.delete(email);
    return res
      .status(400)
      .json({ success: false, message: 'Authorization code has expired. Please request a new one.' });
  }

  if (record.code !== rawCode.toUpperCase()) {
    return res
      .status(400)
      .json({ success: false, message: 'Invalid authorization code.' });
  }

  // Success: remove the record so it can't be reused
  authCodes.delete(email);
  return res
    .status(200)
    .json({ success: true, message: 'Authorization code verified.' });
});

module.exports = router;