import { Router } from "express";
import {
  scheduleEmailsController,
  searchEmailsController,
  getEmailByIdController,
} from "../controllers/emailController";
import { requireAuth } from "../middleware/auth";

export const emailRouter = Router();

// GET /api/emails/search — Full-text and faceted search across emails
emailRouter.get("/search", requireAuth, searchEmailsController);

// POST /api/emails/schedule — Create campaign and schedule emails
emailRouter.post("/schedule", requireAuth, scheduleEmailsController);

// GET /api/emails/:id — Get specific email with strict tenant isolation
emailRouter.get("/:id", requireAuth, getEmailByIdController);
