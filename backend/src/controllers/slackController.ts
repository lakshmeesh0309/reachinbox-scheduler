import type { Request, Response } from "express";
import { config } from "../config/index";
import {
  getSlackConnectUrl,
  exchangeSlackCode,
  upsertSlackConnection,
  getSlackStatus,
  disconnectSlack,
} from "../services/slackService";
import type { ApiError } from "../types/index";

/**
 * GET /api/slack/connect
 * Initiates the Slack OAuth 2.0 flow to connect a user's Slack workspace.
 */
export function connectSlackController(req: Request, res: Response): void {
  const userId = req.user?.id || (req.query.userId as string);

  if (!userId) {
    const error: ApiError = {
      error: "Authentication required",
      details: ["User must be authenticated to connect Slack"],
    };
    res.status(401).json(error);
    return;
  }

  const { url, state } = getSlackConnectUrl(userId);

  if (
    req.query.format === "json" ||
    (req.headers.accept && req.headers.accept.includes("application/json"))
  ) {
    res.json({ url, state });
    return;
  }

  res.redirect(url);
}

/**
 * GET /api/slack/callback
 * Handles the redirect from Slack's OAuth authorization screen.
 */
export async function slackCallbackController(
  req: Request,
  res: Response
): Promise<void> {
  const { code, state, error } = req.query;

  if (error) {
    console.error("[slackController] Slack OAuth denied:", error);
    res.redirect(
      `${config.frontendUrl}/dashboard?slack_error=${encodeURIComponent(String(error))}`
    );
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({
      error: "Authorization code missing",
      details: ["Slack authorization code is required"],
    });
    return;
  }

  // Extract user ID from state parameter (format: "userId:nonce")
  let userId = req.user?.id;
  if (state && typeof state === "string" && state.includes(":")) {
    userId = state.split(":")[0];
  }

  if (!userId) {
    res.status(400).json({
      error: "Invalid state",
      details: ["Could not determine authenticated user from OAuth state"],
    });
    return;
  }

  try {
    const data = await exchangeSlackCode(code);

    if (!data.access_token || !data.team?.id) {
      throw new Error("Invalid Slack OAuth response tokens");
    }

    await upsertSlackConnection(userId, {
      slackTeamId: data.team.id,
      slackTeamName: data.team.name,
      slackUserId: data.authed_user?.id || data.bot_user_id || "unknown",
      slackAccessToken: data.access_token,
    });

    console.log(
      `[slackController] ✅ Slack connected for user ${userId} to team ${data.team.name} (${data.team.id})`
    );

    res.redirect(`${config.frontendUrl}/dashboard?slack=connected`);
  } catch (err) {
    console.error("[slackController] Error completing Slack OAuth:", err);
    res.redirect(
      `${config.frontendUrl}/dashboard?slack_error=${encodeURIComponent(
        (err as Error).message
      )}`
    );
  }
}

/**
 * GET /api/slack/status
 * Returns current Slack connection status for the authenticated user.
 */
export async function slackStatusController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id || (req.headers["x-user-id"] as string);

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const status = await getSlackStatus(userId);
    res.json(status);
  } catch (err) {
    console.error("[slackController] Error fetching Slack status:", err);
    res.status(500).json({ error: "Failed to retrieve Slack status" });
  }
}

/**
 * POST /api/slack/disconnect
 * Disconnects the user's active Slack integration.
 */
export async function disconnectSlackController(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id || (req.headers["x-user-id"] as string);

  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    await disconnectSlack(userId);
    res.json({
      message: "Slack integration disconnected successfully",
      connected: false,
    });
  } catch (err) {
    console.error("[slackController] Error disconnecting Slack:", err);
    res.status(500).json({ error: "Failed to disconnect Slack" });
  }
}
