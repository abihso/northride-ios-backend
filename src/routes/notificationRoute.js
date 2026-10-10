import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const notificationrouter = Router();

// =============================================
// NOTIFICATION ROUTES
// =============================================

// Get user notifications
notificationrouter.get("/users/:userId/notifications", async (req, res) => {
  if (
    Number(req.params.userId) !== req.user.userId &&
    req.user.userType !== "admin"
  ) {
    return res.status(403).json({
      success: false,
      message: "You cannot view these notifications.",
    });
  }
  try {
    const { isRead, limit = 50 } = req.query;
    const [preferences] = await db
      .select({
        receiveRideUpdates: schema.riderPreferences.receiveRideUpdates,
        receiveDeliveryUpdates: schema.riderPreferences.receiveDeliveryUpdates,
        receivePaymentUpdates: schema.riderPreferences.receivePaymentUpdates,
        receiveAccountUpdates: schema.riderPreferences.receiveAccountUpdates,
      })
      .from(schema.riderPreferences)
      .where(eq(schema.riderPreferences.userId, Number(req.params.userId)))
      .limit(1);
    const enabledTypes = [
      ...(preferences?.receiveRideUpdates !== false ? ["ride"] : []),
      ...(preferences?.receiveDeliveryUpdates !== false ? ["delivery"] : []),
      ...(preferences?.receivePaymentUpdates !== false ? ["payment"] : []),
      ...(preferences?.receiveAccountUpdates !== false
        ? ["system", "order", "promotion"]
        : []),
    ];
    const conditions = [
      eq(schema.notifications.userId, Number(req.params.userId)),
      inArray(schema.notifications.type, enabledTypes),
    ];
    if (isRead !== undefined) {
      conditions.push(eq(schema.notifications.isRead, isRead === "true"));
    }
    const notifications = await db
      .select()
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(Math.max(1, Math.min(100, Number(limit) || 50)));

    // Get unread count
    const unreadCount = await db
      .select({
        count: sql`COUNT(*)`,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, Number(req.params.userId)),
          eq(schema.notifications.isRead, false),
          inArray(schema.notifications.type, enabledTypes),
        ),
      );

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount: Number(unreadCount[0]?.count ?? 0),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark notification as read
notificationrouter.patch("/notifications/:id/read", async (req, res) => {
  try {
    const [existingNotification] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.notificationId, parseInt(req.params.id)));
    if (!existingNotification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }
    if (
      existingNotification.userId !== req.user.userId &&
      req.user.userType !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot update this notification.",
      });
    }

    const [notification] = await db
      .update(schema.notifications)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where(eq(schema.notifications.notificationId, parseInt(req.params.id)))
      .returning();

    if (!notification) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark all notifications as read
notificationrouter.post(
  "/users/:userId/notifications/read-all",
  async (req, res) => {
    if (
      Number(req.params.userId) !== req.user.userId &&
      req.user.userType !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot update these notifications.",
      });
    }
    try {
      await db
        .update(schema.notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(schema.notifications.userId, parseInt(req.params.userId)),
            eq(schema.notifications.isRead, false),
          ),
        );

      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

// Create notification
notificationrouter.post("/notifications", async (req, res) => {
  try {
    const { userId, title, message, type, referenceId, referenceType } =
      req.body;

    const [notification] = await db
      .insert(schema.notifications)
      .values({
        userId,
        title,
        message,
        type: type || "system",
        referenceId,
        referenceType,
      })
      .returning();

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
export default notificationrouter;
