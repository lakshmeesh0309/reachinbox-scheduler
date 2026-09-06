import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "../queues/emailQueue";

/**
 * Bull Board Queue Monitoring Dashboard
 *
 * Isolated from core business logic.
 * Uses the existing emailQueue (no new queues created).
 * Displays waiting, delayed, active, completed, and failed jobs.
 */
export const bullBoardServerAdapter = new ExpressAdapter();
bullBoardServerAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: bullBoardServerAdapter,
});
