import type { AuthUser, SlackStatus } from "../types/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

/**
 * Redirects the user's browser to the Google OAuth consent screen.
 */
export function initiateGoogleLogin(): void {
  window.location.href = `${API_BASE}/api/auth/google`;
}

/**
 * Fetches the currently authenticated user's profile.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[authService] Failed to fetch current user:", err);
    return null;
  }
}

/**
 * Logs out the current user and clears session cookies.
 */
export async function logoutUser(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("[authService] Failed to logout:", err);
  }
}

/**
 * Fetches current Slack connection status for the logged-in user.
 */
export async function fetchSlackStatus(): Promise<SlackStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/slack/status`, {
      credentials: "include",
    });
    if (!res.ok) {
      return { connected: false, teamName: null, teamId: null, connectedAt: null };
    }
    return await res.json();
  } catch {
    return { connected: false, teamName: null, teamId: null, connectedAt: null };
  }
}

/**
 * Redirects the user to initiate Slack connection.
 */
export function initiateSlackConnect(): void {
  window.location.href = `${API_BASE}/api/slack/connect`;
}

/**
 * Disconnects the user's Slack workspace.
 */
export async function disconnectSlack(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/slack/disconnect`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
