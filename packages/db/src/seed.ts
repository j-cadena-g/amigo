import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import {
  households,
  users,
  transactions,
  groceryItems,
} from "./schema";

const DEMO_HOUSEHOLD_NAME = "Demo Household";

// Transaction categories with typical amounts
const expenseCategories = [
  { category: "Food", minAmount: 15, maxAmount: 150 },
  { category: "Rent", minAmount: 1200, maxAmount: 1500 },
  { category: "Utilities", minAmount: 50, maxAmount: 200 },
  { category: "Transportation", minAmount: 20, maxAmount: 100 },
  { category: "Entertainment", minAmount: 10, maxAmount: 80 },
  { category: "Healthcare", minAmount: 20, maxAmount: 300 },
  { category: "Shopping", minAmount: 25, maxAmount: 200 },
];

const incomeCategories = [
  { category: "Salary", minAmount: 3000, maxAmount: 5000 },
  { category: "Freelance", minAmount: 200, maxAmount: 1000 },
  { category: "Refund", minAmount: 10, maxAmount: 100 },
];

// Grocery items with categories
const groceryItemsData = [
  { name: "Milk", category: "Dairy", purchased: true },
  { name: "Eggs", category: "Dairy", purchased: true },
  { name: "Bread", category: "Bakery", purchased: false },
  { name: "Apples", category: "Produce", purchased: false },
  { name: "Bananas", category: "Produce", purchased: true },
  { name: "Chicken Breast", category: "Meat", purchased: false },
  { name: "Ground Beef", category: "Meat", purchased: true },
  { name: "Rice", category: "Grains", purchased: false },
  { name: "Pasta", category: "Grains", purchased: false },
  { name: "Tomatoes", category: "Produce", purchased: false },
  { name: "Onions", category: "Produce", purchased: true },
  { name: "Butter", category: "Dairy", purchased: false },
  { name: "Cheese", category: "Dairy", purchased: true },
  { name: "Orange Juice", category: "Beverages", purchased: false },
  { name: "Coffee", category: "Beverages", purchased: true },
];

function randomAmount(min: number, max: number): string {
  const amount = Math.random() * (max - min) + min;
  return amount.toFixed(2);
}

function randomDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  return date;
}

async function seed() {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    console.error("DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  console.log("Connecting to database...");
  const client = postgres(connectionString);
  const db = drizzle(client);

  try {
    // Check if Demo Household exists
    const existingHousehold = await db
      .select()
      .from(households)
      .where(eq(households.name, DEMO_HOUSEHOLD_NAME))
      .limit(1);

    let householdId: string;
    let userId: string;

    if (existingHousehold.length > 0 && existingHousehold[0]) {
      console.log("Demo Household already exists. Using existing household.");
      householdId = existingHousehold[0].id;

      // Get existing user
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.householdId, householdId))
        .limit(1);

      if (existingUser.length === 0 || !existingUser[0]) {
        console.error("No user found for Demo Household");
        process.exit(1);
      }

      userId = existingUser[0].id;
    } else {
      console.log("Creating Demo Household...");

      // Create household
      const insertedHouseholds = await db
        .insert(households)
        .values({ name: DEMO_HOUSEHOLD_NAME })
        .returning();

      const newHousehold = insertedHouseholds[0];
      if (!newHousehold) {
        throw new Error("Failed to create household");
      }
      householdId = newHousehold.id;

      // Create demo user
      const insertedUsers = await db
        .insert(users)
        .values({
          authId: `demo-user-${Date.now()}`,
          email: "demo@example.com",
          name: "Demo User",
          householdId,
        })
        .returning();

      const newUser = insertedUsers[0];
      if (!newUser) {
        throw new Error("Failed to create user");
      }
      userId = newUser.id;

      console.log("Created Demo Household and User");
    }

    // Check existing transaction count
    const existingTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, householdId));

    if (existingTransactions.length >= 50) {
      console.log(`Already have ${existingTransactions.length} transactions. Skipping transaction seeding.`);
    } else {
      console.log("Seeding transactions...");

      const transactionsToInsert: Array<{
        householdId: string;
        userId: string;
        amount: string;
        category: string;
        description: string;
        type: "income" | "expense";
        date: Date;
      }> = [];

      // Generate 50+ transactions over the last 30 days
      for (let i = 0; i < 55; i++) {
        const isExpense = Math.random() > 0.15; // 85% expenses

        if (isExpense) {
          const catIndex = Math.floor(Math.random() * expenseCategories.length);
          const cat = expenseCategories[catIndex] ?? expenseCategories[0]!;
          transactionsToInsert.push({
            householdId,
            userId,
            amount: randomAmount(cat.minAmount, cat.maxAmount),
            category: cat.category,
            description: `${cat.category} expense`,
            type: "expense",
            date: randomDate(30),
          });
        } else {
          const catIndex = Math.floor(Math.random() * incomeCategories.length);
          const cat = incomeCategories[catIndex] ?? incomeCategories[0]!;
          transactionsToInsert.push({
            householdId,
            userId,
            amount: randomAmount(cat.minAmount, cat.maxAmount),
            category: cat.category,
            description: `${cat.category} payment`,
            type: "income",
            date: randomDate(30),
          });
        }
      }

      await db.insert(transactions).values(transactionsToInsert);
      console.log(`Inserted ${transactionsToInsert.length} transactions`);
    }

    // Check existing grocery items
    const existingGroceryItems = await db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.householdId, householdId));

    if (existingGroceryItems.length >= 10) {
      console.log(`Already have ${existingGroceryItems.length} grocery items. Skipping grocery seeding.`);
    } else {
      console.log("Seeding grocery items...");

      const groceryToInsert = groceryItemsData.map((item) => ({
        householdId,
        createdByUserId: userId,
        itemName: item.name,
        category: item.category,
        isPurchased: item.purchased,
      }));

      await db.insert(groceryItems).values(groceryToInsert);
      console.log(`Inserted ${groceryToInsert.length} grocery items`);
    }

    console.log("Seed completed successfully!");
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
