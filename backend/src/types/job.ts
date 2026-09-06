/**
 * BullMQ job data — contains only the minimum information
 * needed to identify and process an email safely.
 *
 * The worker looks up the full email record from PostgreSQL
 * using the emailId, ensuring data consistency.
 */
export interface EmailJobData {
  emailId: string;
  campaignId: string;
}

/**
 * BullMQ job return value after processing.
 */
export interface EmailJobResult {
  emailId: string;
  success: boolean;
  message: string;
  processedAt: string;
}

/**
 * Queue name constant — single source of truth.
 */
export const EMAIL_QUEUE_NAME = "email-send" as const;
