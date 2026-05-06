// @ts-nocheck
/**
 * cleanup-no-device.mjs
 *
 * Removes records from egg_batches, chick_inventory (and optionally egg_scans)
 * that have no deviceId field set.
 *
 * Run: node cleanup-no-device.mjs
 *
 * Requires a .env.local file (or environment variables) with:
 *   NEXT_PUBLIC_FIREBASE_API_KEY
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID
 *   NEXT_PUBLIC_FIREBASE_APP_ID
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── load .env.local manually ─────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envFile = readFileSync(resolve(__dirname, ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.warn("No .env.local found — using environment variables.");
}

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanCollection(collectionName) {
  console.log(`\n📦 Scanning ${collectionName}…`);
  const snap = await getDocs(collection(db, collectionName));
  const toDelete = snap.docs.filter((d) => {
    const data = d.data();
    return !data.deviceId || String(data.deviceId).trim() === "";
  });

  if (toDelete.length === 0) {
    console.log(`   ✅ No orphaned records found.`);
    return 0;
  }

  console.log(`   Found ${toDelete.length} record(s) without deviceId:`);
  for (const d of toDelete) {
    const data = d.data();
    const label =
      data.batchId || data.batch_id || d.id.substring(0, 12);
    console.log(`   - ${label} (doc id: ${d.id})`);
  }

  const answer = await prompt(
    `\n   Delete these ${toDelete.length} record(s) from ${collectionName}? (yes/no) `
  );

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("   ⏭  Skipped.");
    return 0;
  }

  let deleted = 0;
  for (const d of toDelete) {
    await deleteDoc(doc(db, collectionName, d.id));
    deleted++;
  }
  console.log(`   🗑  Deleted ${deleted} record(s).`);
  return deleted;
}

// ── simple readline prompt ────────────────────────────────────────────────────
function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (data) => {
      process.stdin.pause();
      resolve(data.toString());
    });
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== EggCubator — Orphaned Record Cleanup ===");
  console.log("Removes egg_batches, chick_inventory records with no deviceId.\n");

  let total = 0;
  total += await cleanCollection("egg_batches");
  total += await cleanCollection("chick_inventory");

  const also = await prompt("\nAlso clean egg_scans with no batchId? (yes/no) ");
  if (also.trim().toLowerCase() === "yes") {
    console.log("\n📦 Scanning egg_scans…");
    const snap = await getDocs(collection(db, "egg_scans"));
    const toDelete = snap.docs.filter((d) => {
      const data = d.data();
      return !data.batchId || String(data.batchId).trim() === "";
    });
    if (toDelete.length === 0) {
      console.log("   ✅ No orphaned scan records found.");
    } else {
      console.log(`   Found ${toDelete.length} scan(s) without batchId.`);
      const confirm2 = await prompt(`   Delete them? (yes/no) `);
      if (confirm2.trim().toLowerCase() === "yes") {
        for (const d of toDelete) await deleteDoc(doc(db, "egg_scans", d.id));
        console.log(`   🗑  Deleted ${toDelete.length} record(s).`);
        total += toDelete.length;
      } else {
        console.log("   ⏭  Skipped.");
      }
    }
  }

  console.log(`\n✅ Done. Total deleted: ${total}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
