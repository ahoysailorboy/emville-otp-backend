// make-admin.js
const admin = require('firebase-admin');
const path = require('path');

// 1) Load the local service account file (DO NOT COMMIT THIS FILE)
const serviceAccount = require(path.resolve(__dirname, './serviceAccount.json'));

// 2) Normalize the private key (turn literal "\n" into real newlines)
if (typeof serviceAccount.private_key === 'string') {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

// 3) Init admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 4) Set custom claims (admin: true) for the target user
async function setAdmin(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Set admin=true for ${email} (uid: ${user.uid})`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to set admin claim:', err);
    process.exit(1);
  }
}

// Change this to the email you want to make admin:
setAdmin('ahoy_sailorboy@yahoo.com');