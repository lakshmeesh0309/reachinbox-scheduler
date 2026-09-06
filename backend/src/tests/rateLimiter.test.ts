import RedisMock from "ioredis-mock";
import type { Redis } from "ioredis";
import {
  acquireSenderRateLimitSlot,
  rollbackSenderSlot,
  RATE_LIMIT_LUA_SCRIPT,
} from "../services/rateLimiter";
import { config } from "../config";

/**
 * Test Suite: Distributed Production-Style Email Throttling & Rate Limiting
 *
 * Covers:
 * 1. Under limit
 * 2. Exactly at limit
 * 3. Over limit
 * 4. Concurrent workers (race condition safety)
 * 5. Next-hour rescheduling (sliding window recovery)
 */
async function runRateLimiterTests() {
  console.log("===============================================================");
  console.log(" ReachInbox: Email Throttling & Rate Limiter Test Suite       ");
  console.log("===============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  // Use ioredis-mock instance for isolated in-memory testing
  const redis = new RedisMock() as unknown as Redis;

  const senderId = "sender-test-uuid-1234";

  // Override config for test predictability
  const originalMinDelay = config.worker.minEmailDelayMs;
  const originalMaxHourly = config.worker.maxEmailsPerHourPerSender;

  // Set test thresholds: 5 emails per hour, 100ms min delay
  (config.worker as { minEmailDelayMs: number }).minEmailDelayMs = 100;
  (config.worker as { maxEmailsPerHourPerSender: number }).maxEmailsPerHourPerSender = 5;

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Under Limit
    // ─────────────────────────────────────────────────────────────
    console.log("🧪 TEST 1: Under Limit (Sender sends fewer than max limit)");
    await redis.flushall();

    const baseTime = 1700000000000; // Fixed starting epoch timestamp

    const res1 = await acquireSenderRateLimitSlot(senderId, "job-1", redis, baseTime);
    assert(res1.allowed === true, "Email 1 allowed under limit");
    assert(res1.reason === "ok", "Email 1 reason is 'ok'");
    assert(res1.currentHourlyCount === 1, "Hourly count is 1");

    // Send 2nd email after min delay (150ms later)
    const res2 = await acquireSenderRateLimitSlot(senderId, "job-2", redis, baseTime + 150);
    assert(res2.allowed === true, "Email 2 allowed under limit");
    assert(res2.currentHourlyCount === 2, "Hourly count is 2");

    // Send 3rd email after min delay (300ms later)
    const res3 = await acquireSenderRateLimitSlot(senderId, "job-3", redis, baseTime + 300);
    assert(res3.allowed === true, "Email 3 allowed under limit");
    assert(res3.currentHourlyCount === 3, "Hourly count is 3");
    console.log();

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Exactly At Limit
    // ─────────────────────────────────────────────────────────────
    console.log("🧪 TEST 2: Exactly At Limit (Sender sends up to max hourly cap)");
    // Send 4th email
    const res4 = await acquireSenderRateLimitSlot(senderId, "job-4", redis, baseTime + 450);
    assert(res4.allowed === true, "Email 4 allowed");
    assert(res4.currentHourlyCount === 4, "Hourly count is 4");

    // Send 5th email (reaches cap of 5)
    const res5 = await acquireSenderRateLimitSlot(senderId, "job-5", redis, baseTime + 600);
    assert(res5.allowed === true, "Email 5 allowed exactly at limit");
    assert(res5.currentHourlyCount === 5, "Hourly count is exactly 5/5");
    console.log();

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Over Limit
    // ─────────────────────────────────────────────────────────────
    console.log("🧪 TEST 3: Over Limit (Sender exceeds max hourly cap)");
    // Attempt 6th email within the same hour window (e.g. 1000ms from baseTime)
    const res6 = await acquireSenderRateLimitSlot(senderId, "job-6", redis, baseTime + 1000);
    assert(res6.allowed === false, "Email 6 rejected when over limit");
    assert(res6.reason === "hourly_limit", "Reason indicates 'hourly_limit'");
    assert(res6.retryAfterMs > 0, `Returns positive retryAfterMs (${res6.retryAfterMs}ms)`);

    // Verify retryAfterMs points to when the 1st email expires (+ 1 hour = 3600000ms)
    // baseTime + 3600000 - (baseTime + 1000) = 3599000ms
    const expectedWait = 3600000 - 1000;
    assert(
      Math.abs(res6.retryAfterMs - expectedWait) <= 1000,
      `retryAfterMs correctly targets oldest slot expiration (${res6.retryAfterMs}ms ≈ ${expectedWait}ms)`
    );
    console.log();

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Concurrent Workers (Race Condition Safety)
    // ─────────────────────────────────────────────────────────────
    console.log("🧪 TEST 4: Concurrent Workers (Simultaneous requests at same millisecond)");
    await redis.flushall();

    const concurrentSender = "sender-concurrent-uuid";
    const concurrentTime = 1700000050000;

    // 5 concurrent workers attempting to send for the same sender simultaneously
    const workerPromises = [
      acquireSenderRateLimitSlot(concurrentSender, "worker-job-A", redis, concurrentTime),
      acquireSenderRateLimitSlot(concurrentSender, "worker-job-B", redis, concurrentTime),
      acquireSenderRateLimitSlot(concurrentSender, "worker-job-C", redis, concurrentTime),
      acquireSenderRateLimitSlot(concurrentSender, "worker-job-D", redis, concurrentTime),
      acquireSenderRateLimitSlot(concurrentSender, "worker-job-E", redis, concurrentTime),
    ];

    const concurrentResults = await Promise.all(workerPromises);

    const allowedWorkers = concurrentResults.filter((r) => r.allowed);
    const throttledWorkers = concurrentResults.filter((r) => !r.allowed);

    assert(
      allowedWorkers.length === 1,
      `Exactly 1 worker acquired the slot (got ${allowedWorkers.length})`
    );
    assert(
      throttledWorkers.length === 4,
      `Remaining 4 workers were atomically throttled (got ${throttledWorkers.length})`
    );
    assert(
      throttledWorkers.every((r) => r.reason === "min_delay"),
      "Throttled workers received 'min_delay' reason"
    );
    assert(
      throttledWorkers.every((r) => r.retryAfterMs === 100),
      "Throttled workers received exact min_delay wait time (100ms)"
    );
    console.log();

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Next-Hour Rescheduling
    // ─────────────────────────────────────────────────────────────
    console.log("🧪 TEST 5: Next-Hour Rescheduling (Sliding window advances past 1 hour)");
    const test5Sender = "sender-next-hour-uuid";
    const t5Base = 1700000000000;

    // Fill up all 5 slots for test5Sender
    for (let i = 1; i <= 5; i++) {
      await acquireSenderRateLimitSlot(test5Sender, `t5-job-${i}`, redis, t5Base + i * 150);
    }

    // Verify it is blocked right now
    const blockedNow = await acquireSenderRateLimitSlot(test5Sender, "t5-job-blocked", redis, t5Base + 1000);
    assert(blockedNow.allowed === false, "Sender is blocked immediately at 5/5 limit");
    assert(blockedNow.reason === "hourly_limit", "Reason is 'hourly_limit'");

    // Advance time by 1 hour + 200ms past the 1st email:
    // Email 1 was at t5Base + 150.
    // At t5Base + 150 + 3600000 + 10ms, email 1 expires, opening 1 slot!
    const nextHourTime = t5Base + 150 + 3600000 + 10;

    const resAfterHour = await acquireSenderRateLimitSlot(test5Sender, "job-next-hour", redis, nextHourTime);
    assert(
      resAfterHour.allowed === true,
      "Allowed to send in the next hour after sliding window rolls over"
    );
    assert(resAfterHour.reason === "ok", "Reason is 'ok'");
    // Email 1 dropped out, emails 2..5 remained (4) + this new email = 5
    assert(
      resAfterHour.currentHourlyCount === 5,
      `Sliding window correctly pruned expired emails (current count: ${resAfterHour.currentHourlyCount})`
    );
    console.log();

    // ─────────────────────────────────────────────────────────────
    // TEST SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log("===============================================================");
    console.log(` RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log("===============================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Restore config
    (config.worker as { minEmailDelayMs: number }).minEmailDelayMs = originalMinDelay;
    (config.worker as { maxEmailsPerHourPerSender: number }).maxEmailsPerHourPerSender = originalMaxHourly;
  }
}

runRateLimiterTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
