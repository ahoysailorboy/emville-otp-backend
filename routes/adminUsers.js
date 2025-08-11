// routes/adminUsers.js
const express = require('express');
const router = express.Router();
const admin = require('../admin/firebase');

const PROTECTED_EMAIL = 'ahoy_sailorboy@yahoo.com';

// Optional admin guard: only enforced if ADMIN_API_KEY is set
function adminGuard(req, res, next) {
  const requiredKey = process.env.ADMIN_API_KEY;
  if (!requiredKey) return next(); // no key configured → skip
  const provided = req.header('x-admin-key');
  if (provided && provided === requiredKey) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// Helper to resolve uid by either uid or email
async function resolveUid({ uid, email }) {
  if (uid) return uid;
  if (!email) return null;
  const user = await admin.auth().getUserByEmail(email);
  return user.uid;
}

/**
 * POST /api/admin/set-role
 * Body: { uid?: string, email?: string, role: "admin" | "user" }
 * - Sets custom claims { admin: true|false }
 * - Revokes refresh tokens so next sign-in/refresh carries updated claims
 * - Mirrors role to Firestore users/{uid}.role
 */
router.post('/set-role', adminGuard, async (req, res) => {
  try {
    const { uid, email, role } = req.body || {};
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'role must be "admin" or "user"' });
    }
    if (!uid && !email) {
      return res.status(400).json({ ok: false, error: 'uid or email required' });
    }
    if (email && email.toLowerCase() === PROTECTED_EMAIL) {
      return res.status(403).json({ ok: false, error: 'Protected admin cannot be modified' });
    }

    const targetUid = await resolveUid({ uid, email });
    if (!targetUid) {
      return res.status(404).json({ ok: false, error: 'Target user not found' });
    }

    await admin.auth().setCustomUserClaims(targetUid, { admin: role === 'admin' });
    await admin.auth().revokeRefreshTokens(targetUid);

    await admin.firestore().collection('users').doc(targetUid).update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('set-role failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

/**
 * POST /api/admin/delete-user
 * Body: { uid?: string, email?: string }
 * - Deletes from Firebase Auth
 * - Best-effort deletes Firestore users/{uid}
 */
router.post('/delete-user', adminGuard, async (req, res) => {
  try {
    const { uid, email } = req.body || {};

    if (!uid && !email) {
      return res.status(400).json({ ok: false, error: 'uid or email required' });
    }
    if (email && email.toLowerCase() === PROTECTED_EMAIL) {
      return res.status(403).json({ ok: false, error: 'Protected admin cannot be deleted' });
    }

    const targetUid = await resolveUid({ uid, email });
    if (!targetUid) {
      return res.status(404).json({ ok: false, error: 'Target user not found' });
    }

    await admin
      .auth()
      .deleteUser(targetUid)
      .catch((e) => {
        // If user already missing, continue to Firestore cleanup
        if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
      });

    await admin.firestore().collection('users').doc(targetUid).delete().catch(() => {});

    return res.json({ ok: true });
  } catch (e) {
    console.error('delete-user failed:', e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

module.exports = router;