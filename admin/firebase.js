// firebase.js (CommonJS)
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env var is missing.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
    throw err;
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('✅ Firebase Admin initialized');
}

module.exports = admin;