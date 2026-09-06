import { db, closeDb } from "./index";
import { users, senders, campaigns, emails, slackConnections } from "./schema";

async function seed() {
  console.log("[seed] Starting database seed...");

  // ─── Create test user ──────────────────────────────────
  const [user] = await db
    .insert(users)
    .values({
      googleId: "google-oauth-test-id-12345",
      email: "testuser@reachinbox.dev",
      name: "Test User",
      avatarUrl: "https://ui-avatars.com/api/?name=Test+User&background=6366f1&color=fff",
    })
    .returning();

  console.log(`[seed] Created user: ${user.name} (${user.email})`);

  // ─── Create senders ───────────────────────────────────
  const [sender1] = await db
    .insert(senders)
    .values({
      userId: user.id,
      email: "outreach@reachinbox.dev",
      name: "ReachInbox Outreach",
    })
    .returning();

  const [sender2] = await db
    .insert(senders)
    .values({
      userId: user.id,
      email: "newsletter@reachinbox.dev",
      name: "ReachInbox Newsletter",
    })
    .returning();

  console.log(`[seed] Created senders: ${sender1.email}, ${sender2.email}`);

  // ─── Create campaign ──────────────────────────────────
  const startTime = new Date();
  startTime.setHours(startTime.getHours() + 1); // Start 1 hour from now

  const [campaign] = await db
    .insert(campaigns)
    .values({
      userId: user.id,
      subject: "Welcome to ReachInbox 🚀",
      body: "<h1>Welcome!</h1><p>Thanks for joining ReachInbox. We're excited to have you on board.</p>",
      startTime,
      delayBetweenEmailsMs: 5000, // 5 seconds between emails
      hourlyLimit: 100,
      status: "draft",
    })
    .returning();

  console.log(`[seed] Created campaign: ${campaign.subject}`);

  // ─── Create sample emails ─────────────────────────────
  const emailRecipients = Array.from({ length: 10 }, (_, i) => ({
    campaignId: campaign.id,
    senderId: i % 2 === 0 ? sender1.id : sender2.id,
    recipient: `recipient${i + 1}@example.com`,
    subject: campaign.subject,
    body: campaign.body,
    scheduledAt: new Date(startTime.getTime() + i * campaign.delayBetweenEmailsMs),
    status: "pending" as const,
  }));

  await db.insert(emails).values(emailRecipients);
  console.log(`[seed] Created ${emailRecipients.length} emails for campaign`);

  // ─── Create Slack connection ──────────────────────────
  const [slack] = await db
    .insert(slackConnections)
    .values({
      userId: user.id,
      slackTeamId: "T01TESTTEAM",
      slackTeamName: "ReachInbox Dev Workspace",
      slackUserId: "U01TESTUSER",
      slackAccessToken: "xoxb-test-token-placeholder",
    })
    .returning();

  console.log(`[seed] Created Slack connection: ${slack.slackTeamName}`);

  console.log("[seed] ✅ Seed completed successfully");
  await closeDb();
}

seed().catch((err) => {
  console.error("[seed] ❌ Seed failed:", err);
  process.exit(1);
});
