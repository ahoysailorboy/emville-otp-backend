// routes/signup.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const admin = require('../admin/firebase'); // <- make sure this path matches your project
require('dotenv').config();

// --- Config ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ahoy_sailorboy@yahoo.com';

// In-memory temporary store: Map<email, { code, password, firstName, lastName, timestamp }>
const authCodes = new Map();

// Email transporter (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // from .env / Render env
    pass: process.env.EMAIL_PASS, // from .env / Render env
  },
});

/**
 * POST /api/generate-auth-code
 * Body: { email, password, firstName, lastName }
 */
router.post('/generate-auth-code', async (req, res) => {
  try {
    const rawEmail   = (req.body?.email || '').trim();
    const password   = (req.body?.password || '').trim();
    const firstName  = (req.body?.firstName || '').trim();
    const lastName   = (req.body?.lastName || '').trim();

    if (!rawEmail || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Email, password, first name, and last name are required.' });
    }

    const email = rawEmail.toLowerCase();
    const code = uuidv4().slice(0, 6).toUpperCase(); // 6-char code

    authCodes.set(email, {
      code,
      password,
      firstName,
      lastName,
      timestamp: Date.now(),
    });

    const adminMessage = `Authorization code for user ${email}: ${code}\nName: ${firstName} ${lastName}`;

    // Send code to the admin email
    await transporter.sendMail({
      to: ADMIN_EMAIL,
      subject: 'New User Authorization Code',
      text: adminMessage,
    });

    console.log(`✅ Auth code generated for ${email}: ${code}`);
    return res.status(200).json({ success: true, message: 'Authorization code sent to admin.' });
  } catch (error) {
    console.error('❌ Error generating auth code:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

/**
 * POST /api/verify-auth-code
 * Body: { email, code }
 *
 * Side-effect on success:
 *   - Upsert a Firestore user profile document at users/{email}
 *     { email, firstName, lastName, isAdmin, createdAt }
 *   - (We do NOT create Firebase Auth users here; your client handles that.)
 */
router.post('/verify-auth-code', async (req, res) => {
  try {
    const rawEmail = (req.body?.email || '').trim();
    const rawCode  = (req.body?.code || '').trim();

    if (!rawEmail || !rawCode) {
      return res.status(400).json({ success: false, message: 'Email and code are required.' });
    }

    const email = rawEmail.toLowerCase();
    const record = authCodes.get(email);

    if (!record) {
      return res.status(400).json({ success: false, message: 'No authorization request found for this email.' });
    }

    // Expire after 10 minutes
    const ageMs = Date.now() - record.timestamp;
    const maxAgeMs = 10 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      authCodes.delete(email);
      return res.status(400).json({ success: false, message: 'Authorization code has expired. Please request a new one.' });
    }

    if (record.code !== rawCode.toUpperCase()) {
      return res.status(400).json({ success: false, message: 'Invalid authorization code.' });
    }

    // Upsert user profile in Firestore
    try {
      const isAdmin = email === ADMIN_EMAIL;
      await admin.firestore().collection('users').doc(email).set(
        {
          email,
          firstName: record.firstName,
          lastName:  record.lastName,
          isAdmin,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (firestoreErr) {
      console.error('⚠️ Firestore user upsert failed:', firestoreErr);
      // don't block verification if Firestore write hiccups
    }

    authCodes.delete(email); // one-time use

    return res.status(200).json({ success: true, message: 'Authorization code verified.' });
  } catch (error) {
    console.error('❌ verify-auth-code error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;