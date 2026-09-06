import type { Request, Response } from "express";
import { config } from "../config/index";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  upsertUserFromGoogleProfile,
  signSessionToken,
} from "../services/authService";
import type { ApiError } from "../types/index";

/**
 * GET /api/auth/google
 * Initiates the Google OAuth 2.0 login flow.
 */
export function googleLoginController(req: Request, res: Response): void {
  const { url, state } = getGoogleAuthUrl(req.query.state as string | undefined);

  // If requested via JSON, return URL for SPA navigation; otherwise redirect browser
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
 * GET /api/auth/google/callback
 * Handles the Google OAuth redirect callback.
 */
export async function googleCallbackController(
  req: Request,
  res: Response
): Promise<void> {
  const { code, error } = req.query;

  if (error) {
    console.error("[authController] Google OAuth error:", error);
    res.redirect(`${config.frontendUrl}/login?error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || typeof code !== "string") {
    res.status(400).json({
      error: "Authorization code missing",
      details: ["The 'code' query parameter is required"],
    });
    return;
  }

  try {
    // 1. Exchange code for Google access token
    const tokens = await exchangeCodeForTokens(code);

    // 2. Fetch user profile from Google UserInfo
    const profile = await fetchGoogleProfile(tokens.accessToken);

    // 3. Find or create user in PostgreSQL
    const user = await upsertUserFromGoogleProfile(profile);

    // 4. Generate JWT session token
    const token = signSessionToken({
      userId: user.id,
      email: user.email,
    });

    // 5. Set secure HTTP-only cookie
    res.cookie(config.auth.cookieName, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // 6. Redirect to frontend dashboard with token
    res.redirect(`${config.frontendUrl}/dashboard?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error("[authController] OAuth callback error:", err);
    res.redirect(
      `${config.frontendUrl}/login?error=${encodeURIComponent((err as Error).message)}`
    );
  }
}

/**
 * POST /api/auth/google/token
 * For SPAs using Google Identity Services / direct token or code exchange.
 */
export async function googleTokenExchangeController(
  req: Request,
  res: Response
): Promise<void> {
  const { code, accessToken, profile } = req.body;

  try {
    let userProfile = profile;

    if (code) {
      const tokens = await exchangeCodeForTokens(code);
      userProfile = await fetchGoogleProfile(tokens.accessToken);
    } else if (accessToken) {
      userProfile = await fetchGoogleProfile(accessToken);
    }

    if (!userProfile || !userProfile.googleId || !userProfile.email) {
      res.status(400).json({
        error: "Invalid Google authentication data",
        details: ["Google profile with googleId and email is required"],
      });
      return;
    }

    const user = await upsertUserFromGoogleProfile(userProfile);
    const token = signSessionToken({ userId: user.id, email: user.email });

    res.cookie(config.auth.cookieName, token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Authentication successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("[authController] Google token exchange error:", err);
    res.status(500).json({
      error: "Authentication failed",
      details: [(err as Error).message],
    });
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 * Protected by requireAuth middleware.
 */
export function getMeController(req: Request, res: Response): void {
  if (!req.user) {
    const error: ApiError = { error: "Authentication required" };
    res.status(401).json(error);
    return;
  }

  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatarUrl,
  });
}

/**
 * POST /api/auth/logout
 * Clears the session cookie and invalidates client session.
 */
export function logoutController(req: Request, res: Response): void {
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax",
  });

  res.json({
    message: "Logged out successfully",
  });
}
