// src/routes.js
import express from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "./db/schema.js";

const router = express.Router();

// =============================================
// USER ROUTES
// =============================================

// Get all users
router.get("/users", async (req, res) => {
  try {
    const { limit = 100, offset = 0, userType } = req.query;
    let query = db.select().from(schema.users);
    
    if (userType) {
      query = query.where(eq(schema.users.userType, userType));
    }
    
    const users = await query.limit(parseInt(limit)).offset(parseInt(offset));
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user by ID
router.get("/users/:id", async (req, res) => {
  try {
    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.userId, parseInt(req.params.id)));
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create user
router.post("/users", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, passwordHash, userType, profilePicture } = req.body;
    
    const [user] = await db.insert(schema.users).values({
      fullName,
      email,
      phoneNumber,
      passwordHash,
      userType: userType || "customer",
      profilePicture,
      isVerified: false,
      isActive: true,
    }).returning();
    
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update user
router.put("/users/:id", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, profilePicture, userType, isActive } = req.body;
    
    const [user] = await db.update(schema.users)
      .set({
        fullName,
        email,
        phoneNumber,
        profilePicture,
        userType,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.userId, parseInt(req.params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete user
router.delete("/users/:id", async (req, res) => {
  try {
    const [user] = await db.delete(schema.users)
      .where(eq(schema.users.userId, parseInt(req.params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// User login (update last login)
router.post("/users/login/:id", async (req, res) => {
  try {
    const [user] = await db.update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.userId, parseInt(req.params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// RIDER ROUTES
// =============================================

// Get all riders
router.get("/riders", async (req, res) => {
  try {
    const { isAvailable, isApproved, limit = 100 } = req.query;
    let query = db.select().from(schema.riders);
    
    if (isAvailable !== undefined) {
      query = query.where(eq(schema.riders.isAvailable, isAvailable === "true"));
    }
    if (isApproved !== undefined) {
      query = query.where(eq(schema.riders.isApproved, isApproved === "true"));
    }
    
    const riders = await query.limit(parseInt(limit));
    res.json({ success: true, data: riders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rider by ID
router.get("/riders/:id", async (req, res) => {
  try {
    const [rider] = await db.select()
      .from(schema.riders)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)));
    
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create rider
router.post("/riders", async (req, res) => {
  try {
    const {
      userId,
      vehicleType,
      vehiclePlateNumber,
      vehicleModel,
      vehicleColor,
      licenseNumber,
      isAvailable,
      isApproved,
      currentLatitude,
      currentLongitude,
      maxPassengers,
      hasAirConditioning,
      hasWifi,
      bankAccountName,
      bankAccountNumber,
      bankName,
    } = req.body;
    
    const [rider] = await db.insert(schema.riders).values({
      userId,
      vehicleType,
      vehiclePlateNumber,
      vehicleModel,
      vehicleColor,
      licenseNumber,
      isAvailable: isAvailable || true,
      isApproved: isApproved || false,
      currentLatitude,
      currentLongitude,
      maxPassengers: maxPassengers || 1,
      hasAirConditioning: hasAirConditioning || false,
      hasWifi: hasWifi || false,
      bankAccountName,
      bankAccountNumber,
      bankName,
    }).returning();
    
    res.status(201).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update rider availability
router.patch("/riders/:id/availability", async (req, res) => {
  try {
    const { isAvailable, latitude, longitude } = req.body;
    
    const updateData = { isAvailable };
    if (latitude !== undefined) updateData.currentLatitude = latitude;
    if (longitude !== undefined) updateData.currentLongitude = longitude;
    
    const [rider] = await db.update(schema.riders)
      .set(updateData)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)))
      .returning();
    
    if (!rider) {
      return res.status(404).json({ success: false, message: "Rider not found" });
    }
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Find nearby riders
router.get("/riders/nearby", async (req, res) => {
  try {
    const { latitude, longitude, radius = 5, rideType } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        success: false, 
        message: "Latitude and longitude are required" 
      });
    }
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);
    
    let query = db.select()
      .from(schema.riders)
      .where(
        and(
          eq(schema.riders.isAvailable, true),
          eq(schema.riders.isApproved, true),
          sql`${schema.riders.currentLatitude} IS NOT NULL`,
          sql`${schema.riders.currentLongitude} IS NOT NULL`
        )
      );
    
    if (rideType) {
      query = query.where(eq(schema.riders.vehicleType, rideType));
    }
    
    const riders = await query;
    
    // Calculate distance using Haversine formula
    const nearbyRiders = riders.map(rider => {
      const distance = calculateDistance(
        lat, lng,
        parseFloat(rider.currentLatitude),
        parseFloat(rider.currentLongitude)
      );
      return { ...rider, distance };
    }).filter(rider => rider.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
    
    res.json({ success: true, data: nearbyRiders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// SHOP ROUTES
// =============================================

// Get all shops
router.get("/shops", async (req, res) => {
  try {
    const { isOpen, isVerified, city, limit = 100 } = req.query;
    let query = db.select().from(schema.shops);
    
    if (isOpen !== undefined) {
      query = query.where(eq(schema.shops.isOpen, isOpen === "true"));
    }
    if (isVerified !== undefined) {
      query = query.where(eq(schema.shops.isVerified, isVerified === "true"));
    }
    if (city) {
      query = query.where(eq(schema.shops.city, city));
    }
    
    const shops = await query.limit(parseInt(limit));
    res.json({ success: true, data: shops });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get shop by ID
router.get("/shops/:id", async (req, res) => {
  try {
    const [shop] = await db.select()
      .from(schema.shops)
      .where(eq(schema.shops.shopId, parseInt(req.params.id)));
    
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found" });
    }
    
    // Get shop products
    const products = await db.select()
      .from(schema.products)
      .where(eq(schema.products.shopId, shop.shopId));
    
    res.json({ success: true, data: { ...shop, products } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create shop
router.post("/shops", async (req, res) => {
  try {
    const {
      ownerId,
      shopName,
      shopDescription,
      shopCategory,
      address,
      city,
      state,
      country,
      latitude,
      longitude,
      phoneNumber,
      email,
      logo,
      coverImage,
      openingTime,
      closingTime,
    } = req.body;
    
    const [shop] = await db.insert(schema.shops).values({
      ownerId,
      shopName,
      shopDescription,
      shopCategory,
      address,
      city,
      state,
      country,
      latitude,
      longitude,
      phoneNumber,
      email,
      logo,
      coverImage,
      openingTime,
      closingTime,
    }).returning();
    
    res.status(201).json({ success: true, data: shop });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// PRODUCT ROUTES
// =============================================

// Get products by shop
router.get("/shops/:shopId/products", async (req, res) => {
  try {
    const { isAvailable, category } = req.query;
    let query = db.select()
      .from(schema.products)
      .where(eq(schema.products.shopId, parseInt(req.params.shopId)));
    
    if (isAvailable !== undefined) {
      query = query.where(eq(schema.products.isAvailable, isAvailable === "true"));
    }
    if (category) {
      query = query.where(eq(schema.products.category, category));
    }
    
    const products = await query;
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create product
router.post("/products", async (req, res) => {
  try {
    const {
      shopId,
      productName,
      productDescription,
      category,
      price,
      discountPrice,
      stockQuantity,
      unit,
      imageUrl,
      isAvailable,
      isFeatured,
      preparationTime,
    } = req.body;
    
    const [product] = await db.insert(schema.products).values({
      shopId,
      productName,
      productDescription,
      category,
      price,
      discountPrice,
      stockQuantity: stockQuantity || 0,
      unit: unit || "piece",
      imageUrl,
      isAvailable: isAvailable !== undefined ? isAvailable : true,
      isFeatured: isFeatured || false,
      preparationTime: preparationTime || 0,
    }).returning();
    
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update product stock
router.patch("/products/:id/stock", async (req, res) => {
  try {
    const { stockQuantity } = req.body;
    
    const [product] = await db.update(schema.products)
      .set({ stockQuantity })
      .where(eq(schema.products.productId, parseInt(req.params.id)))
      .returning();
    
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// RIDE BOOKING ROUTES
// =============================================

// Create ride booking
router.post("/rides", async (req, res) => {
  try {
    const {
      userId,
      rideType,
      bookingType,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      pickupInstructions,
      pickupLandmark,
      dropoffAddress,
      dropoffLatitude,
      dropoffLongitude,
      dropoffInstructions,
      dropoffLandmark,
      numberOfPassengers,
      hasLuggage,
      hasPets,
      requiresWheelchair,
      specialRequirements,
      paymentMethod,
      scheduledTime,
      tollCharges,
    } = req.body;
    
    // Generate ride reference
    const rideReference = `RD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    const [ride] = await db.insert(schema.rideBookings).values({
      userId,
      rideType: rideType || "standard",
      bookingType: bookingType || "now",
      rideReference,
      pickupAddress,
      pickupLatitude,
      pickupLongitude,
      pickupInstructions,
      pickupLandmark,
      dropoffAddress,
      dropoffLatitude,
      dropoffLongitude,
      dropoffInstructions,
      dropoffLandmark,
      numberOfPassengers: numberOfPassengers || 1,
      hasLuggage: hasLuggage || false,
      hasPets: hasPets || false,
      requiresWheelchair: requiresWheelchair || false,
      specialRequirements,
      paymentMethod,
      scheduledTime,
      tollCharges: tollCharges || 0,
      status: "pending",
    }).returning();
    
    res.status(201).json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get ride by ID
router.get("/rides/:id", async (req, res) => {
  try {
    const [ride] = await db.select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.rideId, parseInt(req.params.id)));
    
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user rides
router.get("/users/:userId/rides", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = db.select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.userId, parseInt(req.params.userId)))
      .orderBy(desc(schema.rideBookings.bookedAt));
    
    if (status) {
      query = query.where(eq(schema.rideBookings.status, status));
    }
    
    const rides = await query.limit(parseInt(limit));
    res.json({ success: true, data: rides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get rider rides
router.get("/riders/:riderId/rides", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = db.select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.riderId, parseInt(req.params.riderId)))
      .orderBy(desc(schema.rideBookings.bookedAt));
    
    if (status) {
      query = query.where(eq(schema.rideBookings.status, status));
    }
    
    const rides = await query.limit(parseInt(limit));
    res.json({ success: true, data: rides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update ride status
router.patch("/rides/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const rideId = parseInt(req.params.id);
    
    let updateData = { status };
    const timestamp = new Date();
    
    // Update specific timestamps based on status
    switch(status) {
      case "confirmed":
        updateData.confirmedAt = timestamp;
        break;
      case "arrived":
        updateData.riderArrivedAt = timestamp;
        break;
      case "in_progress":
        updateData.rideStartedAt = timestamp;
        break;
      case "completed":
        updateData.rideCompletedAt = timestamp;
        break;
      case "cancelled":
        updateData.cancelledAt = timestamp;
        break;
    }
    
    const [ride] = await db.update(schema.rideBookings)
      .set(updateData)
      .where(eq(schema.rideBookings.rideId, rideId))
      .returning();
    
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel ride
router.post("/rides/:id/cancel", async (req, res) => {
  try {
    const { cancelledBy, cancellationReason } = req.body;
    const rideId = parseInt(req.params.id);
    
    const [ride] = await db.update(schema.rideBookings)
      .set({
        status: "cancelled",
        cancelledBy,
        cancellationReason,
        cancelledAt: new Date(),
      })
      .where(eq(schema.rideBookings.rideId, rideId))
      .returning();
    
    if (!ride) {
      return res.status(404).json({ success: false, message: "Ride not found" });
    }
    
    // If rider was assigned, make them available again
    if (ride.riderId) {
      await db.update(schema.riders)
        .set({ isAvailable: true })
        .where(eq(schema.riders.riderId, ride.riderId));
    }
    
    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// ORDER ROUTES
// =============================================

// Create order
router.post("/orders", async (req, res) => {
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
router.get("/orders/:id", async (req, res) => {
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
router.get("/users/:userId/orders", async (req, res) => {
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
router.patch("/orders/:id/status", async (req, res) => {
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
router.patch("/orders/:id/assign-rider", async (req, res) => {
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
// WALLET ROUTES
// =============================================

// Get user wallet
router.get("/users/:userId/wallet", async (req, res) => {
  try {
    const [wallet] = await db.select()
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, parseInt(req.params.userId)));
    
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }
    res.json({ success: true, data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create wallet for user
router.post("/users/:userId/wallet", async (req, res) => {
  try {
    const [wallet] = await db.insert(schema.wallets).values({
      userId: parseInt(req.params.userId),
      balance: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
    }).returning();
    
    res.status(201).json({ success: true, data: wallet });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add money to wallet
router.post("/wallets/:walletId/deposit", async (req, res) => {
  try {
    const { amount, description } = req.body;
    const walletId = parseInt(req.params.walletId);
    
    // Get current wallet
    const [wallet] = await db.select()
      .from(schema.wallets)
      .where(eq(schema.wallets.walletId, walletId));
    
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }
    
    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
    
    // Update wallet
    const [updatedWallet] = await db.update(schema.wallets)
      .set({
        balance: newBalance,
        totalDeposits: parseFloat(wallet.totalDeposits) + parseFloat(amount),
        lastTransactionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.wallets.walletId, walletId))
      .returning();
    
    // Create transaction record
    const [transaction] = await db.insert(schema.walletTransactions).values({
      walletId,
      userId: wallet.userId,
      transactionType: "deposit",
      amount,
      balanceAfter: newBalance,
      description: description || "Deposit to wallet",
      status: "completed",
    }).returning();
    
    res.json({ 
      success: true, 
      data: { wallet: updatedWallet, transaction } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Withdraw from wallet
router.post("/wallets/:walletId/withdraw", async (req, res) => {
  try {
    const { amount, description } = req.body;
    const walletId = parseInt(req.params.walletId);
    
    // Get current wallet
    const [wallet] = await db.select()
      .from(schema.wallets)
      .where(eq(schema.wallets.walletId, walletId));
    
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }
    
    if (parseFloat(wallet.balance) < parseFloat(amount)) {
      return res.status(400).json({ 
        success: false, 
        message: "Insufficient balance" 
      });
    }
    
    const newBalance = parseFloat(wallet.balance) - parseFloat(amount);
    
    // Update wallet
    const [updatedWallet] = await db.update(schema.wallets)
      .set({
        balance: newBalance,
        totalWithdrawals: parseFloat(wallet.totalWithdrawals) + parseFloat(amount),
        lastTransactionAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.wallets.walletId, walletId))
      .returning();
    
    // Create transaction record
    const [transaction] = await db.insert(schema.walletTransactions).values({
      walletId,
      userId: wallet.userId,
      transactionType: "withdrawal",
      amount: -amount,
      balanceAfter: newBalance,
      description: description || "Withdrawal from wallet",
      status: "completed",
    }).returning();
    
    res.json({ 
      success: true, 
      data: { wallet: updatedWallet, transaction } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get wallet transactions
router.get("/wallets/:walletId/transactions", async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const transactions = await db.select()
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.walletId, parseInt(req.params.walletId)))
      .orderBy(desc(schema.walletTransactions.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// RIDER EARNINGS ROUTES
// =============================================

// Get rider earnings
router.get("/riders/:riderId/earnings", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = db.select()
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, parseInt(req.params.riderId)))
      .orderBy(desc(schema.riderEarnings.createdAt));
    
    if (status) {
      query = query.where(eq(schema.riderEarnings.status, status));
    }
    
    const earnings = await query.limit(parseInt(limit));
    
    // Calculate totals
    const totals = await db.select({
      totalEarned: sql`SUM(${schema.riderEarnings.totalEarned})`,
      totalPending: sql`SUM(CASE WHEN ${schema.riderEarnings.status} = 'pending' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END)`,
      totalPaid: sql`SUM(CASE WHEN ${schema.riderEarnings.status} = 'paid' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END)`,
    }).from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, parseInt(req.params.riderId)));
    
    res.json({ 
      success: true, 
      data: { 
        earnings,
        summary: {
          totalEarned: parseFloat(totals[0].totalEarned) || 0,
          totalPending: parseFloat(totals[0].totalPending) || 0,
          totalPaid: parseFloat(totals[0].totalPaid) || 0,
        }
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark earnings as paid
router.patch("/rider-earnings/:earningId/pay", async (req, res) => {
  try {
    const [earning] = await db.update(schema.riderEarnings)
      .set({
        status: "paid",
        paidAt: new Date(),
      })
      .where(eq(schema.riderEarnings.earningId, parseInt(req.params.earningId)))
      .returning();
    
    if (!earning) {
      return res.status(404).json({ success: false, message: "Earning record not found" });
    }
    res.json({ success: true, data: earning });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// NOTIFICATION ROUTES
// =============================================

// Get user notifications
router.get("/users/:userId/notifications", async (req, res) => {
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
router.patch("/notifications/:id/read", async (req, res) => {
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
router.post("/users/:userId/notifications/read-all", async (req, res) => {
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
router.post("/notifications", async (req, res) => {
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

// =============================================
// SUPPORT TICKET ROUTES
// =============================================

// Create support ticket
router.post("/support-tickets", async (req, res) => {
  try {
    const { userId, subject, message, category, priority } = req.body;
    
    const [ticket] = await db.insert(schema.supportTickets).values({
      userId,
      subject,
      message,
      category: category || "other",
      priority: priority || "medium",
    }).returning();
    
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user support tickets
router.get("/users/:userId/tickets", async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;
    let query = db.select()
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
router.patch("/support-tickets/:id", async (req, res) => {
  try {
    const { status, assignedTo, priority } = req.body;
    
    const [ticket] = await db.update(schema.supportTickets)
      .set({
        status,
        assignedTo,
        priority,
        updatedAt: new Date(),
      })
      .where(eq(schema.supportTickets.ticketId, parseInt(req.params.id)))
      .returning();
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }
    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// RIDE PRICING ROUTES
// =============================================

// Get ride pricing
router.get("/ride-pricing", async (req, res) => {
  try {
    const { rideType } = req.query;
    let query = db.select()
      .from(schema.ridePricing)
      .where(eq(schema.ridePricing.isActive, true))
      .orderBy(desc(schema.ridePricing.effectiveFrom));
    
    if (rideType) {
      query = query.where(eq(schema.ridePricing.rideType, rideType));
    }
    
    const pricing = await query;
    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create ride pricing
router.post("/ride-pricing", async (req, res) => {
  try {
    const {
      rideType,
      vehicleType,
      baseFare,
      pricePerKm,
      pricePerMinute,
      minimumFare,
      cancellationFee,
      waitingFeePerMinute,
      surgeMultiplierMin,
      surgeMultiplierMax,
      effectiveFrom,
      effectiveTo,
    } = req.body;
    
    const [pricing] = await db.insert(schema.ridePricing).values({
      rideType,
      vehicleType,
      baseFare,
      pricePerKm,
      pricePerMinute,
      minimumFare,
      cancellationFee: cancellationFee || 0,
      waitingFeePerMinute: waitingFeePerMinute || 0,
      surgeMultiplierMin: surgeMultiplierMin || 1.00,
      surgeMultiplierMax: surgeMultiplierMax || 3.00,
      effectiveFrom: effectiveFrom || new Date(),
      effectiveTo,
    }).returning();
    
    res.status(201).json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// PROMOTION ROUTES
// =============================================

// Get active promotions
router.get("/promotions", async (req, res) => {
  try {
    const { shopId, applicableTo } = req.query;
    const now = new Date();
    
    let query = db.select()
      .from(schema.promotions)
      .where(
        and(
          eq(schema.promotions.isActive, true),
          between(schema.promotions.startDate, now, schema.promotions.endDate)
        )
      );
    
    if (shopId) {
      query = query.where(eq(schema.promotions.shopId, parseInt(shopId)));
    }
    if (applicableTo) {
      query = query.where(eq(schema.promotions.applicableTo, applicableTo));
    }
    
    const promotions = await query;
    res.json({ success: true, data: promotions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Validate promo code
router.get("/promotions/validate/:code", async (req, res) => {
  try {
    const { userId, orderTotal } = req.query;
    const promoCode = req.params.code;
    const now = new Date();
    
    const [promotion] = await db.select()
      .from(schema.promotions)
      .where(
        and(
          eq(schema.promotions.promoCode, promoCode),
          eq(schema.promotions.isActive, true),
          between(schema.promotions.startDate, now, schema.promotions.endDate)
        )
      );
    
    if (!promotion) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid or expired promo code" 
      });
    }
    
    // Check usage limit
    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
      return res.status(400).json({ 
        success: false, 
        message: "Promo code usage limit exceeded" 
      });
    }
    
    // Check minimum order amount
    if (promotion.minimumOrderAmount && parseFloat(orderTotal) < parseFloat(promotion.minimumOrderAmount)) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order amount of $${promotion.minimumOrderAmount} required` 
      });
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (promotion.discountType === "percentage") {
      discountAmount = (parseFloat(orderTotal) * parseFloat(promotion.discountValue)) / 100;
      if (promotion.maximumDiscount) {
        discountAmount = Math.min(discountAmount, parseFloat(promotion.maximumDiscount));
      }
    } else {
      discountAmount = parseFloat(promotion.discountValue);
    }
    
    res.json({ 
      success: true, 
      data: {
        promotion,
        discountAmount,
        valid: true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// SYSTEM CONFIG ROUTES
// =============================================

// Get system config
router.get("/system-config", async (req, res) => {
  try {
    const { group, key } = req.query;
    let query = db.select().from(schema.systemConfig);
    
    if (group) {
      query = query.where(eq(schema.systemConfig.configGroup, group));
    }
    if (key) {
      query = query.where(eq(schema.systemConfig.configKey, key));
    }
    
    const config = await query;
    
    // Return as key-value object if single key requested
    if (key && config.length > 0) {
      return res.json({ success: true, data: config[0].configValue });
    }
    
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update system config
router.put("/system-config/:key", async (req, res) => {
  try {
    const { configValue } = req.body;
    
    const [config] = await db.update(schema.systemConfig)
      .set({
        configValue,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemConfig.configKey, req.params.key))
      .returning();
    
    if (!config) {
      return res.status(404).json({ success: false, message: "Config key not found" });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// UTILITY FUNCTIONS
// =============================================

// Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default router;