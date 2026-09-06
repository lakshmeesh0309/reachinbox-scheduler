import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  users,
  senders,
  campaigns,
  emails,
  slackConnections,
} from "../db/schema";

// ─── Select types (read from DB) ────────────────────────────
export type User = InferSelectModel<typeof users>;
export type Sender = InferSelectModel<typeof senders>;
export type Campaign = InferSelectModel<typeof campaigns>;
export type Email = InferSelectModel<typeof emails>;
export type SlackConnection = InferSelectModel<typeof slackConnections>;

// ─── Insert types (write to DB) ─────────────────────────────
export type NewUser = InferInsertModel<typeof users>;
export type NewSender = InferInsertModel<typeof senders>;
export type NewCampaign = InferInsertModel<typeof campaigns>;
export type NewEmail = InferInsertModel<typeof emails>;
export type NewSlackConnection = InferInsertModel<typeof slackConnections>;

// ─── Status enums ───────────────────────────────────────────
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type EmailStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

// ─── API request/response types ─────────────────────────────

export interface ScheduleEmailsRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string; // ISO 8601 datetime
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  senderId: string; // UUID of the sender to use
}

export interface ScheduleEmailsResponse {
  campaignId: string;
  status: CampaignStatus;
  totalEmails: number;
  startTime: string;
  estimatedEndTime: string;
  emails: Array<{
    id: string;
    recipient: string;
    scheduledAt: string;
    status: EmailStatus;
  }>;
}

export interface ApiError {
  error: string;
  details?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
