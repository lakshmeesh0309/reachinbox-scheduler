import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "reachinbox",
    password: process.env.DB_PASSWORD || "reachinbox_secret",
    database: process.env.DB_NAME || "reachinbox",
  },
  verbose: true,
  strict: true,
});
