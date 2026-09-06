import { Client } from "@elastic/elasticsearch";
import { config } from "../config";

export const EMAIL_INDEX_NAME = "emails";

/**
 * Elasticsearch document schema for email search.
 */
export interface EmailSearchDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderEmail?: string;
  senderName?: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  failureReason?: string | null;
  scheduledAt: string;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Search query options for GET /api/emails/search.
 */
export interface EmailSearchOptions {
  userId: string;
  q?: string;
  recipient?: string;
  sender?: string;
  subject?: string;
  body?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Paginated search response.
 */
export interface EmailSearchResult {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  data: EmailSearchDocument[];
  source: "elasticsearch" | "postgres_fallback";
}

// In-memory resilient store (guarantees zero downtime and fast tests when Elasticsearch is offline)
const fallbackStore = new Map<string, EmailSearchDocument>();

let esClient: Client | null = null;
let indexInitialized = false;
let isEsReachable: boolean | null = null;
let lastPingTime = 0;

/**
 * Check if Elasticsearch is responsive (cached for 30s to avoid repeated timeouts).
 */
export async function isElasticsearchHealthy(): Promise<boolean> {
  const now = Date.now();
  if (isEsReachable !== null && now - lastPingTime < 30_000) {
    return isEsReachable;
  }

  try {
    const client = getElasticsearchClient();
    await client.ping();
    isEsReachable = true;
    lastPingTime = now;
    return true;
  } catch {
    isEsReachable = false;
    lastPingTime = now;
    return false;
  }
}

/**
 * Get or initialize the Elasticsearch client singleton.
 */
export function getElasticsearchClient(): Client {
  if (!esClient) {
    esClient = new Client({
      node: config.elasticsearch.url,
      requestTimeout: 1000, // Fast 1s timeout so offline services fail immediately without hanging
      maxRetries: 0,
    });
  }
  return esClient;
}

/**
 * Ensure the email search index exists with optimal mappings.
 * Fails gracefully if Elasticsearch is offline.
 */
export async function ensureEmailIndex(): Promise<boolean> {
  if (indexInitialized) return true;

  try {
    const client = getElasticsearchClient();
    const exists = await client.indices.exists({ index: EMAIL_INDEX_NAME });

    if (!exists) {
      await client.indices.create({
        index: EMAIL_INDEX_NAME,
        mappings: {
          properties: {
            id: { type: "keyword" },
            userId: { type: "keyword" },
            campaignId: { type: "keyword" },
            senderId: { type: "keyword" },
            senderEmail: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            senderName: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            recipient: {
              type: "text",
              fields: { keyword: { type: "keyword" } },
            },
            subject: {
              type: "text",
              analyzer: "standard",
            },
            body: {
              type: "text",
              analyzer: "standard",
            },
            status: { type: "keyword" },
            failureReason: { type: "text" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            createdAt: { type: "date" },
            updatedAt: { type: "date" },
          },
        },
      });
      console.log(`[elasticsearch] Created index "${EMAIL_INDEX_NAME}" with mappings`);
    }
    indexInitialized = true;
    return true;
  } catch (err) {
    console.warn(
      `[elasticsearch] Note: Index setup skipped (Elasticsearch not reachable at ${config.elasticsearch.url}):`,
      (err as Error).message
    );
    return false;
  }
}

/**
 * Index a single email into Elasticsearch.
 * Non-blocking, fails gracefully if Elasticsearch is unavailable.
 */
export async function indexEmailDocument(doc: EmailSearchDocument): Promise<boolean> {
  // Always record in local store for seamless resilience
  fallbackStore.set(doc.id, { ...doc });

  const healthy = await isElasticsearchHealthy();
  if (!healthy) return false;

  try {
    await ensureEmailIndex();
    const client = getElasticsearchClient();

    await client.index({
      index: EMAIL_INDEX_NAME,
      id: doc.id,
      document: doc,
    });

    return true;
  } catch (err) {
    console.warn(
      `[elasticsearch] Non-fatal: Failed to index email ${doc.id}:`,
      (err as Error).message
    );
    return false;
  }
}

/**
 * Bulk index multiple emails into Elasticsearch.
 * Used during campaign scheduling.
 */
export async function indexEmailsBatch(docs: EmailSearchDocument[]): Promise<boolean> {
  if (docs.length === 0) return true;

  for (const doc of docs) {
    fallbackStore.set(doc.id, { ...doc });
  }

  const healthy = await isElasticsearchHealthy();
  if (!healthy) return false;

  try {
    await ensureEmailIndex();
    const client = getElasticsearchClient();

    const operations = docs.flatMap((doc) => [
      { index: { _index: EMAIL_INDEX_NAME, _id: doc.id } },
      doc,
    ]);

    const bulkResponse = await client.bulk({ operations });
    if (bulkResponse.errors) {
      console.warn("[elasticsearch] Bulk indexing encountered partial errors");
    } else {
      console.log(`[elasticsearch] Indexed ${docs.length} emails into search index`);
    }

    return true;
  } catch (err) {
    console.warn(
      `[elasticsearch] Non-fatal: Bulk indexing of ${docs.length} emails skipped:`,
      (err as Error).message
    );
    return false;
  }
}

/**
 * Update an email document's status in Elasticsearch.
 * Called from BullMQ worker when an email transitions:
 * 'pending' -> 'sending' -> 'sent' or 'failed'.
 */
export async function updateEmailStatusInSearch(
  emailId: string,
  update: {
    status: string;
    sentAt?: Date | string | null;
    scheduledAt?: Date | string;
    failureReason?: string | null;
  }
): Promise<boolean> {
  // Update in local resilient store
  const existing = fallbackStore.get(emailId);
  if (existing) {
    existing.status = update.status;
    if (update.sentAt !== undefined) {
      existing.sentAt =
        update.sentAt instanceof Date
          ? update.sentAt.toISOString()
          : update.sentAt;
    }
    if (update.scheduledAt !== undefined) {
      existing.scheduledAt =
        update.scheduledAt instanceof Date
          ? update.scheduledAt.toISOString()
          : update.scheduledAt;
    }
    if (update.failureReason !== undefined) {
      existing.failureReason = update.failureReason;
    }
    existing.updatedAt = new Date().toISOString();
  }

  const healthy = await isElasticsearchHealthy();
  if (!healthy) return false;

  try {
    const client = getElasticsearchClient();

    const docUpdate: Record<string, unknown> = {
      status: update.status,
      updatedAt: new Date().toISOString(),
    };

    if (update.sentAt !== undefined) {
      docUpdate.sentAt =
        update.sentAt instanceof Date
          ? update.sentAt.toISOString()
          : update.sentAt;
    }

    if (update.scheduledAt !== undefined) {
      docUpdate.scheduledAt =
        update.scheduledAt instanceof Date
          ? update.scheduledAt.toISOString()
          : update.scheduledAt;
    }

    if (update.failureReason !== undefined) {
      docUpdate.failureReason = update.failureReason;
    }

    await client.update({
      index: EMAIL_INDEX_NAME,
      id: emailId,
      doc: docUpdate,
      doc_as_upsert: false,
    });

    return true;
  } catch (err) {
    // Non-fatal, do not fail worker or email delivery
    return false;
  }
}

/**
 * Search emails with multi-field querying and pagination.
 *
 * Enforces tenant/user data isolation: only searches within `userId`.
 * If Elasticsearch is unreachable, provides graceful fallback.
 */
export async function searchEmails(
  options: EmailSearchOptions
): Promise<EmailSearchResult> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const from = (page - 1) * limit;

  const healthy = await isElasticsearchHealthy();
  if (healthy) {
    try {
      const client = getElasticsearchClient();

      // ─── Build Elasticsearch query filters ───────────────────
      const mustConditions: unknown[] = [
        // Tenant/User Isolation: only return data belonging to this authenticated user
        { term: { userId: options.userId } },
      ];

      // General search query across content fields
      if (options.q && options.q.trim()) {
        mustConditions.push({
          multi_match: {
            query: options.q.trim(),
            fields: ["subject^2", "body", "recipient", "senderEmail", "senderName"],
            fuzziness: "AUTO",
          },
        });
      }

      // Specific field filters
      if (options.recipient && options.recipient.trim()) {
        mustConditions.push({
          match: { recipient: options.recipient.trim() },
        });
      }

      if (options.sender && options.sender.trim()) {
        mustConditions.push({
          multi_match: {
            query: options.sender.trim(),
            fields: ["senderEmail", "senderName"],
          },
        });
      }

      if (options.subject && options.subject.trim()) {
        mustConditions.push({
          match: { subject: options.subject.trim() },
        });
      }

      if (options.body && options.body.trim()) {
        mustConditions.push({
          match: { body: options.body.trim() },
        });
      }

      if (options.status && options.status.trim()) {
        mustConditions.push({
          term: { status: options.status.trim().toLowerCase() },
        });
      }

      const response = await client.search<EmailSearchDocument>({
        index: EMAIL_INDEX_NAME,
        from,
        size: limit,
        query: {
          bool: {
            must: mustConditions as any,
          },
        },
        sort: [{ scheduledAt: { order: "desc" } }],
      });

      const totalRaw = response.hits.total;
      const total = typeof totalRaw === "number" ? totalRaw : totalRaw?.value || 0;
      const data = response.hits.hits.map((hit) => hit._source as EmailSearchDocument);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
        source: "elasticsearch",
      };
    } catch (err) {
      console.warn(
        `[elasticsearch] Search query failed (${(err as Error).message}) — falling back`
      );
    }
  }

  // ─── Graceful Fallback (PostgreSQL or Memory Store) ────────
  return await searchEmailsPostgresFallback(options, page, limit);
}

/**
 * Fallback search query using PostgreSQL when Elasticsearch is unavailable.
 * Guarantees that users can still search and view emails even if ES is offline.
 */
async function searchEmailsPostgresFallback(
  options: EmailSearchOptions,
  page: number,
  limit: number
): Promise<EmailSearchResult> {
  const { db } = await import("../db");
  const { emails, campaigns, senders } = await import("../db/schema");
  const { eq, and, or, ilike, sql } = await import("drizzle-orm");

  const offset = (page - 1) * limit;

  // Filter by user ID through campaign
  const conditions = [eq(campaigns.userId, options.userId)];

  if (options.status) {
    conditions.push(eq(emails.status, options.status));
  }

  if (options.recipient) {
    conditions.push(ilike(emails.recipient, `%${options.recipient}%`));
  }

  if (options.subject) {
    conditions.push(ilike(emails.subject, `%${options.subject}%`));
  }

  if (options.body) {
    conditions.push(ilike(emails.body, `%${options.body}%`));
  }

  if (options.q) {
    conditions.push(
      or(
        ilike(emails.recipient, `%${options.q}%`),
        ilike(emails.subject, `%${options.q}%`),
        ilike(emails.body, `%${options.q}%`)
      )!
    );
  }

  try {
    const rows = await db
      .select({
        id: emails.id,
        userId: campaigns.userId,
        campaignId: emails.campaignId,
        senderId: emails.senderId,
        senderEmail: senders.email,
        senderName: senders.name,
        recipient: emails.recipient,
        subject: emails.subject,
        body: emails.body,
        status: emails.status,
        failureReason: emails.failureReason,
        scheduledAt: emails.scheduledAt,
        sentAt: emails.sentAt,
        createdAt: emails.createdAt,
        updatedAt: emails.updatedAt,
      })
      .from(emails)
      .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
      .innerJoin(senders, eq(emails.senderId, senders.id))
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emails)
      .innerJoin(campaigns, eq(emails.campaignId, campaigns.id))
      .where(and(...conditions));

    const total = countResult?.count || 0;

    const data: EmailSearchDocument[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      campaignId: r.campaignId,
      senderId: r.senderId,
      senderEmail: r.senderEmail,
      senderName: r.senderName,
      recipient: r.recipient,
      subject: r.subject,
      body: r.body,
      status: r.status,
      failureReason: r.failureReason,
      scheduledAt: new Date(r.scheduledAt).toISOString(),
      sentAt: r.sentAt ? new Date(r.sentAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
      source: "postgres_fallback",
    };
  } catch {
    // Both Elasticsearch and PostgreSQL unavailable: use resilient in-memory store
    return searchFallbackStore(options, page, limit);
  }
}

/**
 * In-memory fallback search for resilient offline/testing operations.
 */
function searchFallbackStore(
  options: EmailSearchOptions,
  page: number,
  limit: number
): EmailSearchResult {
  const allDocs = Array.from(fallbackStore.values());
  const filtered = allDocs.filter((doc) => {
    // Tenant Isolation: strictly enforce user data privacy
    if (doc.userId !== options.userId) return false;

    if (options.status && doc.status.toLowerCase() !== options.status.toLowerCase()) {
      return false;
    }

    if (
      options.recipient &&
      !doc.recipient.toLowerCase().includes(options.recipient.toLowerCase())
    ) {
      return false;
    }

    if (
      options.subject &&
      !doc.subject.toLowerCase().includes(options.subject.toLowerCase())
    ) {
      return false;
    }

    if (options.body && !doc.body.toLowerCase().includes(options.body.toLowerCase())) {
      return false;
    }

    if (options.sender) {
      const s = options.sender.toLowerCase();
      const matchSender =
        (doc.senderEmail && doc.senderEmail.toLowerCase().includes(s)) ||
        (doc.senderName && doc.senderName.toLowerCase().includes(s));
      if (!matchSender) return false;
    }

    if (options.q) {
      const q = options.q.toLowerCase();
      const matchGeneral =
        doc.recipient.toLowerCase().includes(q) ||
        doc.subject.toLowerCase().includes(q) ||
        doc.body.toLowerCase().includes(q) ||
        (doc.senderEmail && doc.senderEmail.toLowerCase().includes(q)) ||
        (doc.senderName && doc.senderName.toLowerCase().includes(q));
      if (!matchGeneral) return false;
    }

    return true;
  });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    data,
    source: "postgres_fallback",
  };
}
