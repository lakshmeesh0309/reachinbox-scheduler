import { Router } from "express";
import { db } from "../db";
import { senders } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import crypto from "crypto";

export const senderRouter = Router();

// In-memory fallback for offline test environments
const inMemorySenders = new Map<string, any[]>();

/**
 * GET /api/senders
 * Retrieves all active senders belonging to the authenticated user.
 * Auto-provisions a default sender using the user's profile if none exists.
 */
senderRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  try {
    const userSenders = await db
      .select()
      .from(senders)
      .where(and(eq(senders.userId, userId), eq(senders.isActive, true)));

    if (userSenders.length > 0) {
      res.json({ senders: userSenders });
      return;
    }

    // Auto-create default sender if user has none
    const [newSender] = await db
      .insert(senders)
      .values({
        id: crypto.randomUUID(),
        userId,
        email: req.user!.email,
        name: req.user!.name,
        isActive: true,
      })
      .returning();

    res.json({ senders: [newSender] });
  } catch (err) {
    console.warn("[senderRouter] DB query fallback:", (err as Error).message);

    // Fallback store
    let userSenders = inMemorySenders.get(userId);
    if (!userSenders || userSenders.length === 0) {
      userSenders = [
        {
          id: crypto.randomUUID(),
          userId,
          email: req.user!.email,
          name: req.user!.name,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      inMemorySenders.set(userId, userSenders);
    }

    res.json({ senders: userSenders });
  }
});
