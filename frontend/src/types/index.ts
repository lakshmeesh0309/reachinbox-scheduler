export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  name: string;
  isActive: boolean;
}

export type EmailStatus =
  | "pending"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface Email {
  id: string;
  campaignId: string;
  senderId: string;
  senderEmail?: string;
  senderName?: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  failureReason?: string | null;
}

export interface Campaign {
  id: string;
  userId: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  status: string;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  teamId: string | null;
  connectedAt: string | null;
}

export interface ScheduleEmailsRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  senderId: string;
}

export interface ScheduleEmailsResponse {
  message: string;
  data: {
    campaignId: string;
    status: string;
    totalEmails: number;
    startTime: string;
    estimatedEndTime: string;
    emails: Array<{
      id: string;
      recipient: string;
      scheduledAt: string;
      status: EmailStatus;
    }>;
  };
}

export interface EmailSearchQuery {
  q?: string;
  recipient?: string;
  sender?: string;
  subject?: string;
  body?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface EmailSearchResult {
  message?: string;
  emails: Email[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  error: string;
  details?: string[];
}
