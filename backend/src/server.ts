import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/index";
import {
  healthRouter,
  emailRouter,
  authRouter,
  slackRouter,
  senderRouter,
} from "./routes";
import { createEmailWorker } from "./workers/emailWorker";
import { recoverPendingEmailJobs } from "./services/queueService";
import { bullBoardServerAdapter } from "./admin/bullBoard";

const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Bull Board dashboard assets to load smoothly
  })
);
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());

// ─── Routes ─────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/slack", slackRouter);
app.use("/api/senders", senderRouter);
app.use("/api/emails", emailRouter);

// ─── Bull Board Queue Dashboard ─────────────────────────────
app.use("/admin/queues", bullBoardServerAdapter.getRouter());

// ─── BullMQ Worker & Recovery ───────────────────────────────
const emailWorker = createEmailWorker();

recoverPendingEmailJobs().catch((err) => {
  console.warn("[server] Pending email recovery notice:", (err as Error).message);
});

// ─── Graceful Shutdown ──────────────────────────────────────
async function shutdown() {
  console.log("[server] Shutting down gracefully...");
  await emailWorker.close();
  console.log("[server] Worker closed");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ─── Start ──────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(
    `[server] ReachInbox backend running on http://localhost:${config.port}`
  );
  console.log(`[server] Environment: ${config.nodeEnv}`);
});

export default app;
