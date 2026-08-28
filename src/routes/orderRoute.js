import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import crypto from "crypto";

const orderroute = Router();

// =============================================
// ORDER ROUTES
// =============================================

// Create order
orderroute.post("/orders", async (req, res) => {
  try {
    const {
      userId,
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
    
    const [order] = await db.insert(schema.orders).values({
      userId,
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
    }).returning();
    
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get order by ID
orderroute.get("/orders/:id", async (req, res) => {
  try {
    const [order] = await db.select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, parseInt(req.params.id)));
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user orders
orderroute.get("/users/:userId/orders", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = db.select()
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
  try {
    const { status } = req.body;
    const orderId = parseInt(req.params.id);
    
    let updateData = { status };
    const timestamp = new Date();
    
    // Update specific timestamps based on status
    switch(status) {
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
    
    const [order] = await db.update(schema.orders)
      .set(updateData)
      .where(eq(schema.orders.orderId, orderId))
      .returning();
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Assign rider to order
orderroute.patch("/orders/:id/assign-rider", async (req, res) => {
  try {
    const { riderId } = req.body;
    
    const [order] = await db.update(schema.orders)
      .set({ riderId })
      .where(eq(schema.orders.orderId, parseInt(req.params.id)))
      .returning();
    
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// PAYSTACK PAYMENT & WEBHOOK ROUTES
// =============================================

// Initialize Paystack Payment
orderroute.post("/payments/initialize", async (req, res) => {
  try {
    const { email, amount, userId, deliveryAddress, deliveryLatitude, deliveryLongitude } = req.body;
    // console.log(req.body)
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount, // in pesewas / smallest currency subunit (e.g. 2500 for GHS 25)
        callback_url: "https://myapp.internal/paystack-callback",
        metadata: {
          userId,
          deliveryAddress,
          deliveryLatitude,
          deliveryLongitude,
          cancel_action: "https://myapp.internal/paystack-cancel",
        },
      }),
    });

    const responseData = await paystackResponse.json();

    if (!responseData.status) {
      return res.status(400).json({ success: false, message: responseData.message });
    }

    res.json({
      success: true,
      data: {
        authorization_url: responseData.data.authorization_url,
        reference: responseData.data.reference,
      },
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: error.message });
  }
});

// Paystack Webhook Handler
orderroute.post("/payments/webhook", async (req, res) => {
  try {
    // 1. Verify Paystack Webhook Signature
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;

    // 2. Handle successful charge event
    if (event.event === "charge.success") {
      const { reference, amount, metadata, channel } = event.data;

      // Check if order already exists to prevent duplication
      const existingOrder = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderReference, reference));

      if (existingOrder.length === 0) {
        // Record order into database securely
        await db.insert(schema.orders).values({
          userId: metadata?.userId ? parseInt(metadata.userId) : null,
          orderReference: reference,
          orderType: "delivery",
          paymentMethod: channel || "paystack",
          subtotal: (amount / 100).toString(),
          totalAmount: (amount / 100).toString(),
          deliveryAddress: metadata?.deliveryAddress || "N/A",
          deliveryLatitude: metadata?.deliveryLatitude || null,
          deliveryLongitude: metadata?.deliveryLongitude || null,
          status: "confirmed",
          paymentStatus: "paid",
          confirmedAt: new Date(),
        });
      } else {
        // Update existing pending order to paid
        await db
          .update(schema.orders)
          .set({
            status: "confirmed",
            paymentStatus: "paid",
            confirmedAt: new Date(),
          })
          .where(eq(schema.orders.orderReference, reference));
      }
    }

    // Always acknowledge receipt to Paystack with HTTP 200
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

    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });

    const result = await response.json();

    if (result.status && result.data.status === "success") {
      res.json({ success: true, message: "Payment verified successfully", data: result.data });
    } else {
      res.status(400).json({ success: false, message: "Payment verification failed" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default orderroute;