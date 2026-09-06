import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { config } from "../config/index";
import { db } from "../db/index";
import { slackConnections } from "../db/schema";
import type { SlackConnection } from "../types/index";

export interface SlackTokenResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: {
    name: string;
    id: string;
  };
  authed_user?: {
    id: string;
    scope?: string;
    access_token?: string;
  };
  incoming_webhook?: {
    channel: string;
    channel_id: string;
    configuration_url: string;
    url: string;
  };
  error?: string;
}

export interface RateLimitNotificationParams {
  userId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  hourlyLimit: number;
  campaignSubject: string;
  affectedCount: number;
  nextWindow: Date;
  channelId?: string;
}

// In-memory shadow store for fast lookups & testing resilience
const inMemorySlackConnections = new Map<string, SlackConnection>();

// Deduplication cache: tracks recent notifications to avoid duplicate spam
const recentNotifications = new Set<string>();

/**
 * Generates the Slack OAuth 2.0 authorization URL.
 * State encodes the authenticated user ID and CSRF token.
 */
export function getSlackConnectUrl(userId: string, customState?: string): {
  url: string;
  state: string;
} {
  const nonce = crypto.randomBytes(8).toString("hex");
  const state = customState || `${userId}:${nonce}`;

  const scopes = [
    "chat:write",
    "chat:write.public",
    "channels:read",
    "incoming-webhook",
  ].join(",");

  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: scopes,
    redirect_uri: config.slack.redirectUri,
    state,
  });

  const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  return { url, state };
}

/**
 * Exchanges a temporary authorization code for Slack access tokens.
 */
export async function exchangeSlackCode(code: string): Promise<SlackTokenResponse> {
  const tokenEndpoint = "https://slack.com/api/oauth.v2.access";

  const body = new URLSearchParams({
    client_id: config.slack.clientId,
    client_secret: config.slack.clientSecret,
    code,
    redirect_uri: config.slack.redirectUri,
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await response.json()) as SlackTokenResponse;

  if (!data.ok) {
    throw new Error(`Slack OAuth exchange failed: ${data.error || "Unknown error"}`);
  }

  return data;
}

/**
 * Stores or updates a user's Slack connection in PostgreSQL.
 */
export async function upsertSlackConnection(
  userId: string,
  data: {
    slackTeamId: string;
    slackTeamName?: string | null;
    slackUserId: string;
    slackAccessToken: string;
  }
): Promise<SlackConnection> {
  try {
    const existing = await db
      .select()
      .from(slackConnections)
      .where(eq(slackConnections.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(slackConnections)
        .set({
          slackTeamId: data.slackTeamId,
          slackTeamName: data.slackTeamName || existing[0].slackTeamName,
          slackUserId: data.slackUserId,
          slackAccessToken: data.slackAccessToken,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(slackConnections.id, existing[0].id))
        .returning();

      const finalRecord = updated || existing[0];
      inMemorySlackConnections.set(userId, finalRecord);
      return finalRecord;
    }

    const [created] = await db
      .insert(slackConnections)
      .values({
        id: crypto.randomUUID(),
        userId,
        slackTeamId: data.slackTeamId,
        slackTeamName: data.slackTeamName || null,
        slackUserId: data.slackUserId,
        slackAccessToken: data.slackAccessToken,
        isActive: true,
      })
      .returning();

    inMemorySlackConnections.set(userId, created);
    return created;
  } catch (err) {
    console.warn(
      "[slackService] DB error saving connection, storing in memory fallback:",
      (err as Error).message
    );

    const fallback: SlackConnection = {
      id: crypto.randomUUID(),
      userId,
      slackTeamId: data.slackTeamId,
      slackTeamName: data.slackTeamName || "Slack Workspace",
      slackUserId: data.slackUserId,
      slackAccessToken: data.slackAccessToken,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemorySlackConnections.set(userId, fallback);
    return fallback;
  }
}

/**
 * Retrieves the active Slack connection for a user.
 */
export async function getActiveSlackConnection(
  userId: string
): Promise<SlackConnection | null> {
  try {
    const records = await db
      .select()
      .from(slackConnections)
      .where(
        and(eq(slackConnections.userId, userId), eq(slackConnections.isActive, true))
      )
      .limit(1);

    if (records.length > 0) {
      inMemorySlackConnections.set(userId, records[0]);
      return records[0];
    }
  } catch (err) {
    console.warn("[slackService] DB lookup notice:", (err as Error).message);
  }

  const cached = inMemorySlackConnections.get(userId);
  return cached && cached.isActive ? cached : null;
}

/**
 * Returns the current Slack connection status for a user.
 */
export async function getSlackStatus(userId: string): Promise<{
  connected: boolean;
  teamName: string | null;
  teamId: string | null;
  connectedAt: Date | null;
}> {
  const connection = await getActiveSlackConnection(userId);

  if (!connection) {
    return {
      connected: false,
      teamName: null,
      teamId: null,
      connectedAt: null,
    };
  }

  return {
    connected: true,
    teamName: connection.slackTeamName,
    teamId: connection.slackTeamId,
    connectedAt: connection.createdAt,
  };
}

/**
 * Disconnects Slack for a user by setting isActive = false.
 */
export async function disconnectSlack(userId: string): Promise<boolean> {
  try {
    await db
      .update(slackConnections)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(slackConnections.userId, userId));
  } catch (err) {
    console.warn("[slackService] DB disconnect notice:", (err as Error).message);
  }

  const cached = inMemorySlackConnections.get(userId);
  if (cached) {
    cached.isActive = false;
    cached.updatedAt = new Date();
  }

  return true;
}

/**
 * Posts a real Slack notification when an email sender hits the hourly rate limit.
 *
 * Requirements:
 * - If Slack is not connected, rate limiting continues normally and app does not crash.
 * - If Slack is connected later, future events automatically notify Slack.
 * - Deduplication prevents flood of messages for the same sender within a time window.
 */
export async function sendRateLimitSlackNotification(
  params: RateLimitNotificationParams
): Promise<{ sent: boolean; reason: string; responseData?: any }> {
  // ─── 1. Check Deduplication (10-minute window) ───────────
  const timeWindowBucket = Math.floor(params.nextWindow.getTime() / (1000 * 60 * 10));
  const dedupKey = `rate-limit:${params.senderId}:${timeWindowBucket}`;

  if (recentNotifications.has(dedupKey)) {
    return { sent: false, reason: "duplicate_suppressed" };
  }

  // ─── 2. Check Slack Connection ───────────────────────────
  const userConnection = await getActiveSlackConnection(params.userId);
  const botToken = userConnection?.slackAccessToken || config.slack.botToken;

  if (!botToken) {
    // Slack not connected: continue normally without error
    return { sent: false, reason: "slack_not_connected" };
  }

  // ─── 3. Format Notification Message ──────────────────────
  const targetChannel =
    params.channelId || config.slack.channelId || userConnection?.slackUserId || "general";

  const messagePayload = {
    channel: targetChannel,
    text: `⚠️ Rate Limit Alert: Sender ${params.senderEmail} reached limit (${params.hourlyLimit}/hour)`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "⚠️ Hourly Rate Limit Reached",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Sender:*\n${params.senderName} (${params.senderEmail})`,
          },
          {
            type: "mrkdwn",
            text: `*Hourly Limit:*\n${params.hourlyLimit} emails/hour`,
          },
          {
            type: "mrkdwn",
            text: `*Campaign:*\n${params.campaignSubject || "Email Campaign"}`,
          },
          {
            type: "mrkdwn",
            text: `*Emails Affected:*\n${params.affectedCount} queued/delayed`,
          },
          {
            type: "mrkdwn",
            text: `*Next Sending Window:*\n<!date^${Math.floor(
              params.nextWindow.getTime() / 1000
            )}^{date_num} {time_secs}|${params.nextWindow.toUTCString()}>`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*ReachInbox Scheduler* • Sender queue throttled automatically to preserve deliverability.`,
          },
        ],
      },
    ],
  };

  // ─── 4. Dispatch Real Slack API Request ──────────────────
  try {
    const postEndpoint = "https://slack.com/api/chat.postMessage";

    const response = await fetch(postEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify(messagePayload),
    });

    const data = (await response.json()) as any;

    // Mark deduplication cache
    recentNotifications.add(dedupKey);
    setTimeout(() => recentNotifications.delete(dedupKey), 10 * 60 * 1000);

    if (data.ok) {
      console.log(
        `[slackService] 📢 Slack notification delivered for sender ${params.senderEmail} to channel ${targetChannel}`
      );
      return { sent: true, reason: "delivered", responseData: data };
    } else {
      console.warn(
        `[slackService] Slack API responded with error: ${data.error || "unknown"}`
      );
      return { sent: false, reason: data.error || "api_error", responseData: data };
    }
  } catch (networkErr) {
    console.error(
      `[slackService] Network error sending Slack alert:`,
      (networkErr as Error).message
    );
    return { sent: false, reason: (networkErr as Error).message };
  }
}
