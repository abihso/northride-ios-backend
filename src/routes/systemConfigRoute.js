import { and, eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  getPerKmRates,
  isPricingService,
  parsePerKmRate,
  pricingConfigKey,
} from "../utils/pricing.js";

const sysrouter = Router();
const isAdmin = (req) => req.user?.userType === "admin";

sysrouter.get("/admin/pricing-rates", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  try {
    const rates = await getPerKmRates();
    return res.json({
      success: true,
      data: {
        deliveryPerKm: rates.delivery,
        ridePerKm: rates.ride,
      },
    });
  } catch (error) {
    console.error("Could not load admin pricing rates:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load pricing rates.",
    });
  }
});

sysrouter.put("/admin/pricing-rates", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  const { deliveryPerKm, ridePerKm } = req.body || {};
  const rates = { delivery: deliveryPerKm, ride: ridePerKm };
  if (
    !Object.entries(rates).every(
      ([service, value]) => isPricingService(service) && parsePerKmRate(value) !== null,
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter valid per-kilometer rates from 0 to 9999.99.",
    });
  }

  try {
    await db.transaction(async (tx) => {
      for (const [service, value] of Object.entries(rates)) {
        const configKey = pricingConfigKey(service);
        const configValue = parsePerKmRate(value).toFixed(2);
        const description =
          service === "ride"
            ? "Ride fare charged per kilometer."
            : "Delivery fee charged per kilometer.";
        await tx
          .insert(schema.systemConfig)
          .values({
            configKey,
            configValue,
            configGroup: "pricing",
            description,
            isEditable: true,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.systemConfig.configKey,
            set: {
              configValue,
              configGroup: "pricing",
              description,
              isEditable: true,
              updatedAt: new Date(),
            },
          });
      }
    });
    return res.json({
      success: true,
      data: {
        deliveryPerKm: parsePerKmRate(deliveryPerKm).toFixed(2),
        ridePerKm: parsePerKmRate(ridePerKm).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Could not save admin pricing rates:", error);
    return res.status(500).json({
      success: false,
      message: "Could not save pricing rates.",
    });
  }
});

// =============================================
// SYSTEM CONFIG ROUTES
// =============================================

// Get system config
sysrouter.get("/system-config", async (req, res) => {
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
sysrouter.put("/system-config/:key", async (req, res) => {
  if (["delivery_per_km", "ride_per_km"].includes(req.params.key)) {
    return res.status(400).json({
      success: false,
      message: "Update service rates through the admin pricing settings.",
    });
  }
  try {
    const { configValue } = req.body;

    const [config] = await db
      .update(schema.systemConfig)
      .set({
        configValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.systemConfig.configKey, req.params.key),
          eq(schema.systemConfig.isEditable, true),
        ),
      )
      .returning();

    if (!config) {
      return res
        .status(404)
        .json({ success: false, message: "Config key not found" });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default sysrouter;
