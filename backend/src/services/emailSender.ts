import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { config } from "../config/index";

/**
 * Email send result returned by the SMTP service.
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
  error?: string;
}

/**
 * Parameters for sending a single email via SMTP.
 */
export interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

// ─── Singleton transporter ──────────────────────────────────

let transporter: Transporter | null = null;

/**
 * Get or create the SMTP transporter.
 *
 * In development with Ethereal, the transporter is created once
 * and reused for all sends. If SMTP credentials are empty,
 * Ethereal test credentials are auto-generated.
 */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  let host = config.smtp.host;
  let port = config.smtp.port;
  let user = config.smtp.user;
  let pass = config.smtp.pass;
  let secure = config.smtp.secure;

  // Auto-create Ethereal account if no SMTP credentials configured
  if (!host || !user) {
    console.log("[smtp] No SMTP credentials configured — creating Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    host = testAccount.smtp.host;
    port = testAccount.smtp.port;
    user = testAccount.user;
    pass = testAccount.pass;
    secure = testAccount.smtp.secure;

    console.log(`[smtp] Ethereal account created: ${user}`);
    console.log(`[smtp] Ethereal web: https://ethereal.email/login`);
    console.log(`[smtp] Use credentials above to view sent emails`);
  }

  const createdTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    // Connection pool for better performance under load
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  // Verify connection
  try {
    await createdTransporter.verify();
    console.log(`[smtp] SMTP connection verified (${host}:${port})`);
  } catch (err) {
    console.error("[smtp] SMTP verification failed:", (err as Error).message);
    // Don't throw — allow the app to start even if SMTP is temporarily down
  }

  transporter = createdTransporter;
  return transporter;
}

/**
 * Send a single email via SMTP.
 *
 * Returns the result including the Ethereal preview URL
 * (if using Ethereal) for easy verification.
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailSendResult> {
  try {
    const transport = await getTransporter();

    const info = await transport.sendMail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    // Get Ethereal preview URL (only works with Ethereal)
    const previewUrl = nodemailer.getTestMessageUrl(info);

    console.log(
      `[smtp] ✉️  Email sent | messageId: ${info.messageId} | to: ${params.to}` +
        (previewUrl ? ` | preview: ${previewUrl}` : "")
    );

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
    };
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[smtp] ❌ Send failed | to: ${params.to} | error: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Close the SMTP transporter connection pool.
 * Call during graceful shutdown.
 */
export async function closeSmtp(): Promise<void> {
  if (transporter) {
    transporter.close();
    transporter = null;
    console.log("[smtp] SMTP connection closed");
  }
}
