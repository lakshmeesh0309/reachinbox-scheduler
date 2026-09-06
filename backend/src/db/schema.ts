import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Users ──────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    googleId: varchar("google_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_google_id_idx").on(table.googleId),
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  senders: many(senders),
  campaigns: many(campaigns),
  slackConnections: many(slackConnections),
}));

// ─── Senders ────────────────────────────────────────────────

export const senders = pgTable(
  "senders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    smtpHost: varchar("smtp_host", { length: 255 }),
    smtpPort: integer("smtp_port"),
    smtpUser: varchar("smtp_user", { length: 255 }),
    smtpPass: text("smtp_pass"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("senders_user_id_idx").on(table.userId),
    uniqueIndex("senders_user_id_email_idx").on(table.userId, table.email),
  ]
);

export const sendersRelations = relations(senders, ({ one, many }) => ({
  user: one(users, {
    fields: [senders.userId],
    references: [users.id],
  }),
  emails: many(emails),
}));

// ─── Campaigns ──────────────────────────────────────────────

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    delayBetweenEmailsMs: integer("delay_between_emails_ms").notNull(),
    hourlyLimit: integer("hourly_limit").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campaigns_user_id_idx").on(table.userId),
    index("campaigns_status_idx").on(table.status),
    index("campaigns_user_id_status_idx").on(table.userId, table.status),
  ]
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  user: one(users, {
    fields: [campaigns.userId],
    references: [users.id],
  }),
  emails: many(emails),
}));

// ─── Emails ─────────────────────────────────────────────────

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => senders.id, { onDelete: "restrict" }),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    failureReason: text("failure_reason"),
    bullmqJobId: varchar("bullmq_job_id", { length: 255 }),
    idempotencyKey: uuid("idempotency_key").notNull().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("emails_campaign_id_idx").on(table.campaignId),
    index("emails_sender_id_idx").on(table.senderId),
    index("emails_status_idx").on(table.status),
    index("emails_scheduled_at_idx").on(table.scheduledAt),
    index("emails_campaign_id_status_idx").on(table.campaignId, table.status),
    uniqueIndex("emails_bullmq_job_id_idx").on(table.bullmqJobId),
    uniqueIndex("emails_idempotency_key_idx").on(table.idempotencyKey),
  ]
);

export const emailsRelations = relations(emails, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [emails.campaignId],
    references: [campaigns.id],
  }),
  sender: one(senders, {
    fields: [emails.senderId],
    references: [senders.id],
  }),
}));

// ─── Slack Connections ──────────────────────────────────────

export const slackConnections = pgTable(
  "slack_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slackTeamId: varchar("slack_team_id", { length: 255 }).notNull(),
    slackTeamName: varchar("slack_team_name", { length: 255 }),
    slackUserId: varchar("slack_user_id", { length: 255 }).notNull(),
    slackAccessToken: text("slack_access_token").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("slack_connections_user_id_idx").on(table.userId),
  ]
);

export const slackConnectionsRelations = relations(
  slackConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [slackConnections.userId],
      references: [users.id],
    }),
  })
);
