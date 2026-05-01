// @ts-nocheck
/**
 * Test Data Seeder for EggCubator Hatch Tracking System
 * 
 * This script creates sample egg batches at different stages:
 * - Active batches (currently incubating)
 * - Ready to hatch batches
 * - Completed batches (with hatch results)
 * - Chick inventory records
 * 
 * Run this to quickly populate your database with test data.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Helper function to add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Get today's date
const today = new Date();

// Test Data: Egg Batches at Different Stages
const testBatches = [
  // ACTIVE BATCHES (Currently Incubating)
  {
    batchId: "TEST-001",
    eggType: "Chicken",
    totalEggs: 100,
    startDate: addDays(today, -10), // Started 10 days ago
    incubationDays: 21,
    status: "active",
    progress: 48, // ~48% through incubation
    daysLeft: 11,
  },
  {
    batchId: "TEST-002",
    eggType: "Duck",
    totalEggs: 50,
    startDate: addDays(today, -15), // Started 15 days ago
    incubationDays: 28,
    status: "active",
    progress: 54, // ~54% through incubation
    daysLeft: 13,
  },
  {
    batchId: "TEST-003",
    eggType: "Native Chicken",
    totalEggs: 75,
    startDate: addDays(today, -5), // Started 5 days ago
    incubationDays: 21,
    status: "active",
    progress: 24, // ~24% through incubation
    daysLeft: 16,
  },
  
  // READY TO HATCH (Due date reached)
  {
    batchId: "TEST-004",
    eggType: "Chicken",
    totalEggs: 120,
    startDate: addDays(today, -21), // Started 21 days ago
    incubationDays: 21,
    status: "ready_to_hatch",
    progress: 100,
    daysLeft: 0,
  },
  {
    batchId: "TEST-005",
    eggType: "Duck",
    totalEggs: 60,
    startDate: addDays(today, -28), // Started 28 days ago
    incubationDays: 28,
    status: "ready_to_hatch",
    progress: 100,
    daysLeft: 0,
  },
  
  // COMPLETED BATCHES (With hatch results)
  {
    batchId: "TEST-006",
    eggType: "Chicken",
    totalEggs: 100,
    startDate: addDays(today, -30), // Started 30 days ago
    incubationDays: 21,
    hatchedEggs: 82,
    failedToHatch: 18,
    hatchRate: 82.0,
    hatchDate: addDays(today, -9), // Hatched 9 days ago
    status: "completed",
    progress: 100,
    daysLeft: 0,
  },
  {
    batchId: "TEST-007",
    eggType: "Duck",
    totalEggs: 50,
    startDate: addDays(today, -35), // Started 35 days ago
    incubationDays: 28,
    hatchedEggs: 45,
    failedToHatch: 5,
    hatchRate: 90.0,
    hatchDate: addDays(today, -7), // Hatched 7 days ago
    status: "completed",
    progress: 100,
    daysLeft: 0,
  },
  {
    batchId: "TEST-008",
    eggType: "Native Chicken",
    totalEggs: 80,
    startDate: addDays(today, -25), // Started 25 days ago
    incubationDays: 21,
    hatchedEggs: 68,
    failedToHatch: 12,
    hatchRate: 85.0,
    hatchDate: addDays(today, -4), // Hatched 4 days ago
    status: "completed",
    progress: 100,
    daysLeft: 0,
  },
  {
    batchId: "TEST-009",
    eggType: "Broiler",
    totalEggs: 150,
    startDate: addDays(today, -28), // Started 28 days ago
    incubationDays: 21,
    hatchedEggs: 135,
    failedToHatch: 15,
    hatchRate: 90.0,
    hatchDate: addDays(today, -7), // Hatched 7 days ago
    status: "completed",
    progress: 100,
    daysLeft: 0,
  },
];

// Test Data: Chick Inventory (auto-created from completed batches)
const testChickInventory = [
  {
    batch_id: "TEST-006",
    egg_type: "Chicken",
    total_eggs_set: 100,
    total_chicks: 82,
    failed_to_hatch: 18,
    available_chicks: 82,
    sold_chicks: 0,
    hatch_rate: 82.0,
    hatch_date: addDays(today, -9),
  },
  {
    batch_id: "TEST-007",
    egg_type: "Duck",
    total_eggs_set: 50,
    total_chicks: 45,
    failed_to_hatch: 5,
    available_chicks: 45,
    sold_chicks: 0,
    hatch_rate: 90.0,
    hatch_date: addDays(today, -7),
  },
  {
    batch_id: "TEST-008",
    egg_type: "Native Chicken",
    total_eggs_set: 80,
    total_chicks: 68,
    failed_to_hatch: 12,
    available_chicks: 68,
    sold_chicks: 0,
    hatch_rate: 85.0,
    hatch_date: addDays(today, -4),
  },
  {
    batch_id: "TEST-009",
    egg_type: "Broiler",
    total_eggs_set: 150,
    total_chicks: 135,
    failed_to_hatch: 15,
    available_chicks: 135,
    sold_chicks: 0,
    hatch_rate: 90.0,
    hatch_date: addDays(today, -7),
  },
  // Example with some sales already made
  {
    batch_id: "TEST-010",
    egg_type: "Chicken",
    total_eggs_set: 100,
    total_chicks: 85,
    failed_to_hatch: 15,
    available_chicks: 35, // Started with 85, sold 50
    sold_chicks: 50,
    hatch_rate: 85.0,
    hatch_date: addDays(today, -15),
  },
];

// Seed Egg Batches
async function seedEggBatches() {
  console.log("🥚 Seeding Egg Batches...");
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const batch of testBatches) {
    try {
      await addDoc(collection(db, "egg_batches"), {
        ...batch,
        startDate: Timestamp.fromDate(batch.startDate),
        hatchingDate: Timestamp.fromDate(addDays(batch.startDate, batch.incubationDays)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log(`✅ Created batch: ${batch.batchId} (${batch.eggType} - ${batch.totalEggs} eggs)`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error creating batch ${batch.batchId}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Egg Batches Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📦 Total: ${testBatches.length}\n`);
}

// Seed Chick Inventory
async function seedChickInventory() {
  console.log("🐣 Seeding Chick Inventory...");
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const inventory of testChickInventory) {
    try {
      await addDoc(collection(db, "chick_inventory"), {
        ...inventory,
        hatch_date: Timestamp.fromDate(inventory.hatch_date),
        createdAt: serverTimestamp(),
      });
      console.log(`✅ Created inventory: ${inventory.batch_id} (${inventory.egg_type} - ${inventory.available_chicks} available)`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error creating inventory ${inventory.batch_id}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\n📊 Chick Inventory Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📦 Total: ${testChickInventory.length}\n`);
}

// Main seed function
async function seedTestData() {
  console.log("🚀 Starting EggCubator Test Data Seeder...\n");
  console.log("=" .repeat(60));
  console.log("");
  
  try {
    // Seed egg batches
    await seedEggBatches();
    
    console.log("=" .repeat(60));
    console.log("");
    
    // Seed chick inventory
    await seedChickInventory();
    
    console.log("=" .repeat(60));
    console.log("");
    console.log("🎉 Test data seeding complete!");
    console.log("");
    console.log("📋 What to check:");
    console.log("   1. Go to /egg-batches page");
    console.log("   2. You should see:");
    console.log("      • 3 Active batches (TEST-001, TEST-002, TEST-003)");
    console.log("      • 2 Ready to Hatch (TEST-004, TEST-005)");
    console.log("      • 4 Completed batches (TEST-006 to TEST-009)");
    console.log("   3. Click 'Track Hatch' on TEST-004 or TEST-005");
    console.log("   4. View completed batches to see hatch results");
    console.log("   5. Go to /chick-inventory page");
    console.log("   6. You should see 5 inventory records");
    console.log("   7. Check dashboard for updated statistics");
    console.log("");
    console.log("🧪 Test Scenarios:");
    console.log("   • Track hatch for TEST-004 (120 chicken eggs)");
    console.log("   • Track hatch for TEST-005 (60 duck eggs)");
    console.log("   • Sell chicks from any inventory");
    console.log("   • View batch history and reports");
    console.log("");
    
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Run the seeder
seedTestData();
