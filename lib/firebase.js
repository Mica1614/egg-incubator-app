// @ts-nocheck
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC7eCkFuytEBekMxjzmRU0bQ9UDsddTc4o",
  authDomain: "incubator-1c8ed.firebaseapp.com",
  databaseURL: "https://incubator-1c8ed-default-rtdb.firebaseio.com",
  projectId: "incubator-1c8ed",
  storageBucket: "incubator-1c8ed.firebasestorage.app",
  messagingSenderId: "663863094100",
  appId: "1:663863094100:web:72c91172d7102c8015f6c1",
  measurementId: "G-VKVS8R7HY4",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);
const storage = getStorage(app);

let analytics = null;

if (typeof window !== "undefined") {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

export { app, auth, db, firestore, storage, analytics };
