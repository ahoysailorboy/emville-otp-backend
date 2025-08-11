import fs from "fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

// We will use the compat Firestore API exposed on the testing context,
// so no imports from 'firebase/firestore' are needed.

const PROJECT_ID = "emville-pms-test";
const RULES = fs.readFileSync("./firestore.rules", "utf8");

function log(ok, msg) {
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"} - ${msg}`);
}

(async () => {
  // Point directly at your running emulator (127.0.0.1:8080 from earlier)
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: "127.0.0.1", port: 8080, rules: RULES },
  });

  // Auth contexts
  const normalUid = "user_123";
  const adminUid = "admin_999";

  const normalCtx = testEnv.authenticatedContext(normalUid, {
    email: "user@example.com",
    admin: false,
  });
  const adminCtx = testEnv.authenticatedContext(adminUid, {
    email: "admin@example.com",
    admin: true,
  });
  const anonCtx = testEnv.unauthenticatedContext();

  // Compat Firestore instances bound to contexts
  const dbUser = normalCtx.firestore();
  const dbAdmin = adminCtx.firestore();
  const dbAnon = anonCtx.firestore();

  // Seed data bypassing rules
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await adminDb.doc(`users/${normalUid}`).set({
      uid: normalUid,
      email: "user@example.com",
      role: "user",
      displayName: "User One",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await adminDb.doc(`users/${adminUid}`).set({
      uid: adminUid,
      email: "admin@example.com",
      role: "admin",
      displayName: "Admin Nine",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await adminDb.doc("tasks/taskA").set({
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

  // USERS
  try {
    await assertSucceeds(dbUser.doc(`users/${normalUid}`).get());
    log(true, "User can read own user doc");
  } catch {
    log(false, "User can read own user doc");
  }

  try {
    await assertFails(dbUser.doc(`users/${adminUid}`).get());
    log(true, "User CANNOT read other user doc");
  } catch {
    log(false, "User CANNOT read other user doc");
  }

  try {
    await assertSucceeds(
      dbUser.doc(`users/${normalUid}`).update({
        displayName: "User One Edited",
        updatedAt: new Date(),
      })
    );
    log(true, "User can update only safe profile fields");
  } catch {
    log(false, "User can update only safe profile fields");
  }

  try {
    await assertFails(dbUser.doc(`users/${normalUid}`).update({ role: "admin" }));
    log(true, "User CANNOT change role");
  } catch {
    log(false, "User CANNOT change role");
  }

  try {
    await assertSucceeds(
      dbAdmin.doc(`users/${normalUid}`).update({
        role: "admin",
        updatedAt: new Date(),
      })
    );
    log(true, "Admin CAN change role");
  } catch {
    log(false, "Admin CAN change role");
  }

  // TASKS
  try {
    await assertSucceeds(dbUser.doc("tasks/taskA").get());
    log(true, "Signed-in user can read tasks");
  } catch {
    log(false, "Signed-in user can read tasks");
  }

  try {
    await assertFails(dbUser.doc("tasks/taskB").set({ name: "New", frequency: "daily" }));
    log(true, "User CANNOT create tasks");
  } catch {
    log(false, "User CANNOT create tasks");
  }

  try {
    await assertSucceeds(dbAdmin.doc("tasks/taskC").set({ name: "Gardening", frequency: "weekly" }));
    log(true, "Admin CAN create tasks");
  } catch {
    log(false, "Admin CAN create tasks");
  }

  try {
    await assertSucceeds(
      dbUser.doc("tasks/taskA").update({
        lastDoneDate: new Date(),
        nextDueDate: new Date(Date.now() + 864e5),
        remarks: "done",
        isPostponed: false,
        postponedAt: new Date(),
        postponedRemarks: "",
        updatedBy: "User One",
      })
    );
    log(true, "User CAN update allowed task fields");
  } catch {
    log(false, "User CAN update allowed task fields");
  }

  try {
    await assertFails(dbUser.doc("tasks/taskA").update({ name: "NewName" }));
    log(true, "User CANNOT update privileged task fields");
  } catch {
    log(false, "User CANNOT update privileged task fields");
  }

// HISTORY
try {
  await assertSucceeds(
    dbUser.collection("tasks/taskA/history").add({
      doneDate: new Date(),
      remarks: "ok",
      doneBy: "User One",
      timestamp: new Date(),
    })
  );
  log(true, "User CAN add history row");
} catch {
  log(false, "User CAN add history row");
}

try {
  // Admin creates a history doc
  const hRefAdmin = await dbAdmin.collection("tasks/taskA/history").add({
    doneDate: new Date(),
    timestamp: new Date(),
  });
  // Rebind that path to the USER context and try to edit → should be denied
  const hRefAsUser = dbUser.doc(hRefAdmin.path);
  await assertFails(hRefAsUser.update({ remarks: "hack" }));
  log(true, "User CANNOT edit/delete history");
} catch {
  log(false, "User CANNOT edit/delete history");
}

  await testEnv.cleanup();
})();