import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const ticketrouter = Router();

// =============================================
// SUPPORT TICKET ROUTES
// =============================================

// Create support ticket
ticketrouter.post("/support-tickets", async (req, res) => {
  try {
    const { subject, message, category } = req.body;
    const allowedCategories = new Set([
      "order",
      "payment",
      "delivery",
      "ride",
      "account",
      "other",
    ]);
    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof message !== "string" ||
      !message.trim() ||
      !allowedCategories.has(category || "other")
    ) {
      return res.status(400).json({
        success: false,
        message: "A subject, message, and valid category are required.",
      });
    }

    const [ticket] = await db
      .insert(schema.supportTickets)
      .values({
        userId: req.user.userId,
        subject: subject.trim(),
        message: message.trim(),
        category: category || "other",
        priority: "medium",
      })
      .returning();

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user support tickets
ticketrouter.get("/users/:userId/tickets", async (req, res) => {
  if (
    Number(req.params.userId) !== req.user.userId &&
    req.user.userType !== "admin"
  ) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot view these tickets." });
  }
  try {
    const { status, limit = 50 } = req.query;
    let query = db
      .select()
      .from(schema.supportTickets)
      .where(eq(schema.supportTickets.userId, parseInt(req.params.userId)))
      .orderBy(desc(schema.supportTickets.createdAt));

    if (status) {
      query = query.where(eq(schema.supportTickets.status, status));
    }

    const tickets = await query.limit(parseInt(limit));
    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update support ticket
ticketrouter.patch("/support-tickets/:id", async (req, res) => {
  try {
    const { status, assignedTo, priority } = req.body;

    const [ticket] = await db
      .update(schema.supportTickets)
      .set({
        status,
        assignedTo,
        priority,
        updatedAt: new Date(),
      })
      .where(eq(schema.supportTickets.ticketId, parseInt(req.params.id)))
      .returning();

    if (!ticket) {
      return res
        .status(404)
        .json({ success: false, message: "Ticket not found" });
    }
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default ticketrouter;
