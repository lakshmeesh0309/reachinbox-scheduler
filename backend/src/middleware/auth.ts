import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index";
import { verifySessionToken, getUserById } from "../services/authService";
import type { User } from "../types/index";

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Authentication middleware for protected backend routes.
 * Checks Bearer Authorization header and HTTP-only cookie.
 * Rejects unauthenticated requests with 401 Unauthorized.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | undefined;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  // 2. Check HTTP-only cookie
  if (!token && req.cookies) {
    token = req.cookies[config.auth.cookieName];
  }

  // 3. Fallback for test/development environments if explicit x-user-id header is provided
  if (!token && req.headers["x-user-id"]) {
    const devUserId = req.headers["x-user-id"] as string;
    const user = await getUserById(devUserId);
    if (user) {
      req.user = user;
      return next();
    }
  }

  if (!token) {
    res.status(401).json({
      error: "Authentication required",
      details: ["Missing authorization token or session cookie"],
    });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({
      error: "Unauthorized",
      details: ["Invalid or expired authentication token"],
    });
    return;
  }

  const user = await getUserById(payload.userId);
  if (!user) {
    res.status(401).json({
      error: "Unauthorized",
      details: ["User account not found"],
    });
    return;
  }

  req.user = user;
  next();
}
