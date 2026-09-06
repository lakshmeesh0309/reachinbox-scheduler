import { db, pool } from "../db";
import { campaigns, emails, senders } from "../db/schema";
import { eq } from "drizzle-orm";
import type {
  ScheduleEmailsRequest,
  ScheduleEmailsResponse,
  NewEmail,
} from "../types";
import { enqueueEmailJobs } from "./queueService";

export async function scheduleEmails(
  userId: string,
  request: ScheduleEmailsRequest
): Promise<ScheduleEmailsResponse> {
  const startTime = new Date(request.startTime);

  // ─── Verify sender exists and belongs to user ──────────
  const [sender] = await db
    .select()
    .from(senders)
    .where(eq(senders.id, request.senderId))
    .limit(1);

  if (!sender) {
    throw new ServiceError("Sender not found", 404);
  }

  if (sender.userId !== userId) {
    throw new ServiceError("Sender does not belong to this user", 403);
  }

  if (!sender.isActive) {
    throw new ServiceError("Sender is not active", 400);
  }

  // ─── Calculate scheduled times ─────────────────────────
  const emailRecords: NewEmail[] = request.recipients.map(
    (recipient, index) => ({
      campaignId: "", // Will be set after campaign creation
      senderId: request.senderId,
      recipient: recipient.toLowerCase().trim(),
      subject: request.subject,
      body: request.body,
      scheduledAt: new Date(
        startTime.getTime() + index * request.delayBetweenEmailsMs
      ),
      status: "pending" as const,
    })
  );

  // ─── Transaction: create campaign + all emails ─────────
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create campaign
    const campaignResult = await client.query(
      `INSERT INTO campaigns (user_id, subject, body, start_time, delay_between_emails_ms, hourly_limit, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, created_at`,
      [
        userId,
        request.subject,
        request.body,
        startTime.toISOString(),
        request.delayBetweenEmailsMs,
        request.hourlyLimit,
        "scheduled",
      ]
    );

    const campaign = campaignResult.rows[0];
    const campaignId = campaign.id;

    // Assign campaign ID to all email records
    for (const record of emailRecords) {
      record.campaignId = campaignId;
    }

    // Batch insert emails — build parameterized query for safety
    if (emailRecords.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const email of emailRecords) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );
        values.push(
          email.campaignId,
          email.senderId,
          email.recipient,
          email.subject,
          email.body,
          email.scheduledAt instanceof Date
            ? email.scheduledAt.toISOString()
            : email.scheduledAt,
          email.status
        );
      }

      const insertResult = await client.query(
        `INSERT INTO emails (campaign_id, sender_id, recipient, subject, body, scheduled_at, status)
         VALUES ${placeholders.join(", ")}
         RETURNING id, recipient, scheduled_at, status`,
        values
      );

      await client.query("COMMIT");

      // ─── Enqueue BullMQ delayed jobs ─────────────────
      const emailsToEnqueue = insertResult.rows.map(
        (row: { id: string; scheduled_at: string }) => ({
          id: row.id,
          campaignId,
          scheduledAt: new Date(row.scheduled_at),
        })
      );

      await enqueueEmailJobs(emailsToEnqueue);

      // ─── Index newly scheduled emails in Elasticsearch ────────
      // Elasticsearch is purely a search layer — failures never corrupt PostgreSQL data
      const { indexEmailsBatch } = await import("./elasticsearchService");
      const docsToIndex = insertResult.rows.map(
        (row: { id: string; recipient: string; scheduled_at: string; status: string }) => ({
          id: row.id,
          userId,
          campaignId,
          senderId: request.senderId,
          senderEmail: sender.email,
          senderName: sender.name,
          recipient: row.recipient,
          subject: request.subject,
          body: request.body,
          status: row.status,
          failureReason: null,
          scheduledAt: new Date(row.scheduled_at).toISOString(),
          sentAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      indexEmailsBatch(docsToIndex).catch((err) => {
        console.warn("[emailScheduler] Elasticsearch indexing skipped:", err.message);
      });

      // ─── Build response ──────────────────────────────
      const lastEmail = emailRecords[emailRecords.length - 1];
      const estimatedEndTime =
        lastEmail.scheduledAt instanceof Date
          ? lastEmail.scheduledAt
          : new Date(lastEmail.scheduledAt);

      return {
        campaignId,
        status: "scheduled",
        totalEmails: insertResult.rows.length,
        startTime: startTime.toISOString(),
        estimatedEndTime: estimatedEndTime.toISOString(),
        emails: insertResult.rows.map(
          (row: {
            id: string;
            recipient: string;
            scheduled_at: string;
            status: string;
          }) => ({
            id: row.id,
            recipient: row.recipient,
            scheduledAt: new Date(row.scheduled_at).toISOString(),
            status: row.status as "pending",
          })
        ),
      };
    }

    await client.query("COMMIT");

    return {
      campaignId,
      status: "scheduled",
      totalEmails: 0,
      startTime: startTime.toISOString(),
      estimatedEndTime: startTime.toISOString(),
      emails: [],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Custom error class for service-level errors ──────────

export class ServiceError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
  }
}
