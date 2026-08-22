import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const orderroute = Router()
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
export default orderroute