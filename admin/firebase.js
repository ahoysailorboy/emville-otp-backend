// admin/firebase.js
const admin = require('firebase-admin');

function initFromIndividualVars() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) return false;

  // Convert \n to real newlines for PEM parsing
  privateKey = privateKey.replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return true;
}

function initFromServiceAccountJson() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return false;

  let parsed;
  try {
    parsed = JSON.parse(sa);
  } catch (err) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err);
    throw err;
  }

  // If the private_key came with actual newlines, keep; if escaped, unescape.
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  admin.initializeApp({
    credential: admin.credential.cert(parsed),
  });

  return true;
}

if (!admin.apps.length) {
  const ok =
    initFromIndividualVars() ||
    initFromServiceAccountJson();

  if (!ok) {
    throw new Error(
      'Firebase Admin init failed: Provide either (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) or FIREBASE_SERVICE_ACCOUNT.'
    );
  }

  console.log('✅ Firebase Admin initialized');
}

module.exports = admin;