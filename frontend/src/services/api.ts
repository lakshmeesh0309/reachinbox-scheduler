import type {
  User,
  Sender,
  ScheduleEmailsRequest,
  ScheduleEmailsResponse,
  EmailSearchQuery,
  EmailSearchResult,
  SlackStatus,
} from "../types";

export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/api\/?$/, "").replace(/\/+$/, "");

/**
 * Custom error class capturing structured backend API error responses.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: string[];

  constructor(message: string, statusCode: number, details?: string[]) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Universal request wrapper with credential cookies and automatic JSON error extraction.
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Enables cross-origin HTTP-only session cookies
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed with status ${response.status}`;
    const details = Array.isArray(data?.details) ? data.details : undefined;
    throw new ApiError(message, response.status, details);
  }

  return data as T;
}

// ─── Authentication ──────────────────────────────────────────

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    return await request<User>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) {
      return null;
    }
    console.warn("[api] Error fetching current user:", err);
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  await request<{ message: string }>("/api/auth/logout", {
    method: "POST",
  });
}

export function getGoogleLoginUrl(): string {
  return `${API_BASE}/api/auth/google`;
}

// ─── Senders ─────────────────────────────────────────────────

export async function fetchSenders(): Promise<Sender[]> {
  const res = await request<{ senders: Sender[] }>("/api/senders");
  return res.senders || [];
}

// ─── Emails & Campaigns ──────────────────────────────────────

export async function searchEmails(query: EmailSearchQuery = {}): Promise<EmailSearchResult> {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  if (query.recipient) params.set("recipient", query.recipient);
  if (query.sender) params.set("sender", query.sender);
  if (query.subject) params.set("subject", query.subject);
  if (query.body) params.set("body", query.body);
  if (query.status) params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));

  const qs = params.toString();
  return await request<EmailSearchResult>(`/api/emails/search${qs ? `?${qs}` : ""}`);
}

export async function scheduleEmails(payload: ScheduleEmailsRequest): Promise<ScheduleEmailsResponse> {
  return await request<ScheduleEmailsResponse>("/api/emails/schedule", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Slack Integration ───────────────────────────────────────

export async function fetchSlackStatus(): Promise<SlackStatus> {
  try {
    return await request<SlackStatus>("/api/slack/status");
  } catch {
    return { connected: false, teamName: null, teamId: null, connectedAt: null };
  }
}

export function getSlackConnectUrl(): string {
  return `${API_BASE}/api/slack/connect`;
}

export async function disconnectSlack(): Promise<boolean> {
  try {
    const res = await request<{ connected: boolean }>("/api/slack/disconnect", {
      method: "POST",
    });
    return !res.connected;
  } catch {
    return false;
  }
}
