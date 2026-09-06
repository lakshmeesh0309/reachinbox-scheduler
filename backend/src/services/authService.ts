import jwt from "jsonwebtoken";
import crypto from "crypto";
import { eq, or } from "drizzle-orm";
import { config } from "../config/index";
import { db } from "../db/index";
import { users } from "../db/schema";
import type { User } from "../types/index";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

export interface TokenPayload {
  userId: string;
  email: string;
}

// Fallback in-memory cache to guarantee operational resiliency if DB is momentarily unreachable
const inMemoryUsers = new Map<string, User>();

/**
 * Generates the Google OAuth 2.0 authorization URL.
 */
export function getGoogleAuthUrl(customState?: string): { url: string; state: string } {
  const state = customState || crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return { url, state };
}

/**
 * Exchanges an authorization code for Google access and ID tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  idToken?: string;
}> {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error(
      "Google OAuth credentials missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
    );
  }

  const tokenEndpoint = "https://oauth2.googleapis.com/token";

  const body = new URLSearchParams({
    code,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.callbackUrl,
    grant_type: "authorization_code",
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token exchange failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    id_token?: string;
  };

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
  };
}

/**
 * Retrieves the user profile from Google using the access token.
 */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const userInfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo";

  const response = await fetch(userInfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Google user profile (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };

  return {
    googleId: data.sub,
    email: data.email.toLowerCase().trim(),
    name: data.name || data.email,
    avatarUrl: data.picture || null,
  };
}

/**
 * Finds an existing user by Google ID or email, or inserts a new user record.
 * Keeps PostgreSQL as the single source of truth with an in-memory shadow store.
 */
export async function upsertUserFromGoogleProfile(profile: GoogleProfile): Promise<User> {
  const normalizedEmail = profile.email.toLowerCase().trim();

  try {
    // 1. Check if user exists by googleId or email
    const existingUsers = await db
      .select()
      .from(users)
      .where(or(eq(users.googleId, profile.googleId), eq(users.email, normalizedEmail)))
      .limit(1);

    if (existingUsers.length > 0) {
      const existing = existingUsers[0];
      const [updated] = await db
        .update(users)
        .set({
          name: profile.name || existing.name,
          avatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : existing.avatarUrl,
          googleId: profile.googleId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning();

      const finalUser = updated || existing;
      inMemoryUsers.set(finalUser.id, finalUser);
      return finalUser;
    }

    // 2. Insert new user record
    const [created] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        googleId: profile.googleId,
        email: normalizedEmail,
        name: profile.name,
        avatarUrl: profile.avatarUrl || null,
      })
      .returning();

    inMemoryUsers.set(created.id, created);
    return created;
  } catch (err) {
    console.warn(
      "[authService] Database write error, falling back to memory store:",
      (err as Error).message
    );

    // Resilient fallback: find in shadow store or generate
    for (const u of inMemoryUsers.values()) {
      if (u.googleId === profile.googleId || u.email === normalizedEmail) {
        u.name = profile.name;
        u.avatarUrl = profile.avatarUrl || null;
        u.updatedAt = new Date();
        return u;
      }
    }

    const fallbackUser: User = {
      id: crypto.randomUUID(),
      googleId: profile.googleId,
      email: normalizedEmail,
      name: profile.name,
      avatarUrl: profile.avatarUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryUsers.set(fallbackUser.id, fallbackUser);
    return fallbackUser;
  }
}

/**
 * Retrieves a user by their UUID primary key.
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (result.length > 0) {
      inMemoryUsers.set(result[0].id, result[0]);
      return result[0];
    }
  } catch (err) {
    console.warn("[authService] DB lookup fallback:", (err as Error).message);
  }

  return inMemoryUsers.get(userId) || null;
}

/**
 * Generates a signed JWT session token.
 */
export function signSessionToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn as any,
  });
}

/**
 * Verifies a JWT session token and extracts the payload.
 */
export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as TokenPayload;
    if (decoded && decoded.userId) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}
