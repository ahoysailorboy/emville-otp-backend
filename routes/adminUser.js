// routes/adminUsers.js
const express = require('express');
const router = express.Router();
const admin = require('../admin/firebase'); // your Firebase Admin init

// Never allow deleting this email
const PROTECTED_EMAIL = 'ahoy_sailorboy@yahoo.com';

// DELETE another user (Admin SDK)
router.post('/delete-user', async (req, res) => {
  try {
    const { uid, email } = req.body || {};

    if (!uid && !email) {
      return res.status(400).json({ ok: false, error: 'uid or email required' });
    }
    if (email && email.toLowerCase() === PROTECTED_EMAIL) {
      return res.status(403).json({ ok: false, error: 'Protected admin cannot be deleted' });
    }

    // Optional: verify the caller is admin (uncomment when you pass an ID token)
    // const authHeader = req.headers.authorization || '';
    // const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    // if (!idToken) return res.status(401).json({ ok: false, error: 'Missing token' });
    // const decoded = await admin.auth().verifyIdToken(idToken);
    // if (!decoded.admin) return res.status(403).json({ ok: false, error: 'Admins only' });

    let targetUid = uid;

    // If only email supplied, look up uid
    if (!targetUid && email) {
      const user = await admin.auth().getUserByEmail(email);
      targetUid = user.uid;
    }

    // Delete from Firebase Auth
    await admin.auth().deleteUser(targetUid).catch((e) => {
      // If user already missing, continue to Firestore cleanup
      if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
    });

    // Best-effort delete profile doc
    await admin.firestore().collection('users').doc(targetUid).delete().catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    console.error('Delete user failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

module.exports = router;