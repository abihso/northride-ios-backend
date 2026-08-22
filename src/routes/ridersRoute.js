import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import calculateDistance from "../utils/cal.js";
const riderRoute = Router()

// =============================================
// RIDER ROUTES
// =============================================

// Get all riders
riderRoute.get("/riders", async (req, res) => {
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
riderRoute.get("/riders/:id", async (req, res) => {
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
riderRoute.post("/riders", async (req, res) => {
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
riderRoute.patch("/riders/:id/availability", async (req, res) => {
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
riderRoute.get("/riders/nearby", async (req, res) => {
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

export default riderRoute