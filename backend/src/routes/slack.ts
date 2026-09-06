import { Router } from "express";
import {
  connectSlackController,
  slackCallbackController,
  slackStatusController,
  disconnectSlackController,
} from "../controllers/slackController";
import { requireAuth } from "../middleware/auth";

export const slackRouter = Router();

// GET /api/slack/connect — Initiate Slack OAuth connection
slackRouter.get("/connect", connectSlackController);

// GET /api/slack/callback — Slack OAuth redirect callback
slackRouter.get("/callback", slackCallbackController);

// GET /api/slack/status — Check current connection status
slackRouter.get("/status", requireAuth, slackStatusController);

// POST /api/slack/disconnect — Disconnect active Slack connection
slackRouter.post("/disconnect", requireAuth, disconnectSlackController);
