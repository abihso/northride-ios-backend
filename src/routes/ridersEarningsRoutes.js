import { desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const ridersearningsrouter = Router();
const isAdmin = (req) => req.user?.userType === "admin";
// =============================================
// RIDER EARNINGS ROUTES
// =============================================

// Get rider earnings
ridersearningsrouter.get("/riders/:riderId/earnings", async (req, res) => {
  try {
    const [rider] = await db
      .select()
      .from(schema.riders)
      .where(eq(schema.riders.userId, req.user.userId))
      .limit(1);
    const riderId = Number(req.params.riderId);
    if (!isAdmin(req) && (!rider || rider.riderId !== riderId)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view these earnings." });
    }
    const { status, limit = 50 } = req.query;
    let query = db
      .select()
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId))
      .orderBy(desc(schema.riderEarnings.createdAt));

    if (status) {
      query = query.where(eq(schema.riderEarnings.status, status));
    }

    const earnings = await query.limit(parseInt(limit));

    // Calculate totals
    const totals = await db
      .select({
        totalEarned: sql`SUM(${schema.riderEarnings.totalEarned})`,
        totalPending: sql`SUM(CASE WHEN ${schema.riderEarnings.status} = 'pending' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END)`,
        totalPaid: sql`SUM(CASE WHEN ${schema.riderEarnings.status} = 'paid' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END)`,
      })
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId));

    res.json({
      success: true,
      data: {
        earnings,
        summary: {
          totalEarned: parseFloat(totals[0].totalEarned) || 0,
          totalPending: parseFloat(totals[0].totalPending) || 0,
          totalPaid: parseFloat(totals[0].totalPaid) || 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark earnings as paid
ridersearningsrouter.patch(
  "/rider-earnings/:earningId/pay",
  async (req, res) => {
    try {
      const [earning] = await db
        .update(schema.riderEarnings)
        .set({
          status: "paid",
          paidAt: new Date(),
        })
        .where(
          eq(schema.riderEarnings.earningId, parseInt(req.params.earningId)),
        )
        .returning();

      if (!earning) {
        return res
          .status(404)
          .json({ success: false, message: "Earning record not found" });
      }
      res.json({ success: true, data: earning });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
);
export default ridersearningsrouter;
