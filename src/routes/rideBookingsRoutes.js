import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Router } from "express";
import { createCustomerUpcomingHandler } from "../controllers/customerUpcoming.js";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import { findActiveRideRequest } from "../utils/activeRideRequest.js";

const ridesbookroute = Router();
const isAdmin = (req) => req.user?.userType === "admin";
const getRiderForUser = async (userId) => {
  const [rider] = await db
    .select()
    .from(schema.riders)
    .where(eq(schema.riders.userId, userId))
    .limit(1);
  return rider;
};

ridesbookroute.get(
  "/users/:userId/upcoming",
  createCustomerUpcomingHandler({ db }),
);

ridesbookroute.post("/rides/:id/accept", async (req, res) => {
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
    if (!rider.isAvailable) {
      return res.status(409).json({
        success: false,
        message: "Go online before accepting a ride.",
      });
    }

    const rideId = Number(req.params.id);
    const result = await db.transaction(async (tx) => {
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
      if (!claimedRider) return { error: "offline" };

      const [ride] = await tx
        .update(schema.rideBookings)
        .set({
          riderId: rider.riderId,
          status: "confirmed",
          confirmedAt: new Date(),
        })
        .where(
          and(
            eq(schema.rideBookings.rideId, rideId),
            isNull(schema.rideBookings.riderId),
            inArray(schema.rideBookings.status, ["pending", "searching"]),
          ),
        )
        .returning();

      if (!ride) {
        await tx
          .update(schema.riders)
          .set({ isAvailable: true })
          .where(eq(schema.riders.riderId, rider.riderId));
        return { error: "taken" };
      }
      return { ride };
    });

    if (result.error) {
      return res.status(409).json({
        success: false,
        message:
          result.error === "offline"
            ? "You are no longer available for a new ride."
            : "This ride is no longer available.",
      });
    }
    return res.json({ success: true, data: result.ride });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

ridesbookroute.post("/rides/:id/reject", async (req, res) => {
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
    const rideId = Number(req.params.id);
    const [ride] = await db
      .select({ rideId: schema.rideBookings.rideId })
      .from(schema.rideBookings)
      .where(
        and(
          eq(schema.rideBookings.rideId, rideId),
          isNull(schema.rideBookings.riderId),
          inArray(schema.rideBookings.status, ["pending", "searching"]),
        ),
      );
    if (!ride) {
      return res.status(409).json({
        success: false,
        message: "This ride is no longer available.",
      });
    }
    await db.insert(schema.riderRejections).values({
      rideId,
      riderId: rider.riderId,
      reason: req.body.reason,
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});
// =============================================
// RIDE BOOKING ROUTES
// =============================================

// Create ride booking
ridesbookroute.post("/rides", async (req, res) => {
  try {
    const {
      // Enum -> ["standard", "premium", "shared", "luxury"] (default: "standard")
      rideType,

      // Enum -> ["now", "scheduled"] (default: "now")
      bookingType,

      // Pickup Details
      pickupAddress, // varchar(255), NOT NULL
      pickupLatitude, // decimal(10, 8), NOT NULL
      pickupLongitude, // decimal(11, 8), NOT NULL
      pickupInstructions, // text, optional
      pickupLandmark, // varchar(100), optional

      // Dropoff Details
      dropoffAddress, // varchar(255), NOT NULL
      dropoffLatitude, // decimal(10, 8), NOT NULL
      dropoffLongitude, // decimal(11, 8), NOT NULL
      dropoffInstructions, // text, optional
      dropoffLandmark, // varchar(100), optional

      // Passenger & Requirement Preferences
      numberOfPassengers, // integer (default: 1)
      hasLuggage, // boolean (default: false)
      hasPets, // boolean (default: false)
      requiresWheelchair, // boolean (default: false)
      specialRequirements, // text, optional

      // Payment & Scheduling
      paymentMethod, // Enum -> ["cash", "card", "wallet", "bank_transfer"] (NOT NULL)
      scheduledTime, // timestamp with time zone, optional (used when bookingType = "scheduled")
      tollCharges, // decimal(10, 2) (default: "0.00")
    } = req.body;

    // Generate ride reference
    const rideReference = `RD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const result = await db.transaction(async (tx) => {
      await tx
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(eq(schema.users.userId, req.user.userId))
        .for("update")
        .limit(1);

      const activeRequest = await findActiveRideRequest(tx, req.user.userId);
      if (activeRequest) return { activeRequest };

      const [ride] = await tx
        .insert(schema.rideBookings)
        .values({
          userId: req.user.userId,
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
        })
        .returning();
      return { ride };
    });

    if (result.activeRequest) {
      return res.status(409).json({
        success: false,
        code: "ACTIVE_RIDE_EXISTS",
        message:
          "You already have a ride in progress. Complete or cancel it before booking another ride.",
      });
    }
    return res.status(201).json({ success: true, data: result.ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get ride by ID
ridesbookroute.get("/rides/:id", async (req, res) => {
  try {
    const [ride] = await db
      .select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.rideId, parseInt(req.params.id)));

    if (!ride) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }
    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    if (
      !isAdmin(req) &&
      ride.userId !== req.user.userId &&
      ride.riderId !== rider?.riderId
    ) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view this ride." });
    }
    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user rides
ridesbookroute.get("/users/:userId/rides", async (req, res) => {
  if (Number(req.params.userId) !== req.user.userId && !isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot view these rides." });
  }
  try {
    const { status, limit = 50 } = req.query;
    let query = db
      .select()
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
  const rider =
    req.user.userType === "rider"
      ? await getRiderForUser(req.user.userId)
      : null;
  const riderId = Number(req.params.riderId);
  if (!isAdmin(req) && (!rider || rider.riderId !== riderId)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot view these rides." });
  }
  try {
    const { status, limit = 50 } = req.query;
    let query = db
      .select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.riderId, riderId))
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
    const [existingRide] = await db
      .select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.rideId, rideId));
    if (!existingRide) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }
    const rider =
      req.user.userType === "rider"
        ? await getRiderForUser(req.user.userId)
        : null;
    const riderStatuses = new Set(["arrived", "in_progress", "completed"]);
    const nextRiderStatuses = {
      confirmed: "arrived",
      arrived: "in_progress",
      in_progress: "completed",
    };
    if (
      !isAdmin(req) &&
      (!rider ||
        existingRide.riderId !== rider.riderId ||
        !riderStatuses.has(status) ||
        nextRiderStatuses[existingRide.status] !== status)
    ) {
      return res.status(409).json({
        success: false,
        message: "This ride status change is not permitted.",
      });
    }

    let updateData = { status };
    const timestamp = new Date();

    // Update specific timestamps based on status
    switch (status) {
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

    const [ride] = await db
      .update(schema.rideBookings)
      .set(updateData)
      .where(
        and(
          eq(schema.rideBookings.rideId, rideId),
          eq(schema.rideBookings.status, existingRide.status),
        ),
      )
      .returning();

    if (!ride) {
      return res.status(409).json({
        success: false,
        message: "The ride changed before the update was saved.",
      });
    }
    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel ride
ridesbookroute.post("/rides/:id/cancel", async (req, res) => {
  try {
    const { cancellationReason } = req.body;
    const rideId = parseInt(req.params.id);
    const [existingRide] = await db
      .select()
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.rideId, rideId));
    if (!existingRide) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }
    if (!isAdmin(req) && existingRide.userId !== req.user.userId) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot cancel this ride." });
    }

    const [ride] = await db
      .update(schema.rideBookings)
      .set({
        status: "cancelled",
        cancelledBy: isAdmin(req) ? "admin" : "customer",
        cancellationReason,
        cancelledAt: new Date(),
      })
      .where(eq(schema.rideBookings.rideId, rideId))
      .returning();

    if (!ride) {
      return res
        .status(404)
        .json({ success: false, message: "Ride not found" });
    }

    // If rider was assigned, make them available again
    if (ride.riderId) {
      await db
        .update(schema.riders)
        .set({ isAvailable: true })
        .where(eq(schema.riders.riderId, ride.riderId));
    }

    res.json({ success: true, data: ride });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
export default ridesbookroute;
