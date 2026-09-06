import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config/index";
import * as schema from "./schema";

const poolConfig: pg.PoolConfig = config.db.url
  ? {
      connectionString: config.db.url,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new pg.Pool(poolConfig);

export const db = drizzle(pool, { schema });

export { pool };

export async function closeDb(): Promise<void> {
  await pool.end();
  console.log("[db] Connection pool closed");
}
