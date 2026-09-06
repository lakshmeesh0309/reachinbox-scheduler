import { Router } from "express";
import { Client as PgClient } from "pg";
import { Redis } from "ioredis";
import { Client as EsClient } from "@elastic/elasticsearch";
import { config } from "../config/index";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const results: Record<string, string> = {
    status: "ok",
    postgres: "disconnected",
    redis: "disconnected",
    elasticsearch: "disconnected",
  };

  // ─── PostgreSQL ─────────────────────────────────────────
  let pgClient: PgClient | null = null;
  try {
    pgClient = new PgClient({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      connectionTimeoutMillis: 5000,
    });
    await pgClient.connect();
    await pgClient.query("SELECT 1");
    results.postgres = "connected";
  } catch {
    results.status = "degraded";
  } finally {
    if (pgClient) {
      await pgClient.end().catch(() => {});
    }
  }

  // ─── Redis ──────────────────────────────────────────────
  let redis: Redis | null = null;
  try {
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    redis.on("error", () => {}); // Suppress unhandled error events
    await redis.connect();
    await redis.ping();
    results.redis = "connected";
  } catch {
    results.status = "degraded";
  } finally {
    if (redis) {
      redis.disconnect();
    }
  }

  // ─── Elasticsearch ──────────────────────────────────────
  try {
    const esClient = new EsClient({
      node: config.elasticsearch.url,
      requestTimeout: 5000,
    });
    await esClient.ping();
    results.elasticsearch = "connected";
  } catch {
    results.status = "degraded";
  }

  const statusCode = results.status === "ok" ? 200 : 503;
  res.status(statusCode).json(results);
});
