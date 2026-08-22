import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const ridesbookroute = Router()
// =============================================
// RIDE BOOKING ROUTES
// =============================================

// Create ride booking
ridesbookroute.post("/rides", async (req, res) => {
try {
  const {
    // Foreign key -> users.userId (integer, NOT NULL)
    userId,

    // Enum -> ["standard", "premium", "shared", "luxury"] (default: "standard")
    rideType,

    // Enum -> ["now", "scheduled"] (default: "now")
    bookingType,

    // Pickup Details
    pickupAddress,       // varchar(255), NOT NULL
    pickupLatitude,      // decimal(10, 8), NOT NULL
    pickupLongitude,     // decimal(11, 8), NOT NULL
    pickupInstructions,  // text, optional
    pickupLandmark,      // varchar(100), optional

    // Dropoff Details
    dropoffAddress,      // varchar(255), NOT NULL
    dropoffLatitude,     // decimal(10, 8), NOT NULL
    dropoffLongitude,    // decimal(11, 8), NOT NULL
    dropoffInstructions, // text, optional
    dropoffLandmark,     // varchar(100), optional

    // Passenger & Requirement Preferences
    numberOfPassengers,  // integer (default: 1)
    hasLuggage,          // boolean (default: false)
    hasPets,             // boolean (default: false)
    requiresWheelchair,  // boolean (default: false)
    specialRequirements, // text, optional

    // Payment & Scheduling
    paymentMethod,       // Enum -> ["cash", "card", "wallet", "bank_transfer"] (NOT NULL)
    scheduledTime,       // timestamp with time zone, optional (used when bookingType = "scheduled")
    tollCharges,         // decimal(10, 2) (default: "0.00")
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
ridesbookroute.get("/rides/:id", async (req, res) => {
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
ridesbookroute.get("/users/:userId/rides", async (req, res) => {
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
ridesbookroute.get("/riders/:riderId/rides", async (req, res) => {
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
ridesbookroute.patch("/rides/:id/status", async (req, res) => {
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
ridesbookroute.post("/rides/:id/cancel", async (req, res) => {
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
export default ridesbookroute