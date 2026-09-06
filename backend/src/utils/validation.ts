import type { ScheduleEmailsRequest, ValidationResult } from "../types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export function validateScheduleRequest(
  body: unknown
): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  const req = body as Record<string, unknown>;

  // ─── Required fields ───────────────────────────────────
  if (!req.subject || typeof req.subject !== "string" || req.subject.trim().length === 0) {
    errors.push("subject is required and must be a non-empty string");
  }

  if (!req.body || typeof req.body !== "string" || req.body.trim().length === 0) {
    errors.push("body is required and must be a non-empty string");
  }

  if (!req.senderId || typeof req.senderId !== "string") {
    errors.push("senderId is required and must be a string");
  } else if (!isValidUuid(req.senderId)) {
    errors.push("senderId must be a valid UUID");
  }

  // ─── Recipients ────────────────────────────────────────
  if (!Array.isArray(req.recipients)) {
    errors.push("recipients is required and must be an array of email addresses");
  } else if (req.recipients.length === 0) {
    errors.push("recipients must contain at least one email address");
  } else {
    const invalidEmails: string[] = [];
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const email of req.recipients) {
      if (typeof email !== "string" || !isValidEmail(email)) {
        invalidEmails.push(String(email));
      } else {
        const normalized = email.toLowerCase().trim();
        if (seen.has(normalized)) {
          duplicates.push(normalized);
        }
        seen.add(normalized);
      }
    }

    if (invalidEmails.length > 0) {
      errors.push(`Invalid email addresses: ${invalidEmails.join(", ")}`);
    }
    if (duplicates.length > 0) {
      errors.push(`Duplicate recipients: ${duplicates.join(", ")}`);
    }
  }

  // ─── Start time ────────────────────────────────────────
  if (!req.startTime || typeof req.startTime !== "string") {
    errors.push("startTime is required and must be an ISO 8601 datetime string");
  } else {
    const parsedDate = new Date(req.startTime);
    if (isNaN(parsedDate.getTime())) {
      errors.push("startTime must be a valid ISO 8601 datetime");
    } else if (parsedDate.getTime() < Date.now() - 60_000) {
      // Allow 1 minute of clock skew
      errors.push("startTime must be in the future");
    }
  }

  // ─── Delay ─────────────────────────────────────────────
  if (req.delayBetweenEmailsMs === undefined || req.delayBetweenEmailsMs === null) {
    errors.push("delayBetweenEmailsMs is required");
  } else if (typeof req.delayBetweenEmailsMs !== "number" || !Number.isInteger(req.delayBetweenEmailsMs)) {
    errors.push("delayBetweenEmailsMs must be an integer");
  } else if (req.delayBetweenEmailsMs < 0) {
    errors.push("delayBetweenEmailsMs must be non-negative");
  }

  // ─── Hourly limit ──────────────────────────────────────
  if (req.hourlyLimit === undefined || req.hourlyLimit === null) {
    errors.push("hourlyLimit is required");
  } else if (typeof req.hourlyLimit !== "number" || !Number.isInteger(req.hourlyLimit)) {
    errors.push("hourlyLimit must be an integer");
  } else if (req.hourlyLimit < 1) {
    errors.push("hourlyLimit must be at least 1");
  } else if (req.hourlyLimit > 10000) {
    errors.push("hourlyLimit must not exceed 10000");
  }

  return { valid: errors.length === 0, errors };
}
