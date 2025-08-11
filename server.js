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
// Protect all /api/admin/* endpoints with x-admin-key (if configured)
app.use('/api/admin', adminKeyGuard, adminUsersRoutes);
console.log(
  `[init] /api/admin mounted${process.env.ADMIN_API_KEY ? ' with x-admin-key guard' : ' (no ADMIN_API_KEY set — guard disabled)'}`
);

// ---------- In-memory OTP store: Map<email, { code, expires }> ----------
const otpStore = new Map();

/**
 * POST /send-otp
 * Body: { email: string }
 */
app.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(email, { code, expires });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your OTP Code',
      text: `Your OTP is ${code}. It is valid for 5 minutes.`,
    });

    console.log(`OTP sent to ${email}: ${code}`);
    return res.status(200).json({ success: true, message: 'OTP sent successfully.' });
  } catch (err) {
    console.error('Error sending OTP:', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
});

/**
 * POST /verify-otp
 * Body: { email: string, otp: string }
 */
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
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

  if (record.code !== otp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP.' });
  }

  otpStore.delete(email);
  return res.status(200).json({ success: true, message: 'OTP verified successfully.' });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});