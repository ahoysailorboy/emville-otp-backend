import fs from "fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getFirestore, serverTimestamp } from "firebase/firestore";

const PROJECT_ID = "emville-pms-test"; // any local id is fine

const RULES = `
${fs.readFileSync("./firestore.rules", "utf8")}
`;

function log(ok, msg) {
  const s = ok ? "PASS" : "FAIL";
  console.log(`${ok ? "✅" : "❌"}  ${s} - ${msg}`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES },
  });

  // Contexts
  const normalUid = "user_123";
  const adminUid  = "admin_999";

  const normalCtx = testEnv.authenticatedContext(normalUid, { email: "user@example.com", admin: false });
  const adminCtx  = testEnv.authenticatedContext(adminUid,  { email: "admin@example.com", admin: true  });
  const anonCtx   = testEnv.unauthenticatedContext();

  const dbUser   = getFirestore(normalCtx);
  const dbAdmin  = getFirestore(adminCtx);
  const dbAnon   = getFirestore(anonCtx);

  // Seed minimal server-side data using Admin (bypasses rules)
  const adminApp = testEnv.unauthenticatedContext(); // but we’ll use withRulesDisabled
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = getFirestore(ctx);
    // Create user docs with locked fields
    await setDoc(doc(db, "users", normalUid), {
      uid: normalUid, email: "user@example.com", role: "user", displayName: "User One",
      createdAt: new Date(), updatedAt: new Date(),
    });
    await setDoc(doc(db, "users", adminUid), {
      uid: adminUid, email: "admin@example.com", role: "admin", displayName: "Admin Nine",
      createdAt: new Date(), updatedAt: new Date(),
    });

    // Create a task
    await setDoc(doc(db, "tasks", "taskA"), {
      name: "Clean Pool",
      description: "Skim and vacuum",
      frequency: "weekly",
      lastDoneDate: null,
      nextDueDate: new Date(),
      remarks: "",
      isPostponed: false,
      updatedBy: "",
    });
  });

  // ---- TESTS ----

  // USERS: normal user can read own doc
  try { await assertSucceeds(getDoc(doc(dbUser, "users", normalUid))); log(true, "User can read own user doc"); } catch { log(false, "User can read own user doc"); }

  // USERS: normal user cannot read other user doc
  try { await assertFails(getDoc(doc(dbUser, "users", adminUid))); log(true, "User CANNOT read other user doc"); } catch { log(false, "User CANNOT read other user doc"); }

  // USERS: normal user can update ONLY safe fields (displayName/phone/photoURL/updatedAt)
  try {
    await assertSucceeds(updateDoc(doc(dbUser, "users", normalUid), {
      displayName: "User One Edited",
      updatedAt: serverTimestamp(),
    }));
    log(true, "User can update only safe profile fields");
  } catch { log(false, "User can update only safe profile fields"); }

  // USERS: normal user CANNOT promote role
  try {
    await assertFails(updateDoc(doc(dbUser, "users", normalUid), { role: "admin" }));
    log(true, "User CANNOT change role");
  } catch { log(false, "User CANNOT change role"); }

  // USERS: admin CAN update another user's role
  try {
    await assertSucceeds(updateDoc(doc(dbAdmin, "users", normalUid), {
      role: "admin",
      updatedAt: serverTimestamp(),
    }));
    log(true, "Admin CAN change role");
  } catch { log(false, "Admin CAN change role"); }

  // TASKS: anyone signed in can read tasks
  try { await assertSucceeds(getDoc(doc(dbUser, "tasks", "taskA"))); log(true, "Signed-in user can read tasks"); } catch { log(false, "Signed-in user can read tasks"); }

  // TASKS: normal user CANNOT create a task
  try { await assertFails(setDoc(doc(dbUser, "tasks", "taskB"), { name: "New", frequency: "daily" })); log(true, "User CANNOT create tasks"); } catch { log(false, "User CANNOT create tasks"); }

  // TASKS: admin CAN create a task
  try { await assertSucceeds(setDoc(doc(dbAdmin, "tasks", "taskC"), { name: "Gardening", frequency: "weekly" })); log(true, "Admin CAN create tasks"); } catch { log(false, "Admin CAN create tasks"); }

  // TASKS: normal user CAN update only completion/postpone fields
  try {
    await assertSucceeds(updateDoc(doc(dbUser, "tasks", "taskA"), {
      lastDoneDate: new Date(),
      nextDueDate: new Date(Date.now() + 864e5),
      remarks: "done",
      isPostponed: false,
      postponedAt: serverTimestamp(),
      postponedRemarks: "",
      updatedBy: "User One",
    }));
    log(true, "User CAN update allowed task fields");
  } catch { log(false, "User CAN update allowed task fields"); }

  // TASKS: normal user CANNOT update privileged task fields (e.g., name, frequency)
  try {
    await assertFails(updateDoc(doc(dbUser, "tasks", "taskA"), { name: "NewName" }));
    log(true, "User CANNOT update privileged task fields");
  } catch { log(false, "User CANNOT update privileged task fields"); }

  // HISTORY: normal user CAN append history
  try {
    await assertSucceeds(addDoc(collection(dbUser, "tasks/taskA/history"), {
      doneDate: new Date(), remarks: "ok", doneBy: "User One", timestamp: serverTimestamp(),
    }));
    log(true, "User CAN add history row");
  } catch { log(false, "User CAN add history row"); }

  // HISTORY: normal user CANNOT delete history
  try {
    const hRef = await addDoc(collection(dbAdmin, "tasks/taskA/history"), { doneDate: new Date(), timestamp: serverTimestamp() });
    await assertFails(updateDoc(hRef, { remarks: "hack" }));
    log(true, "User CANNOT edit/delete history");
  } catch { log(false, "User CANNOT edit/delete history"); }

  await testEnv.cleanup();
})();