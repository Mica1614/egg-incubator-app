// @ts-nocheck
/**
 * lib/firebaseAdmin.js  — Server-side only
 *
 * Initializes the Firebase Admin SDK using service-account credentials
 * stored in environment variables. Used by the background device monitor
 * so it can access Firestore and RTDB without a logged-in user.
 *
 * Required .env.local keys:
 *   FIREBASE_ADMIN_CLIENT_EMAIL  — e.g. firebase-adminsdk-xxx@project-id.iam.gserviceaccount.com
 *   FIREBASE_ADMIN_PRIVATE_KEY   — the private key string from the service account JSON
 *                                  (the -----BEGIN PRIVATE KEY----- block)
 *
 * The project ID and database URL are read from the existing NEXT_PUBLIC_* vars,
 * or fall back to hard-coded values that match your current Firebase project.
 */

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";

// Hard-coded project values — matches your firebase.js client config.
const PROJECT_ID   = "incubator-1c8ed";
const DATABASE_URL = "https://incubator-1c8ed-default-rtdb.firebaseio.com";

let _adminApp = null;

function initAdmin() {
  if (_adminApp) return _adminApp;
  if (getApps().length) {
    _adminApp = getApp();
    return _adminApp;
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey      = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!clientEmail || !rawKey) {
    throw new Error(
      "[firebaseAdmin] Missing FIREBASE_ADMIN_CLIENT_EMAIL or FIREBASE_ADMIN_PRIVATE_KEY in .env.local.\n" +
      "Generate a service account at: Firebase Console → Project Settings → Service Accounts → Generate new private key\n" +
      "Then add FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY to .env.local"
    );
  }

  // Service account JSON private keys have literal \n — replace with actual newlines.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  _adminApp = initializeApp({
    credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }),
    databaseURL: DATABASE_URL,
  });

  return _adminApp;
}

/** Returns the Firebase Admin Realtime Database instance. */
export function getAdminDb() {
  initAdmin();
  return getDatabase();
}

/** Returns the Firebase Admin Auth instance. */
export function getAdminAuth() {
  initAdmin();
  return getAuth();
}

/** Returns the Firebase Admin Firestore instance. */
export function getAdminFirestore() {
  initAdmin();
  return getFirestore();
}
