// admin/firebase.js
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
    // In case the private key has \n escapes, normalize them to real newlines
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err);
    throw err;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('✅ Firebase Admin initialized');
}

module.exports = admin;