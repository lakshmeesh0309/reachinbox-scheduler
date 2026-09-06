import { Redis } from "ioredis";
import { config } from "../config";

/**
 * Result returned by the atomic rate limiter.
 */
export interface RateLimitResult {
  /**
   * Whether the sender is allowed to send this email now.
   */
  allowed: boolean;

  /**
   * Number of milliseconds to wait before rescheduling/retrying the job.
   * Only relevant when allowed === false.
   */
  retryAfterMs: number;

  /**
   * Reason for the throttle decision:
   * - 'ok': within limits, slot atomically reserved
   * - 'min_delay': violated minimum spacing between individual sends
   * - 'hourly_limit': reached hourly cap; must wait for the sliding window
   */
  reason: "ok" | "min_delay" | "hourly_limit";

  /**
   * Current number of emails sent by this sender in the active 1-hour window.
   */
  currentHourlyCount: number;
}

/**
 * Dedicated Redis client for rate limiting.
 * Singleton instance shared across service calls in this process.
 */
let rateLimiterRedisClient: Redis | null = null;

export function getRateLimiterRedis(): Redis {
  if (!rateLimiterRedisClient) {
    rateLimiterRedisClient = config.redis.url
      ? new Redis(config.redis.url, {
          maxRetriesPerRequest: null,
          lazyConnect: true,
        })
      : new Redis({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          maxRetriesPerRequest: null,
          lazyConnect: true,
        });

    rateLimiterRedisClient.on("error", (err) => {
      console.error("[rateLimiter] Redis connection error:", err.message);
    });
  }
  return rateLimiterRedisClient;
}

/**
 * Atomic Lua script for distributed sender throttling.
 *
 * Why Lua?
 * 1. Redis executes Lua scripts as a single atomic unit (thread-safe).
 * 2. Safe across multiple workers, multiple Node processes, and multiple servers.
 * 3. Eliminates race conditions (TOCTOU: Time-Of-Check to Time-Of-Use) when multiple
 *    workers attempt to dispatch emails from the same sender simultaneously.
 *
 * KEYS[1]: ratelimit:sender:{senderId}:last_sent (String: timestamp of last email send)
 * KEYS[2]: ratelimit:sender:{senderId}:hourly    (Sorted Set: score = timestamp, member = timestamp:jobId)
 *
 * ARGV[1]: now (current Unix timestamp in milliseconds)
 * ARGV[2]: minDelayMs (minimum millisecond interval between sends)
 * ARGV[3]: maxPerHour (maximum emails allowed per sliding 1-hour window)
 * ARGV[4]: jobId (unique identifier for this job, prevents member collisions in ZSET)
 */
export const RATE_LIMIT_LUA_SCRIPT = `
local lastSentKey = KEYS[1]
local hourlyKey   = KEYS[2]

local now        = tonumber(ARGV[1])
local minDelayMs = tonumber(ARGV[2])
local maxPerHour = tonumber(ARGV[3])
local jobId      = ARGV[4]

local oneHourAgo = now - 3600000

-- Step 1: Clean up entries in the hourly sorted set older than 1 hour (sliding window)
redis.call('ZREMRANGEBYSCORE', hourlyKey, 0, oneHourAgo)

-- Step 2: Check hourly rate limit
local hourlyCount = redis.call('ZCARD', hourlyKey)
if hourlyCount >= maxPerHour then
  -- Hourly limit exceeded!
  -- Retrieve the oldest timestamp in the current window to compute when the next slot opens
  local oldest = redis.call('ZRANGE', hourlyKey, 0, 0, 'WITHSCORES')
  local oldestTimestamp = tonumber(oldest[2])
  local waitTimeMs = 3600000
  if oldestTimestamp then
    waitTimeMs = math.max(1000, (oldestTimestamp + 3600000) - now)
  end
  return {0, waitTimeMs, "hourly_limit", hourlyCount}
end

-- Step 3: Check minimum delay between individual sends
local lastSent = redis.call('GET', lastSentKey)
if lastSent then
  local timeSinceLast = now - tonumber(lastSent)
  if timeSinceLast < minDelayMs then
    local waitDelayMs = minDelayMs - timeSinceLast
    return {0, waitDelayMs, "min_delay", hourlyCount}
  end
end

-- Step 4: Both checks passed! Atomically reserve the slot
redis.call('SET', lastSentKey, tostring(now), 'PX', 3600000)
redis.call('ZADD', hourlyKey, now, tostring(now) .. ':' .. jobId)
redis.call('PEXPIRE', hourlyKey, 3600000)

return {1, 0, "ok", hourlyCount + 1}
`;

/**
 * Check and atomically claim a sending quota slot for a sender.
 *
 * If allowed:
 *   - The slot is committed in Redis (lastSent updated, added to hourly sliding window).
 * If rejected:
 *   - Returns retryAfterMs: either time until min_delay expires, or time until
 *     the oldest email in the 1-hour window drops out.
 *
 * @param senderId Sender UUID
 * @param jobId Unique BullMQ job ID
 * @param redis Optional custom Redis instance (for tests / dependency injection)
 * @param now Optional override for current timestamp (for deterministic testing)
 */
export async function acquireSenderRateLimitSlot(
  senderId: string,
  jobId: string,
  redis?: Redis,
  nowOverride?: number
): Promise<RateLimitResult> {
  const client = redis || getRateLimiterRedis();
  if (client.status === "wait") {
    await client.connect();
  }

  const now = nowOverride ?? Date.now();
  const minDelayMs = config.worker.minEmailDelayMs;
  const maxPerHour = config.worker.maxEmailsPerHourPerSender;

  const lastSentKey = `ratelimit:sender:${senderId}:last_sent`;
  const hourlyKey = `ratelimit:sender:${senderId}:hourly`;

  const result = (await client.eval(
    RATE_LIMIT_LUA_SCRIPT,
    2,
    lastSentKey,
    hourlyKey,
    now.toString(),
    minDelayMs.toString(),
    maxPerHour.toString(),
    jobId
  )) as [number, number, string, number];

  const [allowedFlag, retryAfterMs, reason, currentHourlyCount] = result;

  return {
    allowed: allowedFlag === 1,
    retryAfterMs,
    reason: reason as "ok" | "min_delay" | "hourly_limit",
    currentHourlyCount,
  };
}

/**
 * Roll back a reserved rate limit slot in case an unrecoverable failure
 * happens prior to or during actual SMTP dispatch.
 *
 * Ensures dropped or failed jobs do not unfairly consume sender quota.
 */
export async function rollbackSenderSlot(
  senderId: string,
  jobId: string,
  redis?: Redis
): Promise<void> {
  const client = redis || getRateLimiterRedis();
  const hourlyKey = `ratelimit:sender:${senderId}:hourly`;

  try {
    // Find all members ending with :jobId
    const members = await client.zrange(hourlyKey, 0, -1);
    const target = members.find((m) => m.endsWith(`:${jobId}`));
    if (target) {
      await client.zrem(hourlyKey, target);
      console.log(`[rateLimiter] Rolled back slot for sender ${senderId}, job ${jobId}`);
    }
  } catch (err) {
    console.warn(`[rateLimiter] Could not rollback slot: ${(err as Error).message}`);
  }
}
