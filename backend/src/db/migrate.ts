import { db, closeDb } from "./index";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("[migrate] Running migrations...");

  // Create tables using Drizzle push (schema sync)
  // For production, use generated SQL migrations via drizzle-kit
  try {
    const result = await db.execute(sql`SELECT 1`);
    console.log("[migrate] Database connection verified");
  } catch (err) {
    console.error("[migrate] ❌ Cannot connect to database:", err);
    process.exit(1);
  }

  await closeDb();
  console.log("[migrate] ✅ Migration check complete");
}

migrate().catch((err) => {
  console.error("[migrate] ❌ Migration failed:", err);
  process.exit(1);
});
