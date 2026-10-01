import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const pricerouter = Router();

// =============================================
// RIDE PRICING ROUTES
// =============================================

// Get ride pricing
pricerouter.get("/ride-pricing", async (req, res) => {
  try {
    const { rideType } = req.query;
    let query = db
      .select()
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
pricerouter.post("/ride-pricing", async (req, res) => {
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

    const [pricing] = await db
      .insert(schema.ridePricing)
      .values({
        rideType,
        vehicleType,
        baseFare,
        pricePerKm,
        pricePerMinute,
        minimumFare,
        cancellationFee: cancellationFee || 0,
        waitingFeePerMinute: waitingFeePerMinute || 0,
        surgeMultiplierMin: surgeMultiplierMin || 1.0,
        surgeMultiplierMax: surgeMultiplierMax || 3.0,
        effectiveFrom: effectiveFrom || new Date(),
        effectiveTo,
      })
      .returning();

    res.status(201).json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default pricerouter;
