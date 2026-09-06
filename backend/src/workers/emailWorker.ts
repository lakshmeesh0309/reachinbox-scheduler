import { Worker, Job, DelayedError } from "bullmq";
import { config } from "../config/index";
import { EMAIL_QUEUE_NAME } from "../types/job";
import type { EmailJobData, EmailJobResult } from "../types/job";
import { db } from "../db";
import { emails, senders } from "../db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "../services/emailSender";
import {
  acquireSenderRateLimitSlot,
  rollbackSenderSlot,
} from "../services/rateLimiter";
import { emailQueue } from "../queues/emailQueue";
import { updateEmailStatusInSearch } from "../services/elasticsearchService";

/**
 * Email worker — processes delayed email jobs from BullMQ, sends
 * emails via Ethereal SMTP with strict idempotency, distributed
 * rate limiting (Redis-backed atomic Lua), and auto-rescheduling.
 */
export function createEmailWorker(): Worker<EmailJobData, EmailJobResult> {
  const worker = new Worker<EmailJobData, EmailJobResult>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData, EmailJobResult>, token?: string) => {
      const { emailId, campaignId } = job.data;
      const startTime = Date.now();

      console.log(
        `[worker] Processing job ${job.id} | email: ${emailId} | campaign: ${campaignId} | attempt: ${job.attemptsMade + 1}`
      );

      // ─── 1. Look up email record ─────────────────────
      const [emailRecord] = await db
        .select()
        .from(emails)
        .where(eq(emails.id, emailId))
        .limit(1);

      if (!emailRecord) {
        console.warn(`[worker] Email record not found: ${emailId}`);
        return {
          emailId,
          success: false,
          message: "Email record not found in database",
          processedAt: new Date().toISOString(),
        };
      }

      // ─── 2. Idempotency check ────────────────────────
      // If already sent, NEVER send again (guards against restarts, duplicate jobs, or retries)
      if (emailRecord.status === "sent") {
        console.log(
          `[worker] 🛡️ Idempotent skip: Email ${emailId} already sent at ${emailRecord.sentAt?.toISOString()}`
        );
        return {
          emailId,
          success: true,
          message: "Already sent (idempotent skip)",
          processedAt: emailRecord.sentAt?.toISOString() || new Date().toISOString(),
        };
      }

      if (emailRecord.status === "cancelled") {
        console.log(`[worker] Email ${emailId} was cancelled — skipping`);
        return {
          emailId,
          success: false,
          message: "Email was cancelled",
          processedAt: new Date().toISOString(),
        };
      }

      // ─── 3. Distributed Rate Limiting & Throttling ───
      // Atomic check via Redis Lua script:
      // a) Minimum delay between individual sends (MIN_EMAIL_DELAY_MS)
      // b) Maximum emails per sender per hour (MAX_EMAILS_PER_HOUR_PER_SENDER)
      // Safe against race conditions across multiple workers, processes, and instances.
      const rateLimitResult = await acquireSenderRateLimitSlot(
        emailRecord.senderId,
        job.id ?? `email-${emailId}`
      );

      if (!rateLimitResult.allowed) {
        // Calculate the next available sending window
        const rescheduleDelayMs = Math.max(1000, rateLimitResult.retryAfterMs);
        const nextWindow = new Date(Date.now() + rescheduleDelayMs);

        console.log(
          `[worker] ⏳ Throttled [${rateLimitResult.reason}] for sender ${emailRecord.senderId}. ` +
            `Rescheduling email ${emailId} to next window in ${rescheduleDelayMs}ms (${nextWindow.toISOString()}). ` +
            `Hourly count: ${rateLimitResult.currentHourlyCount}/${config.worker.maxEmailsPerHourPerSender}`
        );

        // If hourly limit was reached, dispatch real Slack alert asynchronously
        if (rateLimitResult.reason === "hourly_limit") {
          (async () => {
            try {
              const { sendRateLimitSlackNotification } = await import(
                "../services/slackService"
              );
              const { campaigns } = await import("../db/schema");

              const [campaign] = await db
                .select()
                .from(campaigns)
                .where(eq(campaigns.id, emailRecord.campaignId))
                .limit(1);

              const [senderRecord] = emailRecord.senderId
                ? await db
                    .select()
                    .from(senders)
                    .where(eq(senders.id, emailRecord.senderId))
                    .limit(1)
                : [null];

              if (campaign) {
                await sendRateLimitSlackNotification({
                  userId: campaign.userId,
                  senderId: emailRecord.senderId,
                  senderEmail: senderRecord?.email || "unknown@reachinbox.dev",
                  senderName: senderRecord?.name || "Sender",
                  hourlyLimit: config.worker.maxEmailsPerHourPerSender,
                  campaignSubject: campaign.subject,
                  affectedCount: rateLimitResult.currentHourlyCount,
                  nextWindow,
                });
              }
            } catch (slackErr) {
              console.warn(
                "[worker] Slack notification dispatch notice:",
                (slackErr as Error).message
              );
            }
          })().catch(() => {});
        }

        // Update database: do NOT fail, do NOT drop, do NOT mark as sent!
        // Keep status as 'pending' and update scheduledAt to the new window to preserve ordering.
        await db
          .update(emails)
          .set({
            status: "pending",
            scheduledAt: nextWindow,
            updatedAt: new Date(),
          })
          .where(eq(emails.id, emailId));

        updateEmailStatusInSearch(emailId, {
          status: "pending",
          scheduledAt: nextWindow,
        }).catch(() => {});

        // Reschedule BullMQ delayed job without failing
        if (token) {
          await job.moveToDelayed(Date.now() + rescheduleDelayMs, token);
          throw new DelayedError();
        } else {
          await emailQueue.add(job.name, job.data, {
            jobId: job.id,
            delay: rescheduleDelayMs,
          });
          return {
            emailId,
            success: true,
            message: `Throttled (${rateLimitResult.reason}): Rescheduled to ${nextWindow.toISOString()}`,
            processedAt: new Date().toISOString(),
          };
        }
      }

      // ─── 4. Determine sender address ─────────────────
      let fromAddress = config.smtp.from;
      if (emailRecord.senderId) {
        const [senderRecord] = await db
          .select()
          .from(senders)
          .where(eq(senders.id, emailRecord.senderId))
          .limit(1);

        if (senderRecord) {
          fromAddress = `"${senderRecord.name}" <${senderRecord.email}>`;
        }
      }

      // ─── 5. Mark as sending ──────────────────────────
      await db
        .update(emails)
        .set({
          status: "sending",
          bullmqJobId: job.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, emailId));

      updateEmailStatusInSearch(emailId, { status: "sending" }).catch(() => {});

      // ─── 6. Send through Ethereal SMTP ───────────────
      console.log(
        `[worker] ✉️  Sending via SMTP | from: ${fromAddress} | to: ${emailRecord.recipient} | subject: "${emailRecord.subject}"`
      );

      const sendResult = await sendEmail({
        from: fromAddress,
        to: emailRecord.recipient,
        subject: emailRecord.subject,
        html: emailRecord.body,
      });

      // ─── 7. Handle Send Outcome ──────────────────────
      if (sendResult.success) {
        const sentAt = new Date();
        await db
          .update(emails)
          .set({
            status: "sent",
            sentAt,
            failureReason: null,
            updatedAt: sentAt,
          })
          .where(eq(emails.id, emailId));

        updateEmailStatusInSearch(emailId, { status: "sent", sentAt }).catch(() => {});

        const duration = Date.now() - startTime;
        console.log(
          `[worker] ✅ Job ${job.id} sent successfully in ${duration}ms | email: ${emailId} → ${emailRecord.recipient}` +
            (sendResult.previewUrl ? ` | preview: ${sendResult.previewUrl}` : "")
        );

        return {
          emailId,
          success: true,
          message: `Email sent successfully to ${emailRecord.recipient}`,
          processedAt: sentAt.toISOString(),
        };
      }

      // ─── 8. On Failure: Rollback slot, update DB and allow retry ───
      const failureReason = sendResult.error || "SMTP delivery failure";
      await rollbackSenderSlot(emailRecord.senderId, job.id ?? emailId);

      await db
        .update(emails)
        .set({
          status: "failed",
          failureReason,
          updatedAt: new Date(),
        })
        .where(eq(emails.id, emailId));

      updateEmailStatusInSearch(emailId, {
        status: "failed",
        failureReason,
      }).catch(() => {});

      console.error(
        `[worker] ❌ Job ${job.id} failed to send email ${emailId}: ${failureReason}`
      );

      // Throw error so BullMQ triggers controlled retry with exponential backoff
      throw new Error(`SMTP send failed: ${failureReason}`);
    },
    {
      connection: config.redis.url
        ? {
            url: config.redis.url,
            maxRetriesPerRequest: null,
          }
        : {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            maxRetriesPerRequest: null,
          },
      concurrency: config.worker.concurrency,
    }
  );

  // ─── Worker event handlers ──────────────────────────────

  worker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${err.message}`
    );
  });

  let lastWorkerError = 0;
  worker.on("error", (err) => {
    const now = Date.now();
    if (now - lastWorkerError > 60_000) {
      console.error("[worker] Worker error:", err.message || "Redis connection failed");
      lastWorkerError = now;
    }
  });

  console.log(
    `[worker] Email worker started (concurrency: ${config.worker.concurrency})`
  );

  return worker;
}
