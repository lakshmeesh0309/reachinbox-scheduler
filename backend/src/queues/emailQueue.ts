import { Queue } from "bullmq";
import { config } from "../config/index";
import { EMAIL_QUEUE_NAME } from "../types/job";
import type { EmailJobData, EmailJobResult } from "../types/job";

/**
 * Email send queue — BullMQ queue backed by Redis.
 *
 * Configuration:
 * - defaultJobOptions.attempts: 3 retries with exponential backoff
 * - defaultJobOptions.backoff: starts at 5s, doubles each retry
 * - defaultJobOptions.removeOnComplete: keep last 1000 completed jobs
 * - defaultJobOptions.removeOnFail: keep last 5000 failed jobs
 *
 * Jobs are persisted in Redis and survive backend restarts.
 */
export const emailQueue = new Queue<EmailJobData, EmailJobResult>(
  EMAIL_QUEUE_NAME,
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
      maxRetriesPerRequest: null, // Required by BullMQ
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000, // 5s, 10s, 20s
      },
      removeOnComplete: {
        count: 1000,
      },
      removeOnFail: {
        count: 5000,
      },
    },
  }
);

let lastQueueError = 0;
emailQueue.on("error", (err) => {
  const now = Date.now();
  if (now - lastQueueError > 60_000) {
    const errorDetails = (err as Error & { code?: string }).code || err.message || "Redis connection failed";
    console.error("[emailQueue] Queue error:", errorDetails);
    lastQueueError = now;
  }
});

console.log(`[emailQueue] Queue "${EMAIL_QUEUE_NAME}" initialized`);
