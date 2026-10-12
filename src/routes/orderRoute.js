import crypto from "crypto";
import { Buffer } from "node:buffer";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  findActiveRequest,
  findActiveRideRequest,
} from "../utils/activeRideRequest.js";
import { getDeliveryQuote } from "./mapsRoute.js";

const orderroute = Router();
const MAX_ORDER_ITEMS = 50;
const CARD_RESERVATION_MINUTES = 60;

const orderError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const parseShopOrderItems = (items) => {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ORDER_ITEMS) {
    return { error: `Choose between 1 and ${MAX_ORDER_ITEMS} products.` };
  }

  const parsed = [];
  const seen = new Set();
  for (const item of items) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId < 1) {
      return { error: "Each product must have a valid product ID." };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: "Product quantities must be between 1 and 99." };
    }
    if (seen.has(productId)) {
      return { error: "Each product may only appear once in the cart." };
    }
    seen.add(productId);
    parsed.push({ productId, quantity });
  }
  return { value: parsed };
};

const asCents = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw orderError("A product has an invalid price.", 409);
  }
  return Math.round(amount * 100);
};

const asMoney = (cents) => (cents / 100).toFixed(2);

export const calculateShopOrderTotals = (items, deliveryFee) => {
  const subtotalCents = items.reduce((sum, item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw orderError("Product quantities must be positive whole numbers.");
    }
    return sum + asCents(item.unitPrice) * item.quantity;
  }, 0);
  const deliveryFeeCents = asCents(deliveryFee);
  const totalCents = subtotalCents + deliveryFeeCents;
  if (totalCents > 9_999_999_999) {
    throw orderError("The order total is above the supported limit.");
  }
  return {
    subtotalCents,
    deliveryFeeCents,
    totalCents,
  };
};

const parseDeliveryAddress = (body) => {
  const deliveryAddress =
    typeof body.deliveryAddress === "string" ? body.deliveryAddress.trim() : "";
  const parseCoordinate = (value) =>
    (typeof value === "number" ||
    (typeof value === "string" && value.trim().length > 0)
      ? Number(value)
      : Number.NaN);
  const deliveryLatitude = parseCoordinate(body.deliveryLatitude);
  const deliveryLongitude = parseCoordinate(body.deliveryLongitude);
  if (
    !deliveryAddress ||
    deliveryAddress.length > 255 ||
    !Number.isFinite(deliveryLatitude) ||
    Math.abs(deliveryLatitude) > 90 ||
    !Number.isFinite(deliveryLongitude) ||
    Math.abs(deliveryLongitude) > 180
  ) {
    throw orderError("Choose a valid delivery address.");
  }
  const instructions =
    typeof body.deliveryInstructions === "string"
      ? body.deliveryInstructions.trim()
      : "";
  if (instructions.length > 2000) {
    throw orderError("Delivery instructions must be 2,000 characters or less.");
  }
  return {
    deliveryAddress,
    deliveryLatitude,
    deliveryLongitude,
    deliveryInstructions: instructions || null,
  };
};

const getShopDeliveryQuote = async (shop, address) => {
  if (!shop.isOpen || !shop.isVerified) {
    throw orderError("This shop is currently unavailable.", 409);
  }
  if (shop.latitude === null || shop.longitude === null) {
    throw orderError(
      "This shop needs delivery coordinates before it can accept orders.",
      409,
    );
  }
  const quote = await getDeliveryQuote({
    pickupLatitude: shop.latitude,
    pickupLongitude: shop.longitude,
    dropoffLatitude: address.deliveryLatitude,
    dropoffLongitude: address.deliveryLongitude,
  });
  return {
    deliveryFeeCents: asCents(quote.totalAmount),
    pickupLatitude: Number(shop.latitude),
    pickupLongitude: Number(shop.longitude),
  };
};

const verifyPaystackReference = async (reference) => {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw orderError("Card payment status could not be checked.", 503);
  }
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    },
  );
  const result = await response.json();
  if (!response.ok || !result.status || !result.data) {
    throw orderError("Card payment status could not be checked.", 502);
  }
  return result.data;
};

const releaseExpiredCardReservations = async () => {
  const cutoff = new Date(
    Date.now() - CARD_RESERVATION_MINUTES * 60 * 1000,
  );
  const expiredOrders = await db
    .select({
      orderId: schema.orders.orderId,
      userId: schema.orders.userId,
      paymentReference: schema.orders.paymentReference,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.paymentMethod, "card"),
        eq(schema.orders.paymentStatus, "pending"),
        eq(schema.orders.status, "pending"),
        lt(schema.orders.orderPlacedAt, cutoff),
      ),
    )
    .orderBy(asc(schema.orders.orderPlacedAt))
    .limit(50);

  for (const order of expiredOrders) {
    if (!order.paymentReference) {
      await releaseCardReservation(order.orderId);
      continue;
    }
    const transaction = await verifyPaystackReference(order.paymentReference);
    if (transaction.status === "success") {
      await createPaidShopOrder(transaction, order.userId);
    } else if (["failed", "abandoned", "reversed"].includes(transaction.status)) {
      await releaseCardReservation(order.orderId, order.paymentReference);
    }
  }
};

const createShopOrder = async ({ userId, body, paymentMethod }) => {
  const shopId = Number(body.shopId);
  if (!Number.isInteger(shopId) || shopId < 1) {
    throw orderError("A valid shop is required.");
  }
  const parsedItems = parseShopOrderItems(body.items);
  if (parsedItems.error) throw orderError(parsedItems.error);
  const address = parseDeliveryAddress(body);
  const [shop] = await db
    .select()
    .from(schema.shops)
    .where(eq(schema.shops.shopId, shopId))
    .limit(1);
  if (!shop) throw orderError("Shop not found.", 404);
  const quote = await getShopDeliveryQuote(shop, address);
  const orderReference = `ORD-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;

  return db.transaction(async (tx) => {
    const [lockedShop] = await tx
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.shopId, shopId))
      .for("update")
      .limit(1);
    if (
      !lockedShop ||
      !lockedShop.isOpen ||
      !lockedShop.isVerified ||
      Number(lockedShop.latitude) !== quote.pickupLatitude ||
      Number(lockedShop.longitude) !== quote.pickupLongitude
    ) {
      throw orderError("Shop availability changed. Please try again.", 409);
    }

    const productIds = parsedItems.value.map((item) => item.productId);
    const products = await tx
      .select()
      .from(schema.products)
      .where(inArray(schema.products.productId, productIds))
      .orderBy(asc(schema.products.productId))
      .for("update");
    if (products.length !== productIds.length) {
      throw orderError("One or more products are no longer available.", 409);
    }

    const orderLines = parsedItems.value.map(({ productId, quantity }) => {
      const product = products.find((candidate) => candidate.productId === productId);
      if (
        !product ||
        product.shopId !== shopId ||
        product.isAvailable === false
      ) {
        throw orderError("One or more products are no longer available.", 409);
      }
      const stockQuantity = Number(product.stockQuantity ?? 0);
      if (!Number.isInteger(stockQuantity) || stockQuantity < quantity) {
        throw orderError(`${product.productName} does not have enough stock.`, 409);
      }
      const unitPriceCents = asCents(product.discountPrice ?? product.price);
      return {
        product,
        productId,
        productName: product.productName,
        unitPriceCents,
        quantity,
        lineTotalCents: unitPriceCents * quantity,
      };
    });
    const totals = calculateShopOrderTotals(
      orderLines.map((item) => ({
        unitPrice: asMoney(item.unitPriceCents),
        quantity: item.quantity,
      })),
      asMoney(quote.deliveryFeeCents),
    );

    const [order] = await tx
      .insert(schema.orders)
      .values({
        userId,
        shopId,
        orderReference,
        orderType: "delivery",
        paymentMethod,
        paymentStatus: "pending",
        subtotal: asMoney(totals.subtotalCents),
        deliveryFee: asMoney(totals.deliveryFeeCents),
        serviceCharge: "0.00",
        totalAmount: asMoney(totals.totalCents),
        deliveryAddress: address.deliveryAddress,
        deliveryLatitude: String(address.deliveryLatitude),
        deliveryLongitude: String(address.deliveryLongitude),
        deliveryInstructions: address.deliveryInstructions,
        pickupLatitude: String(quote.pickupLatitude),
        pickupLongitude: String(quote.pickupLongitude),
        status: "pending",
      })
      .returning();

    const insertedItems = await tx
      .insert(schema.orderItems)
      .values(
        orderLines.map((item) => ({
          orderId: order.orderId,
          productId: item.productId,
          productName: item.productName,
          unitPrice: asMoney(item.unitPriceCents),
          quantity: item.quantity,
          lineTotal: asMoney(item.lineTotalCents),
        })),
      )
      .returning();

    for (const item of orderLines) {
      await tx
        .update(schema.products)
        .set({ stockQuantity: Number(item.product.stockQuantity ?? 0) - item.quantity })
        .where(eq(schema.products.productId, item.productId));
    }
    return { ...order, items: insertedItems };
  });
};

const cancelUnpaidShopOrder = async (
  orderId,
  paymentReference,
  cardOnly = false,
  allowActive = false,
) => {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, orderId))
      .for("update")
      .limit(1);
    if (
      !order ||
      (cardOnly && order.paymentMethod !== "card") ||
      order.paymentStatus !== "pending" ||
      (allowActive
        ? ["cancelled", "rejected", "delivered"].includes(order.status)
        : order.status !== "pending")
    ) {
      return;
    }
    const items = await tx
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));
    for (const item of items) {
      if (item.productId === null) continue;
      await tx
        .update(schema.products)
        .set({
          stockQuantity: sql`COALESCE(${schema.products.stockQuantity}, 0) + ${item.quantity}`,
        })
        .where(eq(schema.products.productId, item.productId));
    }
    await tx
      .update(schema.orders)
      .set({
        status: "cancelled",
        paymentStatus: "failed",
        ...(paymentReference ? { paymentReference } : {}),
      })
      .where(eq(schema.orders.orderId, orderId));
  });
};

const releaseCardReservation = (orderId, paymentReference) =>
  cancelUnpaidShopOrder(orderId, paymentReference, true);

const createPaidShopOrder = async (transaction, authenticatedUserId) => {
  const metadata = transaction.metadata || {};
  const details = metadata.order;
  const userId = Number(metadata.userId);
  const orderId = Number(details?.orderId);
  const reference = transaction.reference;
  if (
    !details ||
    !Number.isInteger(userId) ||
    !Number.isInteger(orderId) ||
    !reference
  ) {
    throw orderError("Shop order payment metadata is incomplete.", 400);
  }
  if (authenticatedUserId && authenticatedUserId !== userId) {
    throw orderError("This payment belongs to another user.", 403);
  }

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, orderId))
      .for("update")
      .limit(1);
    if (!order || order.userId !== userId || order.paymentMethod !== "card") {
      throw orderError("The shop order for this payment was not found.", 404);
    }
    if (
      transaction.currency !== "GHS" ||
      !Number.isInteger(Number(metadata.expectedAmount)) ||
      Number(transaction.amount) !== Number(metadata.expectedAmount) ||
      asCents(order.totalAmount) !== Number(metadata.expectedAmount)
    ) {
      throw orderError("Payment amount does not match the shop order.", 400);
    }
    if (order.paymentReference && order.paymentReference !== reference) {
      throw orderError("Payment reference belongs to another transaction.", 409);
    }
    if (order.paymentStatus === "paid") {
      return order;
    }
    if (order.status !== "pending" || order.paymentStatus !== "pending") {
      throw orderError("This shop order is no longer awaiting payment.", 409);
    }
    const [paidOrder] = await tx
      .update(schema.orders)
      .set({ paymentStatus: "paid", paymentReference: reference })
      .where(eq(schema.orders.orderId, orderId))
      .returning();
    return paidOrder;
  });
};

const markShopPaymentFailed = async (transaction) => {
  const orderId = Number(transaction.metadata?.order?.orderId);
  if (!Number.isInteger(orderId)) return;
  await releaseCardReservation(orderId, transaction.reference);
};

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
    const orderIds = orders.map((order) => order.orderId);
    const items = orderIds.length
      ? await db
          .select()
          .from(schema.orderItems)
          .where(inArray(schema.orderItems.orderId, orderIds))
      : [];
    const shopIds = [...new Set(orders.map((order) => order.shopId))];
    const shops = shopIds.length
      ? await db
          .select({
            shopId: schema.shops.shopId,
            shopName: schema.shops.shopName,
          })
          .from(schema.shops)
          .where(inArray(schema.shops.shopId, shopIds))
      : [];
    return res.json({
      success: true,
      data: orders.map((order) => ({
        ...order,
        shopName: shops.find((shop) => shop.shopId === order.shopId)?.shopName,
        items: items.filter((item) => item.orderId === order.orderId),
      })),
    });
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
    await releaseExpiredCardReservations();
    if (req.body.paymentMethod !== "cash") {
      return res.status(400).json({
        success: false,
        message: "Choose cash or initialize a card payment.",
      });
    }
    const order = await createShopOrder({
      userId: req.user.userId,
      body: req.body,
      paymentMethod: "cash",
    });
    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error("Could not create shop order:", error);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code,
      message: error.message || "Could not create this order.",
    });
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
    const items = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, order.orderId));
    const [shop] = await db
      .select({ shopName: schema.shops.shopName })
      .from(schema.shops)
      .where(eq(schema.shops.shopId, order.shopId));
    res.json({ success: true, data: { ...order, shopName: shop?.shopName, items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

orderroute.post("/orders/:id/cancel", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        success: false,
        message: "A valid order ID is required.",
      });
    }
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, orderId))
      .limit(1);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }
    if (order.userId !== req.user.userId && req.user.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You cannot cancel this order.",
      });
    }
    if (order.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message: "Paid orders cannot be cancelled in the app. Contact support.",
      });
    }
    if (order.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be cancelled.",
      });
    }
    if (order.paymentMethod === "card" && order.paymentReference) {
      if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(503).json({
          success: false,
          message: "Card payment status could not be checked. Try again later.",
        });
      }
      const paymentResponse = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(order.paymentReference)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        },
      );
      const paymentResult = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentResult.status) {
        return res.status(502).json({
          success: false,
          message: "Card payment status could not be checked. Try again later.",
        });
      }
      if (paymentResult.data?.status === "success") {
        await createPaidShopOrder(paymentResult.data, order.userId);
        return res.status(409).json({
          success: false,
          message: "Payment was completed, so this order cannot be cancelled.",
        });
      }
      if (
        !["failed", "abandoned", "reversed"].includes(paymentResult.data?.status)
      ) {
        return res.status(409).json({
          success: false,
          message: "The card payment is still processing. Try again shortly.",
        });
      }
    }
    await cancelUnpaidShopOrder(orderId, order.paymentReference);
    const [cancelledOrder] = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.orderId, orderId));
    if (cancelledOrder?.status !== "cancelled") {
      return res.status(409).json({
        success: false,
        message: "Only pending orders can be cancelled.",
      });
    }
    return res.json({ success: true, data: cancelledOrder });
  } catch (error) {
    console.error("Could not cancel shop order:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Could not cancel this order.",
    });
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
    await releaseExpiredCardReservations();
    const { status } = req.query;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const filters = [eq(schema.orders.userId, Number(req.params.userId))];
    if (typeof status === "string") {
      filters.push(eq(schema.orders.status, status));
    }
    const orders = await db
      .select()
      .from(schema.orders)
      .where(and(...filters))
      .orderBy(desc(schema.orders.orderPlacedAt))
      .limit(limit);
    const orderIds = orders.map((order) => order.orderId);
    const items = orderIds.length
      ? await db
          .select()
          .from(schema.orderItems)
          .where(inArray(schema.orderItems.orderId, orderIds))
      : [];
    const shopIds = [...new Set(orders.map((order) => order.shopId))];
    const shops = shopIds.length
      ? await db
          .select({
            shopId: schema.shops.shopId,
            shopName: schema.shops.shopName,
          })
          .from(schema.shops)
          .where(inArray(schema.shops.shopId, shopIds))
      : [];
    return res.json({
      success: true,
      data: orders.map((order) => ({
        ...order,
        shopName: shops.find((shop) => shop.shopId === order.shopId)?.shopName,
        items: items.filter((item) => item.orderId === order.orderId),
      })),
    });
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
    if (status === "cancelled" || status === "rejected") {
      const [currentOrder] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderId, orderId))
        .limit(1);
      if (!currentOrder) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found." });
      }
      if (
        currentOrder.paymentMethod === "card" &&
        currentOrder.paymentStatus === "pending"
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Unpaid card orders must be cancelled through the verified customer cancellation flow.",
        });
      }
      if (currentOrder.paymentStatus === "paid") {
        return res.status(409).json({
          success: false,
          message: "Refund this paid order before cancelling or rejecting it.",
        });
      }
      if (
        currentOrder.paymentStatus === "pending" &&
        !["cancelled", "rejected", "delivered"].includes(currentOrder.status)
      ) {
        await cancelUnpaidShopOrder(orderId, undefined, false, true);
      }
    }

    let updateData = { status };
    const timestamp = new Date();
    if (status === "delivered") {
      const [currentOrder] = await db
        .select({ paymentMethod: schema.orders.paymentMethod })
        .from(schema.orders)
        .where(eq(schema.orders.orderId, orderId))
        .limit(1);
      if (currentOrder?.paymentMethod === "cash") {
        updateData.paymentStatus = "paid";
      }
    }

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
    const [item] = await db
      .select({ orderItemId: schema.orderItems.orderItemId })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId))
      .limit(1);
    if (item) {
      return res.status(409).json({
        success: false,
        message:
          "Shop orders must be cancelled rather than deleted so inventory and order history are preserved.",
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
    const { delivery, ride, order } = req.body;
    const hasShopOrder = Boolean(order);
    if (
      Number(Boolean(delivery)) +
        Number(Boolean(ride)) +
        Number(hasShopOrder) !==
      1
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment details are invalid.",
      });
    }
    if (hasShopOrder) {
      if (!process.env.PAYSTACK_SECRET_KEY) {
        return res.status(503).json({
          success: false,
          message: "Card payments are not configured.",
        });
      }
      await releaseExpiredCardReservations();
      const reservedOrder = await createShopOrder({
        userId: req.user.userId,
        body: order,
        paymentMethod: "card",
      });
      const amount = asCents(reservedOrder.totalAmount);
      const callbackUrl =
        process.env.PAYSTACK_CALLBACK_URL ||
        new URL(
          "/api/payments/callback",
          `${req.protocol}://${req.get("host")}`,
        ).toString();

      let responseData;
      try {
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
                order: { orderId: reservedOrder.orderId },
              },
            }),
          },
        );
        responseData = await paystackResponse.json();
        if (!paystackResponse.ok || !responseData.status) {
          await releaseCardReservation(reservedOrder.orderId);
          return res.status(400).json({
            success: false,
            message: responseData.message || "Could not initialize payment.",
          });
        }
      } catch (error) {
        console.error("Could not initialize shop card payment:", error);
        throw orderError(
          "Payment could not be initialized. Please check your orders before trying again.",
          502,
        );
      }

      const reference = responseData.data.reference;
      await db
        .update(schema.orders)
        .set({ paymentReference: reference })
        .where(eq(schema.orders.orderId, reservedOrder.orderId));
      return res.json({
        success: true,
        data: {
          orderId: reservedOrder.orderId,
          authorization_url: responseData.data.authorization_url,
          reference,
          callback_url: callbackUrl,
        },
      });
    }
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({
        success: false,
        message: "Card payments are not configured.",
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
    res.status(error.status || 500).json({
      success: false,
      code: error.code,
      message: error.message,
    });
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
      if (event.data.metadata?.order) {
        await createPaidShopOrder(event.data);
      } else if (event.data.metadata?.ride) {
        await createPaidRide(event.data);
      } else {
        await createPaidDelivery(event.data);
      }
    } else if (event.event === "charge.failed") {
      await markShopPaymentFailed(event.data || {});
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

    const paymentData = result.data.metadata?.order
      ? { order: await createPaidShopOrder(result.data, req.user.userId) }
      : result.data.metadata?.ride
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
