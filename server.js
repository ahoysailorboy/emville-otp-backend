// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Initialize Firebase Admin (via ./firebase using CommonJS)
const admin = require('./admin/firebase'); // eslint-disable-line no-unused-vars

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());

// ---------- Health check ----------
app.get('/health', (_req, res) => res.status(200).send('OK'));

// ---------- Reusable email transporter ----------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // from .env
    pass: process.env.EMAIL_PASS, // from .env
  },
});

// ---------- Admin API key guard (applies only if ADMIN_API_KEY is set) ----------
function adminKeyGuard(req, res, next) {
  const requiredKey = process.env.ADMIN_API_KEY;
  if (!requiredKey) return next(); // no key configured → skip auth
  const provided = req.header('x-admin-key');
  if (provided && provided === requiredKey) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// ---------- Routes ----------
const signupRoutes = require('./routes/signup');
app.use('/api', signupRoutes);

const adminUsersRoutes = require('./routes/adminUsers');
app.use('/api/admin', adminKeyGuard, adminUsersRoutes);
console.log(
  `[init] /api/admin mounted${process.env.ADMIN_API_KEY ? ' with x-admin-key guard' : ' (no ADMIN_API_KEY set — guard disabled)'}`
);

// ---------- In-memory OTP store: Map<lowercasedEmail, { code, expires }> ----------
const otpStore = new Map();

// Helpers
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
app.post('/send-otp', async (req, res) => {
  try {
    const requestedEmail = normalizeEmail((req.body || {}).email);
    if (!requestedEmail) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    // Generate + store OTP against the *requesting* email
    const code = crypto.randomInt(100000, 999999).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(requestedEmail, { code, expires });

    // Where to send? → Admin inbox (not the user)
    const adminTo = process.env.ADMIN_NOTIFY_EMAIL || 'ahoy_sailorboy@yahoo.com';

    // Optional: include the requested email in the message so admin knows who asked
    const text = `OTP for signup request from ${requestedEmail}: ${code}\nValid for 5 minutes.`;

    // Send
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: adminTo,
      subject: 'Emville PMS — Signup OTP',
      text,
    });

    console.log(`[send-otp] sent to admin ${adminTo} for ${requestedEmail} (code ${code})`);
    return res.status(200).json({ success: true, message: 'OTP sent to administrator.' });
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
});

/**
 * POST /verify-otp  (kept for compatibility)
 * Body: { email: string, otp?: string, code?: string }
 */
app.post('/verify-otp', (req, res) => {
  try {
    const email = normalizeEmail((req.body || {}).email);
    const token = String((req.body || {}).otp ?? (req.body || {}).code ?? '').trim();

    if (!email || !token) {
      return res.status(400).json({ success: false, message: 'Missing email or OTP.' });
    }

    const record = otpStore.get(email);
    if (!record) {
      return res.status(400).json({ success: false, message: 'No OTP found for this email.' });
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    if (record.code !== token) {
      return res.status(400).json({ success: false, message: 'Invalid OTP.' });
    }

    otpStore.delete(email);
    return res.status(200).json({ success: true, message: 'OTP verified successfully.' });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ success: false, message: 'Server error verifying OTP.' });
  }
});

/**
 * ✅ POST /api/auth/signup-with-otp  (Correctness-first)
 * Body: { email: string, password: string, displayName?: string, otp?: string, code?: string }
 * - Verifies OTP from in-memory store
 * - Creates Firebase Auth user
 * - Upserts Firestore users/{uid} with default role: 'user'
 * - Consumes OTP
 */
app.post('/api/auth/signup-with-otp', async (req, res) => {
  try {
    const { password, displayName } = req.body || {};
    const email = normalizeEmail((req.body || {}).email);
    const token = String((req.body || {}).otp ?? (req.body || {}).code ?? '').trim();

    if (!email || !password || !token) {
      return res.status(400).json({ ok: false, error: 'email, password and otp/code are required' });
    }

    // 1) Verify OTP
    const record = otpStore.get(email);
    if (!record) {
      return res.status(400).json({ ok: false, error: 'No OTP found for this email (request a new one).' });
    }
    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return res.status(400).json({ ok: false, error: 'OTP expired. Please request a new one.' });
    }
    if (record.code !== token) {
      return res.status(400).json({ ok: false, error: 'Invalid OTP.' });
    }

    // 2) Create Auth user (if not exists)
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: (displayName || '').trim() || undefined,
        emailVerified: false,
        disabled: false,
      });
    } catch (e) {
      // If already exists, guide the client to login
      if (e?.errorInfo?.code === 'auth/email-already-exists') {
        return res.status(409).json({ ok: false, error: 'Email already registered. Please log in.' });
      }
      throw e;
    }

    const uid = userRecord.uid;

    // 3) Create/merge profile doc with default role
    await admin.firestore().collection('users').doc(uid).set(
      {
        uid,
        email,
        displayName: userRecord.displayName || '',
        role: 'user',
        isAdmin: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // 4) Consume OTP
    otpStore.delete(email);

    return res.status(200).json({ ok: true, uid });
  } catch (err) {
    console.error('signup-with-otp failed:', err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});