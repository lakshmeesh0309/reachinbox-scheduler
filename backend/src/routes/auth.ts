import { Router } from "express";
import {
  googleLoginController,
  googleCallbackController,
  googleTokenExchangeController,
  getMeController,
  logoutController,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

// GET /api/auth/google — Initiates Google OAuth consent screen
authRouter.get("/google", googleLoginController);

// GET /api/auth/google/callback — Google OAuth callback endpoint
authRouter.get("/google/callback", googleCallbackController);

// POST /api/auth/google/token — Direct token/code exchange for frontend SPAs
authRouter.post("/google/token", googleTokenExchangeController);

// GET /api/auth/me — Protected: returns authenticated user profile
authRouter.get("/me", requireAuth, getMeController);

// POST /api/auth/logout — Log out and clear session cookie
authRouter.post("/logout", logoutController);
authRouter.get("/logout", logoutController);
