import { emailQueue } from "../queues/emailQueue";
import type { EmailJobData } from "../types/job";

/**
 * Enqueue a batch of emails as individual BullMQ delayed jobs.
 *
 * Key design decisions:
 * - Job ID = `email-${emailId}` — deterministic, prevents duplicates on restart
 * - Delay = scheduledAt - now — BullMQ processes the job at the scheduled time
 * - If scheduledAt is in the past, delay is 0 (process immediately)
 * - Uses bulk add for efficiency with large recipient lists
 */
export async function enqueueEmailJobs(
  emailRecords: Array<{
    id: string;
    campaignId: string;
    scheduledAt: Date | string;
  }>
): Promise<void> {
  const now = Date.now();

  const jobs = emailRecords.map((email) => {
    const scheduledAtMs =
      email.scheduledAt instanceof Date
        ? email.scheduledAt.getTime()
        : new Date(email.scheduledAt).getTime();

    // Delay = time until scheduled send. If in the past, send immediately.
    const delay = Math.max(0, scheduledAtMs - now);

    const data: EmailJobData = {
      emailId: email.id,
      campaignId: email.campaignId,
    };

    return {
      name: "send-email",
      data,
      opts: {
        jobId: `email-${email.id}`, // Deterministic — prevents duplicate jobs
        delay,
      },
    };
  });

  // Bulk add is atomic and efficient for large batches
  const added = await emailQueue.addBulk(jobs);

  console.log(
    `[queueService] Enqueued ${added.length} email jobs ` +
      `(campaign: ${emailRecords[0]?.campaignId ?? "unknown"})`
  );
}

/**
 * Remove a specific email job from the queue.
 * Used when cancelling individual emails or campaigns.
 */
export async function removeEmailJob(emailId: string): Promise<void> {
  const jobId = `email-${emailId}`;
  const job = await emailQueue.getJob(jobId);

  if (job) {
    await job.remove();
    console.log(`[queueService] Removed job: ${jobId}`);
  }
}

/**
 * Get the current status of the email queue.
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Idempotently recover pending emails from PostgreSQL on startup/restart.
 *
 * Scans PostgreSQL for emails in 'pending' status and verifies they exist in BullMQ.
 * Because BullMQ uses deterministic job IDs (`email-${emailId}`),
 * jobs already registered in Redis will NOT be duplicated.
 */
export async function recoverPendingEmailJobs(): Promise<number> {
  try {
    const { db } = await import("../db");
    const { emails } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");

    const pendingEmails = await db
      .select({
        id: emails.id,
        campaignId: emails.campaignId,
        scheduledAt: emails.scheduledAt,
      })
      .from(emails)
      .where(eq(emails.status, "pending"));

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log("[queueService] No pending emails to recover on restart");
      return 0;
    }

    console.log(
      `[queueService] Found ${pendingEmails.length} pending email(s) in DB. Verifying BullMQ queue state...`
    );

    let recoveredCount = 0;
    for (const email of pendingEmails) {
      const jobId = `email-${email.id}`;
      const existingJob = await emailQueue.getJob(jobId);

      // If job is already in Redis, do nothing — preserves existing delay and state
      if (!existingJob) {
        const now = Date.now();
        const scheduledAtMs = new Date(email.scheduledAt).getTime();
        const delay = Math.max(0, scheduledAtMs - now);

        await emailQueue.add(
          "send-email",
          { emailId: email.id, campaignId: email.campaignId },
          { jobId, delay }
        );
        recoveredCount++;
      }
    }

    console.log(
      `[queueService] Recovery check complete: ${recoveredCount} re-enqueued, ${
        pendingEmails.length - recoveredCount
      } already persisted in Redis.`
    );
    return recoveredCount;
  } catch (err) {
    console.warn(
      "[queueService] Note: Recovery check skipped (database or Redis not reachable yet):",
      (err as Error).message
    );
    return 0;
  }
}

