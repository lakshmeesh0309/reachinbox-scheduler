import type { Request, Response } from "express";
import { validateScheduleRequest } from "../utils/validation";
import { scheduleEmails, ServiceError } from "../services/emailScheduler";
import type { ApiError } from "../types";
import { db } from "../db";
import { emails, campaigns } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/emails/schedule
 *
 * Creates an email campaign and schedules individual emails
 * for each recipient with calculated send times.
 */
export async function scheduleEmailsController(
  req: Request,
  res: Response
): Promise<void> {
  const validation = validateScheduleRequest(req.body);

  if (!validation.valid) {
    const error: ApiError = {
      error: "Validation failed",
      details: validation.errors,
    };
    res.status(400).json(error);
    return;
  }

  try {
    const userId = req.user?.id || (req.headers["x-user-id"] as string);

    if (!userId) {
      const error: ApiError = {
        error: "Authentication required",
        details: ["User must be authenticated to schedule campaigns"],
      };
      res.status(401).json(error);
      return;
    }

    const result = await scheduleEmails(userId, req.body);

    res.status(201).json({
      message: "Email campaign scheduled successfully",
      data: result,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      const error: ApiError = { error: err.message };
      res.status(err.statusCode).json(error);
      return;
    }

    console.error("[emailController] Unexpected error:", err);
    const error: ApiError = { error: "Internal server error" };
    res.status(500).json(error);
  }
}

/**
 * GET /api/emails/search
 *
 * Full-text and faceted search across emails using Elasticsearch
 * (with PostgreSQL fallback). Scoped to the authenticated user.
 */
export async function searchEmailsController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id || (req.headers["x-user-id"] as string);

  if (!userId) {
    const error: ApiError = {
      error: "Authentication required",
      details: ["User must be authenticated to search emails"],
    };
    res.status(401).json(error);
    return;
  }

  try {
    const { searchEmails } = await import("../services/elasticsearchService");
    const { q, recipient, sender, subject, body, status, page, limit } = req.query;

    const results = await searchEmails({
      userId,
      q: q ? String(q) : undefined,
      recipient: recipient ? String(recipient) : undefined,
      sender: sender ? String(sender) : undefined,
      subject: subject ? String(subject) : undefined,
      body: body ? String(body) : undefined,
      status: status ? String(status) : undefined,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 10,
    });

    res.json({
      message: "Search completed successfully",
      ...results,
    });
  } catch (err) {
    console.error("[emailController] Search error:", err);
    res.status(500).json({ error: "Internal server error during search" });
  }
}

export interface StoredEmailRecord {
  id: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  sentAt?: Date | null;
  status: string;
  failureReason?: string | null;
  userId: string;
}

export const inMemoryEmailRecords = new Map<string, StoredEmailRecord>();

/**
 * GET /api/emails/:id
 *
 * Retrieves an individual email record.
 * Enforces strict tenant isolation: User A cannot access User B's emails.
 */
export async function getEmailByIdController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id || (req.headers["x-user-id"] as string);

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const emailId = req.params.id;

  let email: StoredEmailRecord | null = null;

  try {
    const rows = await db
      .select({
        id: emails.id,
        campaignId: emails.campaignId,
        senderId: emails.senderId,
        recipient: emails.recipient,
        subject: emails.subject,
        body: emails.body,
        scheduledAt: emails.scheduledAt,
        sentAt: emails.sentAt,
        status: emails.status,
        failureReason: emails.failureReason,
        userId: campaigns.userId,
      })
      .from(emails)
      .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
      .where(eq(emails.id, emailId))
      .limit(1);

    if (rows.length > 0) {
      email = rows[0] as StoredEmailRecord;
      inMemoryEmailRecords.set(emailId, email);
    }
  } catch (err) {
    console.warn("[emailController] DB query fallback:", (err as Error).message);
    email = inMemoryEmailRecords.get(emailId) || null;
  }

  if (!email) {
    res.status(404).json({ error: "Email not found" });
    return;
  }

  // Multi-tenant check: email's campaign must belong to authenticated user
  if (email.userId !== userId) {
    res.status(403).json({
      error: "Forbidden",
      details: ["You do not have permission to access another user's email"],
    });
    return;
  }

  res.json({
    email: {
      id: email.id,
      campaignId: email.campaignId,
      senderId: email.senderId,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt || null,
      status: email.status,
      failureReason: email.failureReason || null,
    },
  });
}
