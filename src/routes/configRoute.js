import { Router } from "express";
import db from "../db/index.js";
import { userSystemConfig } from "../db/schema.js";

const configRoute = Router();

configRoute.post("/payment-method", async (req, res) => {
  console.log("hit");
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: 'data' is required",
      });
    }

    // Upsert: Insert new record, or update if the user's config already exists
    const [savedConfig] = await db
      .insert(userSystemConfig)
      .values({
        userId: req.user.userId,
        configKey: "payment_method", // Explicitly setting the required config_key
        configValue: JSON.stringify(data), // Storing the data payload (serialized as string or matching your column type)
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSystemConfig.userId, // Assumes a unique index on user_id
        set: {
          configValue: JSON.stringify(data),
          updatedAt: new Date(),
        },
      })
      .returning();

    return res.status(200).json({
      success: true,
      message: "Payment method configuration saved successfully.",
      data: savedConfig,
    });
  } catch (error) {
    console.error("Error saving payment method config:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default configRoute;
