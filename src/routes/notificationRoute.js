import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const notificationrouter = Router()

// =============================================
// NOTIFICATION ROUTES
// =============================================

// Get user notifications
notificationrouter.get("/users/:userId/notifications", async (req, res) => {
  try {
    const { isRead, limit = 50 } = req.query;
    let query = db.select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, parseInt(req.params.userId)))
      .orderBy(desc(schema.notifications.createdAt));
    
    if (isRead !== undefined) {
      query = query.where(eq(schema.notifications.isRead, isRead === "true"));
    }
    
    const notifications = await query.limit(parseInt(limit));
    
    // Get unread count
    const unreadCount = await db.select({
      count: sql`COUNT(*)`
    }).from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, parseInt(req.params.userId)),
          eq(schema.notifications.isRead, false)
        )
      );
    
    res.json({ 
      success: true, 
      data: {
        notifications,
        unreadCount: parseInt(unreadCount[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark notification as read
notificationrouter.patch("/notifications/:id/read", async (req, res) => {
  try {
    const [notification] = await db.update(schema.notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(schema.notifications.notificationId, parseInt(req.params.id)))
      .returning();
    
    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark all notifications as read
notificationrouter.post("/users/:userId/notifications/read-all", async (req, res) => {
  try {
    await db.update(schema.notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(schema.notifications.userId, parseInt(req.params.userId)),
          eq(schema.notifications.isRead, false)
        )
      );
    
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create notification
notificationrouter.post("/notifications", async (req, res) => {
  try {
    const { userId, title, message, type, referenceId, referenceType } = req.body;
    
    const [notification] = await db.insert(schema.notifications).values({
      userId,
      title,
      message,
      type: type || "system",
      referenceId,
      referenceType,
    }).returning();
    
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
export default notificationrouter