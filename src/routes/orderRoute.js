import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  findActiveRequest,
  findActiveRideRequest,
} from "../utils/activeRideRequest.js";
import { getDeliveryQuote } from "./mapsRoute.js";

const orderroute = Router();

orderroute.get("/admin/orders", async (req, res) => {
  if (req.user?.userType !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const orders = await db
      .select()
      .from(schema.orders)
      .orderBy(desc(schema.orders.orderPlacedAt))
      .limit(limit);
    return res.json({ success: true, data: orders });
  } catch (error) {
    console.error("Could not load admin order queue:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load the order queue.",
    });
  }
});

// =============================================
// ORDER ROUTES
// =============================================

// Create order
orderroute.post("/orders", async (req, res) => {
  try {
    const {
      shopId,
      orderType,
      paymentMethod,
      subtotal,
      deliveryFee,
      serviceCharge,
      totalAmount,
      discountAmount,
      tipAmount,
      deliveryAddress,
      deliveryLatitude,
      deliveryLongitude,
      deliveryInstructions,
      rideId,
    } = req.body;

    const orderReference = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const [order] = await db
      .insert(schema.orders)
      .values({
        userId: req.user.userId,
        shopId,
        orderReference,
        orderType: orderType || "delivery",
        paymentMethod,
        subtotal,
        deliveryFee: deliveryFee || 0,
        serviceCharge: serviceCharge || 0,
        totalAmount,
        discountAmount: discountAmount || 0,
        tipAmount: tipAmount || 0,
        deliveryAddress,
        deliveryLatitude,
        deliveryLongitude,
        deliveryInstructions,
        rideId,
        status: "pending",
        paymentStatus: "pending",
      })
      .returning();

    new URL(
      "/api/payments/callback",
      `${req.protocol}://${req.get("host")}`,
    ).toString();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get order by ID
orderroute.get("/orders/:id", async (req, res) => {
  try {
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, parseInt(req.params.id)));

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    if (order.userId !== req.user.userId && req.user.userType !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view this order." });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user orders
orderroute.get("/users/:userId/orders", async (req, res) => {
  if (
    Number(req.params.userId) !== req.user.userId &&
    req.user.userType !== "admin"
  ) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot view these orders." });
  }
  try {
    const { status, limit = 50 } = req.query;
    let query = db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.userId, parseInt(req.params.userId)))
      .orderBy(desc(schema.orders.orderPlacedAt));

    if (status) {
      query = query.where(eq(schema.orders.status, status));
    }

    const orders = await query.limit(parseInt(limit));
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update order status
orderroute.patch("/orders/:id/status", async (req, res) => {
  if (req.user.userType !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  try {
    const { status } = req.body;
    const orderId = parseInt(req.params.id);
    if (
      ![
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "picked_up",
        "in_transit",
        "delivered",
        "cancelled",
        "rejected",
      ].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid order status is required.",
      });
    }

    let updateData = { status };
    const timestamp = new Date();

    // Update specific timestamps based on status
    switch (status) {
      case "confirmed":
        updateData.confirmedAt = timestamp;
        break;
      case "preparing":
        updateData.preparingAt = timestamp;
        break;
      case "ready":
        updateData.readyAt = timestamp;
        break;
      case "picked_up":
        updateData.pickedUpAt = timestamp;
        break;
      case "in_transit":
        updateData.inTransitAt = timestamp;
        break;
      case "delivered":
        updateData.deliveredAt = timestamp;
        break;
      case "cancelled":
        updateData.cancelledAt = timestamp;
        break;
    }

    const [order] = await db
      .update(schema.orders)
      .set(updateData)
      .where(eq(schema.orders.orderId, orderId))
      .returning();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Assign rider to order
orderroute.patch("/orders/:id/assign-rider", async (req, res) => {
  if (req.user.userType !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  try {
    const { riderId } = req.body;
    const orderId = Number(req.params.id);
    if (
      !Number.isInteger(orderId) ||
      orderId <= 0 ||
      (riderId !== null && (!Number.isInteger(riderId) || riderId <= 0))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid order and rider ID are required.",
      });
    }
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

    const [order] = await db
      .update(schema.orders)
      .set({ riderId })
      .where(eq(schema.orders.orderId, orderId))
      .returning();

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

orderroute.delete("/orders/:id", async (req, res) => {
  if (req.user?.userType !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid order ID is required.",
    });
  }
  try {
    const [order] = await db
      .select({
        status: schema.orders.status,
        paymentStatus: schema.orders.paymentStatus,
        riderId: schema.orders.riderId,
      })
      .from(schema.orders)
      .where(eq(schema.orders.orderId, orderId));
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }
    if (
      order.status !== "pending" ||
      order.paymentStatus !== "pending" ||
      order.riderId !== null
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only unassigned, pending, unpaid orders can be deleted. Cancel or update this order to preserve its operational and payment history.",
      });
    }
    const [transaction] = await db
      .select({ transactionId: schema.walletTransactions.transactionId })
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.orderId, orderId))
      .limit(1);
    const [earning] = await db
      .select({ earningId: schema.riderEarnings.earningId })
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.orderId, orderId))
      .limit(1);
    if (transaction || earning) {
      return res.status(409).json({
        success: false,
        message:
          "This order has financial history and cannot be deleted. Update its status to preserve the record.",
      });
    }

    const [deleted] = await db
      .delete(schema.orders)
      .where(
        and(
          eq(schema.orders.orderId, orderId),
          eq(schema.orders.status, "pending"),
          eq(schema.orders.paymentStatus, "pending"),
          isNull(schema.orders.riderId),
        ),
      )
      .returning({ orderId: schema.orders.orderId });
    if (!deleted) {
      return res.status(409).json({
        success: false,
        message:
          "The order changed and is no longer eligible for deletion. Refresh the list.",
      });
    }
    return res.json({ success: true, message: "Order deleted." });
  } catch (error) {
    console.error("Could not delete admin order:", error);
    return res.status(500).json({
      success: false,
      message: "Could not delete the order.",
    });
  }
});

// =============================================
// PAYSTACK PAYMENT & WEBHOOK ROUTES
// =============================================

const createPaidDelivery = async (transaction) => {
  const metadata = transaction.metadata || {};
  const details = metadata.delivery;
  const userId = Number(metadata.userId);
  const reference = transaction.reference;
  const existing = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.deliveryReference, reference));

  if (existing.length) {
    if (existing[0].senderId !== userId) {
      throw new Error("Payment reference belongs to another user.");
    }
    return existing[0];
  }

  if (!details || !Number.isInteger(userId) || !reference) {
    throw new Error("Payment metadata is incomplete.");
  }
  if (
    ["send", "receive"].includes(details.deliveryType) &&
    (typeof details.recipientName !== "string" ||
      typeof details.recipientPhone !== "string" ||
      !details.recipientName.trim() ||
      !details.recipientPhone.trim() ||
      details.recipientName.trim().toLowerCase() === "not set yet" ||
      details.recipientPhone.trim().toLowerCase() === "not set yet")
  ) {
    throw new Error("Delivery recipient name and phone number are missing.");
  }
  if (
    transaction.currency !== "GHS" ||
    !Number.isInteger(Number(metadata.expectedAmount)) ||
    Number(transaction.amount) !== Number(metadata.expectedAmount)
  ) {
    throw new Error("Payment amount does not match the delivery total.");
  }

  const result = await db.transaction(async (tx) => {
    if (["ride", "send", "receive"].includes(details.deliveryType)) {
      await tx
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.userId, userId))
        .for("update")
        .limit(1);
      const activeRequest = await findActiveRequest(
        tx,
        userId,
        details.deliveryType,
      );
      if (activeRequest) return { activeRequest };
    }

    const [delivery] = await tx
      .insert(schema.deliveries)
      .values({
        senderId: userId,
        deliveryReference: reference,
        deliveryType: details.deliveryType,
        status: "pending",
        pickupAddress: details.pickupAddress,
        pickupLatitude: details.pickupLatitude,
        pickupLongitude: details.pickupLongitude,
        pickupContactName: details.pickupContactName || "not set yet",
        pickupContactPhone: details.pickupContactPhone || "not set yet",
        dropoffAddress: details.dropoffAddress,
        dropoffLatitude: details.dropoffLatitude,
        dropoffLongitude: details.dropoffLongitude,
        recipientName: details.recipientName || "not set yet",
        recipientPhone: details.recipientPhone || "not set yet",
        packageWeightKg: details.packageWeightKg || 1,
        distanceKm: details.distanceKm || 0,
        deliveryFee: details.deliveryFee,
        totalAmount: details.totalAmount,
        paymentMethod: "paystack",
        paymentStatus: "paid",
      })
      .onConflictDoNothing({ target: schema.deliveries.deliveryReference })
      .returning();
    return { delivery };
  });

  if (result.activeRequest) {
    const requestType = details.deliveryType;
    const error = new Error(
      `You already have an active ${requestType} request. Complete or cancel it before booking another ${requestType} request.`,
    );
    error.status = 409;
    error.code = "ACTIVE_REQUEST_EXISTS";
    throw error;
  }
  const delivery = result.delivery;

  if (delivery) {
    return delivery;
  }

  const [existingDelivery] = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.deliveryReference, reference));
  if (!existingDelivery || existingDelivery.senderId !== userId) {
    throw new Error("Unable to record verified delivery payment.");
  }
  return existingDelivery;
};

const createPaidRide = async (transaction) => {
  const metadata = transaction.metadata || {};
  const details = metadata.ride;
  const userId = Number(metadata.userId);
  const reference = transaction.reference;
  const [existingRide] = reference
    ? await db
        .select()
        .from(schema.rideBookings)
        .where(eq(schema.rideBookings.rideReference, reference))
    : [];

  if (existingRide) {
    if (existingRide.userId !== userId) {
      throw new Error("Payment reference belongs to another user.");
    }
    return existingRide;
  }
  if (!details || !Number.isInteger(userId) || !reference) {
    throw new Error("Ride payment metadata is incomplete.");
  }
  if (
    transaction.currency !== "GHS" ||
    !Number.isInteger(Number(metadata.expectedAmount)) ||
    Number(transaction.amount) !== Number(metadata.expectedAmount)
  ) {
    throw new Error("Payment amount does not match the ride fare.");
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.userId, userId))
      .for("update")
      .limit(1);
    const activeRide = await findActiveRideRequest(tx, userId);
    if (activeRide) return { activeRide };

    const [ride] = await tx
      .insert(schema.rideBookings)
      .values({
        userId,
        rideReference: reference,
        rideType: details.rideType || "standard",
        bookingType: details.bookingType || "now",
        pickupAddress: details.pickupAddress,
        pickupLatitude: details.pickupLatitude,
        pickupLongitude: details.pickupLongitude,
        dropoffAddress: details.dropoffAddress,
        dropoffLatitude: details.dropoffLatitude,
        dropoffLongitude: details.dropoffLongitude,
        estimatedDistance: details.estimatedDistance,
        estimatedDuration: details.estimatedDuration,
        estimatedPrice: details.estimatedPrice,
        paymentMethod: "card",
        paymentStatus: "paid",
        paymentReference: reference,
        status: "pending",
      })
      .onConflictDoNothing({ target: schema.rideBookings.rideReference })
      .returning();
    return { ride };
  });

  if (result.activeRide) {
    const error = new Error(
      "You already have a ride in progress. Complete or cancel it before booking another ride.",
    );
    error.status = 409;
    error.code = "ACTIVE_RIDE_EXISTS";
    throw error;
  }
  if (result.ride) return result.ride;

  const [conflictingRide] = await db
    .select()
    .from(schema.rideBookings)
    .where(eq(schema.rideBookings.rideReference, reference));
  if (!conflictingRide || conflictingRide.userId !== userId) {
    throw new Error("Unable to record verified ride payment.");
  }
  return conflictingRide;
};

// Initialize Paystack Payment
orderroute.post("/payments/initialize", async (req, res) => {
  try {
    const { delivery, ride } = req.body;
    if (
      !process.env.PAYSTACK_SECRET_KEY ||
      Boolean(delivery) === Boolean(ride)
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment configuration or delivery details are invalid.",
      });
    }
    if (ride) {
      if (
        !ride.pickupAddress ||
        !ride.dropoffAddress ||
        !["cash", "card"].includes(ride.paymentMethod)
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid ride details and payment method are required.",
        });
      }
      const activeRide = await findActiveRideRequest(db, req.user.userId);
      if (activeRide) {
        return res.status(409).json({
          success: false,
          code: "ACTIVE_RIDE_EXISTS",
          message:
            "You already have a ride in progress. Complete or cancel it before booking another ride.",
        });
      }
      const quote = await getDeliveryQuote(ride, "ride");
      const amount = Math.round(Number(quote.totalAmount) * 100);
      const verifiedRide = {
        ...ride,
        estimatedDistance: quote.distanceKm,
        estimatedDuration: Math.ceil(
          Number(quote.directions.routes[0]?.legs[0]?.duration?.value ?? 0) /
            60,
        ),
        estimatedPrice: quote.totalAmount,
        paymentMethod: "card",
      };
      const callbackUrl =
        process.env.PAYSTACK_CALLBACK_URL ||
        new URL(
          "/api/payments/callback",
          `${req.protocol}://${req.get("host")}`,
        ).toString();
      const paystackResponse = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: req.user.email,
            amount,
            currency: "GHS",
            callback_url: callbackUrl,
            metadata: {
              userId: req.user.userId,
              expectedAmount: amount,
              ride: verifiedRide,
            },
          }),
        },
      );
      const responseData = await paystackResponse.json();
      if (!paystackResponse.ok || !responseData.status) {
        return res.status(400).json({
          success: false,
          message: responseData.message,
        });
      }
      return res.json({
        success: true,
        data: {
          authorization_url: responseData.data.authorization_url,
          reference: responseData.data.reference,
          callback_url: callbackUrl,
        },
      });
    }

    if (
      ["send", "receive"].includes(delivery.deliveryType) &&
      (typeof delivery.recipientName !== "string" ||
        !delivery.recipientName.trim() ||
        typeof delivery.recipientPhone !== "string" ||
        !delivery.recipientPhone.trim() ||
        delivery.recipientName.trim().toLowerCase() === "not set yet" ||
        delivery.recipientPhone.trim().toLowerCase() === "not set yet")
    ) {
      return res.status(400).json({
        success: false,
        message: "A recipient name and phone number are required.",
      });
    }
    const activeRequest = ["ride", "send", "receive"].includes(
      delivery.deliveryType,
    )
      ? await findActiveRequest(db, req.user.userId, delivery.deliveryType)
      : null;
    if (activeRequest) {
      return res.status(409).json({
        success: false,
        code: "ACTIVE_REQUEST_EXISTS",
        message: `You already have an active ${delivery.deliveryType} request. Complete or cancel it before booking another ${delivery.deliveryType} request.`,
      });
    }
    const quote = await getDeliveryQuote(
      delivery,
      delivery.deliveryType === "ride" ? "ride" : "delivery",
    );
    const amount = Math.round(Number(quote.totalAmount) * 100);
    const verifiedDelivery = {
      ...delivery,
      distanceKm: quote.distanceKm,
      deliveryFee: quote.totalAmount,
      totalAmount: quote.totalAmount,
    };
    const callbackUrl =
      process.env.PAYSTACK_CALLBACK_URL ||
      new URL(
        "/api/payments/callback",
        `${req.protocol}://${req.get("host")}`,
      ).toString();

    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: req.user.email,
          amount: Number(amount),
          currency: "GHS",
          callback_url: callbackUrl,
          metadata: {
            userId: req.user.userId,
            expectedAmount: Number(amount),
            delivery: verifiedDelivery,
          },
        }),
      },
    );

    const responseData = await paystackResponse.json();

    if (!paystackResponse.ok || !responseData.status) {
      return res
        .status(400)
        .json({ success: false, message: responseData.message });
    }

    res.json({
      success: true,
      data: {
        authorization_url: responseData.data.authorization_url,
        reference: responseData.data.reference,
        callback_url: callbackUrl,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

orderroute.get("/payments/callback", (_req, res) => {
  res
    .status(200)
    .type("text/plain")
    .send("Payment response received. You can return to NorthRide.");
});

// Paystack Webhook Handler
orderroute.post("/payments/webhook", async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const signature = req.headers["x-paystack-signature"];
    if (!secret || !req.rawBody || typeof signature !== "string") {
      return res.sendStatus(400);
    }
    const hash = crypto
      .createHmac("sha512", secret)
      .update(req.rawBody)
      .digest("hex");

    const expected = Buffer.from(hash, "hex");
    const received = Buffer.from(signature, "hex");
    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    if (event.event === "charge.success" && event.data?.status === "success") {
      if (event.data.metadata?.ride) {
        await createPaidRide(event.data);
      } else {
        await createPaidDelivery(event.data);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify Paystack Payment manually by Reference
orderroute.post("/payments/verify", async (req, res) => {
  try {
    const { reference } = req.body;
    if (typeof reference !== "string" || !reference.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Payment reference is required." });
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    const result = await response.json();

    if (!response.ok || !result.status || result.data?.status !== "success") {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    if (Number(result.data.metadata?.userId) !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: "This payment belongs to another user.",
      });
    }

    const paymentData = result.data.metadata?.ride
      ? { ride: await createPaidRide(result.data) }
      : { delivery: await createPaidDelivery(result.data) };
    return res.json({
      success: true,
      message: "Payment verified successfully",
      data: paymentData,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }
});

export default orderroute;
