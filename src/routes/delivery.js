import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import { findActiveRequest } from "../utils/activeRideRequest.js";
import {
  isDeliveryPaymentConfirmed,
  shouldMarkCashPaymentPaid,
} from "../utils/deliveryPayment.js";
import { getDeliveryQuote } from "./mapsRoute.js";

const deliveryRouter = Router();
const isAdmin = (req) => req.user?.userType === "admin";

const getRiderForUser = async (userId) => {
  const [rider] = await db
    .select()
    .from(schema.riders)
    .where(eq(schema.riders.userId, userId))
    .limit(1);
  return rider;
};

// =============================================
// DELIVERY ROUTES
// =============================================

deliveryRouter.get("/admin/deliveries", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const deliveries = await db
      .select({
        deliveryId: schema.deliveries.deliveryId,
        deliveryReference: schema.deliveries.deliveryReference,
        deliveryType: schema.deliveries.deliveryType,
        status: schema.deliveries.status,
        senderId: schema.deliveries.senderId,
        riderId: schema.deliveries.riderId,
        pickupAddress: schema.deliveries.pickupAddress,
        dropoffAddress: schema.deliveries.dropoffAddress,
        recipientName: schema.deliveries.recipientName,
        totalAmount: schema.deliveries.totalAmount,
        paymentStatus: schema.deliveries.paymentStatus,
        createdAt: schema.deliveries.createdAt,
      })
      .from(schema.deliveries)
      .orderBy(desc(schema.deliveries.createdAt))
      .limit(limit);

    return res.json({ success: true, data: deliveries });
  } catch (error) {
    console.error("Could not load admin delivery queue:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load the delivery queue.",
    });
  }
});

deliveryRouter.patch("/deliveries/:id/assign-rider", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const deliveryId = Number(req.params.id);
  const { riderId } = req.body || {};
  if (
    !Number.isInteger(deliveryId) ||
    deliveryId <= 0 ||
    (riderId !== null && (!Number.isInteger(riderId) || riderId <= 0))
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid delivery and rider ID are required.",
    });
  }
  try {
    if (riderId !== null) {
      const [rider] = await db
        .select({ riderId: schema.riders.riderId })
        .from(schema.riders)
        .where(
          and(
            eq(schema.riders.riderId, riderId),
            eq(schema.riders.isApproved, true),
          ),
        )
        .limit(1);
      if (!rider) {
        return res.status(400).json({
          success: false,
          message: "Choose an approved rider.",
        });
      }
    }
    const [delivery] = await db
      .update(schema.deliveries)
      .set({ riderId, updatedAt: new Date() })
      .where(eq(schema.deliveries.deliveryId, deliveryId))
      .returning();
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found.",
      });
    }
    return res.json({ success: true, data: delivery });
  } catch (error) {
    console.error("Could not assign delivery rider:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the delivery assignment.",
    });
  }
});

deliveryRouter.delete("/deliveries/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const deliveryId = Number(req.params.id);
  if (!Number.isInteger(deliveryId) || deliveryId <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid delivery ID is required.",
    });
  }
  try {
    const [delivery] = await db
      .select({
        status: schema.deliveries.status,
        paymentStatus: schema.deliveries.paymentStatus,
        riderId: schema.deliveries.riderId,
      })
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));
    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found.",
      });
    }
    if (
      delivery.status !== "pending" ||
      delivery.paymentStatus !== "pending" ||
      delivery.riderId !== null
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only unassigned, pending, unpaid deliveries can be deleted. Cancel or update this delivery to preserve its operational and payment history.",
      });
    }
    const [transaction] = await db
      .select({ transactionId: schema.walletTransactions.transactionId })
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.deliveryId, deliveryId))
      .limit(1);
    const [earning] = await db
      .select({ earningId: schema.riderEarnings.earningId })
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.deliveryId, deliveryId))
      .limit(1);
    if (transaction || earning) {
      return res.status(409).json({
        success: false,
        message:
          "This delivery has financial history and cannot be deleted. Update its status to preserve the record.",
      });
    }
    const [deleted] = await db
      .delete(schema.deliveries)
      .where(
        and(
          eq(schema.deliveries.deliveryId, deliveryId),
          eq(schema.deliveries.status, "pending"),
          eq(schema.deliveries.paymentStatus, "pending"),
          isNull(schema.deliveries.riderId),
        ),
      )
      .returning({ deliveryId: schema.deliveries.deliveryId });
    if (!deleted) {
      return res.status(409).json({
        success: false,
        message:
          "The delivery changed and is no longer eligible for deletion. Refresh the list.",
      });
    }
    return res.json({ success: true, message: "Delivery deleted." });
  } catch (error) {
    console.error("Could not delete admin delivery:", error);
    return res.status(500).json({
      success: false,
      message: "Could not delete the delivery.",
    });
  }
});

// 1. Create a new delivery order
deliveryRouter.post("/deliveries", async (req, res) => {
  try {
    const {
      deliveryType,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      pickupContactName,
      pickupContactPhone,
      dropoffAddress,
      dropoffLatitude,
      dropoffLongitude,
      recipientName,
      recipientPhone,
      packageWeightKg,
      distanceKm,
      deliveryFee,
      totalAmount,
      paymentMethod,
    } = req.body;

    if (paymentMethod !== "cash") {
      return res.status(400).json({
        success: false,
        message: "Use verified payment checkout for non-cash deliveries.",
      });
    }

    if (
      !pickupAddress ||
      !dropoffAddress ||
      !recipientName ||
      !recipientPhone ||
      !deliveryFee ||
      !totalAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Required delivery details are missing.",
      });
    }
    if (
      ["send", "receive"].includes(deliveryType) &&
      (typeof recipientName !== "string" ||
        typeof recipientPhone !== "string" ||
        !recipientName.trim() ||
        !recipientPhone.trim() ||
        recipientName.trim().toLowerCase() === "not set yet" ||
        recipientPhone.trim().toLowerCase() === "not set yet")
    ) {
      return res.status(400).json({
        success: false,
        message: "A recipient name and phone number are required.",
      });
    }

    const quote = await getDeliveryQuote(
      req.body,
      deliveryType === "ride" ? "ride" : "delivery",
    );

    const deliveryReference = `DEL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await db.transaction(async (tx) => {
      if (["ride", "send", "receive"].includes(deliveryType)) {
        await tx
          .select({ userId: schema.users.userId })
          .from(schema.users)
          .where(eq(schema.users.userId, req.user.userId))
          .for("update")
          .limit(1);

        const activeRequest = await findActiveRequest(
          tx,
          req.user.userId,
          deliveryType,
        );
        if (activeRequest) return { activeRequest };
      }

      const [insertedDelivery] = await tx
        .insert(schema.deliveries)
        .values({
          senderId: req.user.userId,
          deliveryType,
          status: "pending",
          pickupAddress,
          pickupLatitude,
          pickupLongitude,
          pickupContactName,
          pickupContactPhone,
          dropoffAddress,
          dropoffLatitude,
          dropoffLongitude,
          recipientName,
          recipientPhone,
          packageWeightKg,
          isFragile: true,
          distanceKm: quote.distanceKm,
          deliveryFee: quote.totalAmount,
          tipAmount: 0,
          totalAmount: quote.totalAmount,
          paymentMethod,
          paymentStatus: "pending",
          deliveryReference,
        })
        .returning();

      return { delivery: insertedDelivery };
    });

    if (result.activeRequest) {
      return res.status(409).json({
        success: false,
        code: "ACTIVE_REQUEST_EXISTS",
        message: `You already have an active ${deliveryType} request. Complete or cancel it before booking another ${deliveryType} request.`,
      });
    }
    return res.status(201).json({ success: true, data: result.delivery });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Get delivery details with items
deliveryRouter.get("/deliveries/:id", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const [delivery] = await db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));

    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }

    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    if (
      !isAdmin(req) &&
      delivery.senderId !== req.user.userId &&
      delivery.riderId !== rider?.riderId
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view this delivery." });
    }

    const items = await db
      .select()
      .from(schema.deliveryItems)
      .where(eq(schema.deliveryItems.deliveryId, deliveryId));

    res.json({
      success: true,
      data: {
        ...delivery,
        items,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get deliveries for a user or rider (with optional status filter)
deliveryRouter.get("/users/:userId/deliveries", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { role = "sender", status, limit = 50 } = req.query;

    if (userId !== req.user.userId && !isAdmin(req)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view these deliveries." });
    }
    if (role === "rider" && req.user.userType !== "rider" && !isAdmin(req)) {
      return res
        .status(403)
        .json({ success: false, message: "Rider access required." });
    }

    const rider =
      role === "rider" && !isAdmin(req)
        ? await getRiderForUser(req.user.userId)
        : null;
    const userCondition =
      role === "rider"
        ? eq(schema.deliveries.riderId, rider?.riderId ?? -1)
        : eq(schema.deliveries.senderId, userId);

    const conditions = status
      ? and(userCondition, eq(schema.deliveries.status, status))
      : userCondition;

    const userDeliveries = await db
      .select()
      .from(schema.deliveries)
      .where(conditions)
      .orderBy(desc(schema.deliveries.createdAt))
      .limit(parseInt(limit));

    const grouped = userDeliveries.reduce((acc, delivery) => {
      const dateKey = new Date(delivery.createdAt).toISOString().split("T")[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(delivery);
      return acc;
    }, {});

    const groupedArray = Object.keys(grouped).map((date) => ({
      date: date,
      deliveries: grouped[date],
    }));

    res.json({ success: true, data: groupedArray });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

deliveryRouter.post("/deliveries/:id/request-payment", async (req, res) => {
  try {
    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    if (!rider?.isApproved) {
      return res.status(403).json({
        success: false,
        message: "An approved rider account is required.",
      });
    }

    const deliveryId = Number(req.params.id);
    const result = await db.transaction(async (tx) => {
      const [delivery] = await tx
        .select()
        .from(schema.deliveries)
        .where(eq(schema.deliveries.deliveryId, deliveryId))
        .for("update")
        .limit(1);
      if (!delivery) return { status: 404, message: "Delivery not found." };
      if (delivery.riderId !== rider.riderId) {
        return {
          status: 403,
          message: "This delivery is not assigned to you.",
        };
      }
      if (delivery.status !== "in_transit") {
        return {
          status: 409,
          message: "Payment can be requested when the delivery is in transit.",
        };
      }
      if (delivery.paymentStatus === "paid") {
        return { status: 409, message: "This delivery is already paid." };
      }
      if (delivery.paymentMethod !== "cash") {
        return {
          status: 409,
          message:
            "This delivery is waiting for its online payment to complete.",
        };
      }
      if (delivery.paymentStatus === "paidandwaiting") {
        return {
          alreadyRequested: true,
          delivery,
        };
      }
      if (delivery.paymentStatus !== "pending") {
        return {
          status: 409,
          message: "This delivery cannot accept a payment request right now.",
        };
      }

      const [updatedDelivery] = await tx
        .update(schema.deliveries)
        .set({ paymentStatus: "paidandwaiting", updatedAt: new Date() })
        .where(
          and(
            eq(schema.deliveries.deliveryId, deliveryId),
            eq(schema.deliveries.paymentStatus, "pending"),
          ),
        )
        .returning();
      const [notification] = await tx
        .insert(schema.notifications)
        .values({
          userId: delivery.senderId,
          title: "Payment requested",
          message: `Your rider is requesting GHS ${Number(delivery.totalAmount).toFixed(2)} in cash for delivery ${delivery.deliveryReference}. Please pay the rider before they complete delivery.`,
          type: "payment",
          referenceId: delivery.deliveryId,
          referenceType: "delivery",
        })
        .returning();

      return { delivery: updatedDelivery, notification };
    });

    if (result.status) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }
    return res.json({
      success: true,
      alreadyRequested: Boolean(result.alreadyRequested),
      data: result.delivery,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Update delivery status & log rider earnings (WITH SOCKET.IO REAL-TIME PUSH)
deliveryRouter.patch("/deliveries/:id/status", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const { status } = req.body;
    const deliveryStatuses = new Set([
      "pending",
      "searching",
      "accepted",
      "picked_up",
      "in_transit",
      "delivered",
      "failed",
      "cancelled",
    ]);
    const allowedStatuses = new Set([
      "accepted",
      "picked_up",
      "in_transit",
      "delivered",
      "failed",
    ]);
    if (
      !deliveryStatuses.has(status) ||
      (!isAdmin(req) &&
        (!allowedStatuses.has(status) || req.user.userType !== "rider"))
    ) {
      return res.status(403).json({
        success: false,
        message: "This status change is not permitted.",
      });
    }

    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    const [existingDelivery] = await db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));
    if (!existingDelivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }
    if (!isAdmin(req) && (!rider || !rider.isApproved)) {
      return res.status(403).json({
        success: false,
        message: "An approved rider account is required.",
      });
    }
    const acceptingOpenDelivery =
      !isAdmin(req) &&
      status === "accepted" &&
      !existingDelivery.riderId &&
      ["pending", "searching"].includes(existingDelivery.status);
    if (
      !isAdmin(req) &&
      !acceptingOpenDelivery &&
      existingDelivery.riderId !== rider?.riderId
    ) {
      return res.status(403).json({
        success: false,
        message: "This delivery is not assigned to you.",
      });
    }
    const nextRiderStatuses = {
      accepted: ["picked_up", "failed"],
      picked_up: ["in_transit", "failed"],
      in_transit: ["delivered", "failed"],
    };
    if (
      !isAdmin(req) &&
      !acceptingOpenDelivery &&
      !nextRiderStatuses[existingDelivery.status]?.includes(status)
    ) {
      return res.status(409).json({
        success: false,
        message: "This delivery status transition is not permitted.",
      });
    }

    if (
      !isAdmin(req) &&
      status === "delivered" &&
      !isDeliveryPaymentConfirmed(existingDelivery, req.body.paymentReceived)
    ) {
      return res.status(409).json({
        success: false,
        message:
          existingDelivery.paymentMethod === "cash" &&
          existingDelivery.paymentStatus === "pending"
            ? "Request payment from the customer before completing this delivery."
            : "Payment must be confirmed before completing this delivery.",
      });
    }

    const updateData = {
      status,
      ...(acceptingOpenDelivery && { riderId: rider.riderId }),
      ...(shouldMarkCashPaymentPaid(
        existingDelivery,
        req.body.paymentReceived,
      ) && {
        paymentStatus: "paid",
      }),
      updatedAt: new Date(),
    };
    if (status === "picked_up") updateData.pickedUpAt = new Date();
    if (status === "delivered") updateData.deliveredAt = new Date();

    const updatedDelivery = acceptingOpenDelivery
      ? await db.transaction(async (tx) => {
          const [claimedRider] = await tx
            .update(schema.riders)
            .set({ isAvailable: false })
            .where(
              and(
                eq(schema.riders.riderId, rider.riderId),
                eq(schema.riders.isAvailable, true),
              ),
            )
            .returning({ riderId: schema.riders.riderId });
          if (!claimedRider) return null;

          const [delivery] = await tx
            .update(schema.deliveries)
            .set(updateData)
            .where(
              and(
                eq(schema.deliveries.deliveryId, deliveryId),
                isNull(schema.deliveries.riderId),
                or(
                  eq(schema.deliveries.status, "pending"),
                  eq(schema.deliveries.status, "searching"),
                ),
              ),
            )
            .returning();
          if (!delivery) {
            await tx
              .update(schema.riders)
              .set({ isAvailable: true })
              .where(eq(schema.riders.riderId, rider.riderId));
          }
          return delivery ?? null;
        })
      : (
          await db
            .update(schema.deliveries)
            .set(updateData)
            .where(eq(schema.deliveries.deliveryId, deliveryId))
            .returning()
        )[0];
    if (!updatedDelivery) {
      return res.status(409).json({
        success: false,
        message: "This delivery has already been assigned.",
      });
    }

    // ==========================================
    // REAL-TIME SOCKET.IO NOTIFICATION TO RIDER
    // ==========================================
    const targetRiderId = updatedDelivery.riderId;
    if (targetRiderId) {
      const io = req.app.get("io");
      if (io) {
        io.to(`rider_${targetRiderId}`).emit("delivery_updated", {
          success: true,
          deliveryId,
          status: updatedDelivery.status,
          paymentStatus: updatedDelivery.paymentStatus,
          earningAmount: "0.00",
          message: `Delivery #${deliveryId} status updated to ${status}`,
        });
      }
    }

    res.json({ success: true, data: updatedDelivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Cancel a delivery
deliveryRouter.patch("/deliveries/:id/cancel", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);
    const [existingDelivery] = await db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));
    if (!existingDelivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }
    if (
      !isAdmin(req) &&
      (existingDelivery.senderId !== req.user.userId ||
        !["pending", "searching"].includes(existingDelivery.status))
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot cancel this delivery." });
    }

    const [cancelledDelivery] = await db
      .update(schema.deliveries)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.deliveries.deliveryId, deliveryId))
      .returning();

    if (!cancelledDelivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }

    // Notify rider if delivery is cancelled
    if (cancelledDelivery.riderId) {
      const io = req.app.get("io");
      if (io) {
        io.to(`rider_${cancelledDelivery.riderId}`).emit("delivery_cancelled", {
          deliveryId,
          message: `Delivery #${deliveryId} has been cancelled.`,
        });
      }
    }

    res.json({ success: true, data: cancelledDelivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Reject a delivery offer (by a rider)
deliveryRouter.post("/deliveries/:id/reject", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const { reason } = req.body;
    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    const riderId =
      rider?.riderId ?? (isAdmin(req) ? Number(req.body.riderId) : NaN);
    const [delivery] = await db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));
    if (!delivery) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery not found" });
    }
    if (
      !Number.isInteger(riderId) ||
      (!isAdmin(req) &&
        (!rider?.isApproved ||
          delivery.riderId !== null ||
          !["pending", "searching"].includes(delivery.status)))
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Rider access required." });
    }

    await db.insert(schema.riderRejections).values({
      deliveryId,
      riderId,
      reason,
    });

    res.json({
      success: true,
      message: "Delivery offer rejected successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Get total earnings summary for a rider
deliveryRouter.get("/riders/:riderId/earnings", async (req, res) => {
  try {
    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    const riderId = Number(req.params.riderId);
    if (!isAdmin(req) && (!rider || rider.riderId !== riderId)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view these earnings." });
    }

    const earningsHistory = await db
      .select()
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId))
      .orderBy(desc(schema.riderEarnings.createdAt));

    const totalEarningsResult = await db
      .select({
        total: sql`SUM(${schema.riderEarnings.totalEarned})`,
      })
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId));

    res.json({
      success: true,
      data: {
        totalEarnings: totalEarningsResult[0]?.total || "0.00",
        history: earningsHistory,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

deliveryRouter.get(
  "/users/:userId/deliveries/:status/:category",
  async (req, res) => {
    // /users/7/deliveries/delivered/send
    console.log("hit");
    try {
      const userId = parseInt(req.params.userId);
      if (userId !== req.user.userId && !isAdmin(req)) {
        return res.status(403).json({
          success: false,
          message: "You cannot view these deliveries.",
        });
      }
      const status = req.params.status;
      const category = req.params.category;
      console.log("userId:", userId, "status:", status);

      const userDeliveries = await db
        .select()
        .from(schema.deliveries)
        .where(
          and(
            eq(schema.deliveries.senderId, userId),
            eq(schema.deliveries.deliveryType, category),
            eq(schema.deliveries.status, status),
          ),
        )
        .orderBy(desc(schema.deliveries.createdAt));

      // Group deliveries by date (YYYY-MM-DD)
      const grouped = userDeliveries.reduce((acc, delivery) => {
        const dateKey = new Date(delivery.createdAt)
          .toISOString()
          .split("T")[0];
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(delivery);
        return acc;
      }, {});

      const groupedArray = Object.keys(grouped).map((date) => ({
        date: date,
        deliveries: grouped[date],
      }));

      return res.json({ success: true, data: groupedArray });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

deliveryRouter.get(
  "/users/:userId/deliveries/:status/:category/past",
  async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (userId !== req.user.userId && !isAdmin(req)) {
        return res.status(403).json({
          success: false,
          message: "You cannot view these deliveries.",
        });
      }
      const status = req.params.status;
      const category = req.params.category;
      console.log("userId:", userId, "status:", status);

      const userDeliveries = await db
        .select()
        .from(schema.deliveries)
        .where(
          and(
            eq(schema.deliveries.senderId, userId),
            eq(schema.deliveries.deliveryType, category),
            or(
              eq(schema.deliveries.status, "pending"),
              eq(schema.deliveries.status, "delivered"),
              eq(schema.deliveries.status, "cancelled"),
            ),
          ),
        )
        .orderBy(desc(schema.deliveries.createdAt));

      // Group deliveries by date (YYYY-MM-DD)
      const grouped = userDeliveries.reduce((acc, delivery) => {
        const dateKey = new Date(delivery.createdAt)
          .toISOString()
          .split("T")[0];
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(delivery);
        return acc;
      }, {});

      const groupedArray = Object.keys(grouped).map((date) => ({
        date: date,
        deliveries: grouped[date],
      }));

      return res.json({ success: true, data: groupedArray });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ success: false, message: error.message });
    }
  },
);

export default deliveryRouter;
