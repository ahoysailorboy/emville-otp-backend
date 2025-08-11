// routes/adminUsers.js
const express = require('express');
const router = express.Router();
const admin = require('../admin/firebase');

const PROTECTED_EMAIL = 'ahoy_sailorboy@yahoo.com';

// -------- Admin API key guard (enabled only if ADMIN_API_KEY is set) --------
function adminGuard(req, res, next) {
  const requiredKey = process.env.ADMIN_API_KEY;
  if (!requiredKey) return next(); // guard disabled if no key configured
  const provided = req.header('x-admin-key');
  if (provided && provided === requiredKey) return next();
  return res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// -------- Helper: resolve Auth user by uid first, else by email --------
async function resolveAuthUser({ uid, email }) {
  const hasUid = typeof uid === 'string' && uid.trim().length > 0;
  if (hasUid) {
    try {
      return await admin.auth().getUser(uid.trim());
    } catch (e) {
      if (e?.errorInfo?.code !== 'auth/user-not-found' || !email) throw e;
      // fall through to email if provided
    }
  }
  if (email) {
    return await admin.auth().getUserByEmail(email);
  }
  return null;
}

/**
 * POST /api/admin/set-role
 * Body: { uid?: string, email?: string, role: "admin" | "user" }
 * - Sets custom claim { admin: true|false }
 * - Revokes refresh tokens
 * - Mirrors { role, isAdmin } to Firestore users/{uid} with set(..., {merge:true})
 * - Protected admin cannot be demoted
 */
router.post('/set-role', adminGuard, async (req, res) => {
  try {
    const { uid, email, role } = req.body || {};
    const roleStr = String(role || '').toLowerCase();

    if (!['admin', 'user'].includes(roleStr)) {
      return res.status(400).json({ ok: false, error: 'role must be "admin" or "user"' });
    }
    if (!uid && !email) {
      return res.status(400).json({ ok: false, error: 'uid or email required' });
    }

    const user = await resolveAuthUser({ uid, email });
    if (!user) return res.status(404).json({ ok: false, error: 'Target user not found' });

    const targetUid = user.uid;
    const targetEmail = (user.email || '').toLowerCase();

    // Protected admin cannot be demoted; setting to admin is allowed (idempotent)
    if (targetEmail === PROTECTED_EMAIL && roleStr !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Protected admin cannot be demoted' });
    }

    // 1) Set custom claim
    await admin.auth().setCustomUserClaims(targetUid, { admin: roleStr === 'admin' });

    // 2) Force token refresh on next use
    await admin.auth().revokeRefreshTokens(targetUid);

    // 3) Mirror to Firestore (create if missing)
    await admin.firestore().collection('users').doc(targetUid).set(
      {
        role: roleStr,
        isAdmin: roleStr === 'admin',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ ok: true, uid: targetUid, role: roleStr });
  } catch (e) {
    console.error('set-role failed:', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/**
 * POST /api/admin/delete-user
 * Body: { uid?: string, email?: string }
 * - Deletes from Firebase Auth
 * - Best-effort deletes Firestore users/{uid}
 * - Protected admin cannot be deleted
 */
router.post('/delete-user', adminGuard, async (req, res) => {
  try {
    const { uid, email } = req.body || {};
    if (!uid && !email) {
      return res.status(400).json({ ok: false, error: 'uid or email required' });
    }

    const user = await resolveAuthUser({ uid, email });
    if (!user) return res.status(404).json({ ok: false, error: 'Target user not found' });

    const targetUid = user.uid;
    const targetEmail = (user.email || '').toLowerCase();

    if (targetEmail === PROTECTED_EMAIL) {
      return res.status(403).json({ ok: false, error: 'Protected admin cannot be deleted' });
    }

    // Delete from Firebase Auth (ignore if already gone)
    await admin.auth().deleteUser(targetUid).catch((e) => {
      if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
    });

    // Best-effort Firestore cleanup
    await admin.firestore().collection('users').doc(targetUid).delete().catch(() => {});

    return res.json({ ok: true, uid: targetUid });
  } catch (e) {
    console.error('delete-user failed:', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

module.exports = router;