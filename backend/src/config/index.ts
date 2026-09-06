import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || "4000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  // PostgreSQL
  db: {
    url: process.env.DATABASE_URL || "",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "reachinbox",
    password: process.env.DB_PASSWORD || "reachinbox_secret",
    name: process.env.DB_NAME || "reachinbox",
    ssl: process.env.DB_SSL === "true" || (process.env.NODE_ENV === "production" && !process.env.DB_HOST?.includes("localhost")),
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || "",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // Elasticsearch
  elasticsearch: {
    url: process.env.ELASTICSEARCH_URL || "http://localhost:9200",
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
    from: process.env.SMTP_FROM || "noreply@reachinbox.dev",
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      "http://localhost:4000/api/auth/google/callback",
  },

  // Authentication & Frontend
  auth: {
    jwtSecret:
      process.env.JWT_SECRET || "reachinbox_super_secret_jwt_key_development_only",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    cookieName: process.env.COOKIE_NAME || "reachinbox_token",
  },
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  // Slack
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || "",
    clientSecret: process.env.SLACK_CLIENT_SECRET || "",
    redirectUri:
      process.env.SLACK_REDIRECT_URI ||
      "http://localhost:4000/api/slack/callback",
    botToken: process.env.SLACK_BOT_TOKEN || "",
    signingSecret: process.env.SLACK_SIGNING_SECRET || "",
    channelId: process.env.SLACK_CHANNEL_ID || "",
  },

  // Worker & Throttling
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
    minEmailDelayMs: parseInt(process.env.MIN_EMAIL_DELAY_MS || "2000", 10),
    maxEmailsPerHourPerSender: parseInt(
      process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || "100",
      10
    ),
  },
} as const;
