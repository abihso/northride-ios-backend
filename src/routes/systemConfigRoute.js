import { eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const sysrouter = Router();

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
  try {
    const { configValue } = req.body;

    const [config] = await db
      .update(schema.systemConfig)
      .set({
        configValue,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemConfig.configKey, req.params.key))
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
