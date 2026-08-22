import { Router } from "express";
import { eq, and, desc, sql,or } from "drizzle-orm";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const deliveryRouter = Router();

// =============================================
// DELIVERY ROUTES
// =============================================

// 1. Create a new delivery order
deliveryRouter.post("/deliveries", async (req, res) => {
  console.log("hit")
  try {
    const { 
      senderId,               
      deliveryType,         
      pickupAddress,        
      pickupLatitude,       
      pickupLongitude,      
      pickupContactName,    
      pickupContactPhone,   
      pickupInstructions,   
      dropoffAddress,       
      dropoffLatitude,      
      dropoffLongitude,     
      recipientName,        
      recipientPhone,       
      dropoffInstructions,  
      packageWeightKg,      
      distanceKm,           
      deliveryFee,          
      totalAmount,          
      paymentMethod,        
    } = req.body;
                
    const deliveryReference = `DEL-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newDelivery = await db.transaction(async (tx) => {
      const [insertedDelivery] = await tx
        .insert(schema.deliveries)
        .values({
          senderId,
          deliveryType,
          status: "pending",
          pickupAddress,
          pickupLatitude,
          pickupLongitude,
          pickupContactName,
          pickupContactPhone,
          pickupInstructions,
          dropoffAddress,
          dropoffLatitude,
          dropoffLongitude,
          recipientName,
          recipientPhone,
          dropoffInstructions,
          packageWeightKg,
          isFragile : true,
          distanceKm,
          deliveryFee,
          tipAmount : 0,
          totalAmount,
          paymentMethod,
          paymentStatus: "pending", 
          deliveryReference
        })
        .returning();

      return insertedDelivery;
    });

    res.status(201).json({ success: true, data: newDelivery });
  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Get delivery details with items
deliveryRouter.get("/deliveries/:id", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const [delivery] = await db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.deliveryId, deliveryId));

    if (!delivery) {
      return res.status(404).json({ success: false, message: "Delivery not found" });
    }

    const items = await db
      .select()
      .from(schema.deliveryItems)
      .where(eq(schema.deliveryItems.deliveryId, deliveryId));

    res.json({
      success: true,
      data: {
        ...delivery,
        items,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Get deliveries for a user or rider (with optional status filter)
deliveryRouter.get("/users/:userId/deliveries", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { 
      role = "sender", 
      status,          
      limit = 50       
    } = req.query;

    const userCondition = role === "rider"
      ? eq(schema.deliveries.riderId, userId)
      : eq(schema.deliveries.senderId, userId);

    const conditions = status 
      ? and(userCondition, eq(schema.deliveries.status, status)) 
      : userCondition;

    const userDeliveries = await db
      .select()
      .from(schema.deliveries)
      .where(conditions)
      .orderBy(desc(schema.deliveries.createdAt))
      .limit(parseInt(limit));

    const grouped = userDeliveries.reduce((acc, delivery) => {
      const dateKey = new Date(delivery.createdAt).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(delivery);
      return acc;
    }, {});

    const groupedArray = Object.keys(grouped).map((date) => ({
      date: date,             
      deliveries: grouped[date] 
    }));

    res.json({ success: true, data: groupedArray });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Update delivery status & log rider earnings (WITH SOCKET.IO REAL-TIME PUSH)
deliveryRouter.patch("/deliveries/:id/status", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const { 
      status,        // string (e.g., "picked_up" | "delivered" | "cancelled")
      riderId,       // number - ID of assigned rider
      earningAmount  // string - amount earned by rider when completed
    } = req.body;

    const updateData = {
      status,
      ...(riderId && { riderId: parseInt(riderId) }),
      updatedAt: new Date(),
    };

    if (status === "picked_up") updateData.pickedUpAt = new Date();
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
      updateData.paymentStatus = "paid"; // Automatically flag payment as paid when delivered
    }

    const updatedDelivery = await db.transaction(async (tx) => {
      const [delivery] = await tx
        .update(schema.deliveries)
        .set(updateData)
        .where(eq(schema.deliveries.deliveryId, deliveryId))
        .returning();

      if (status === "delivered" && riderId && earningAmount) {
        await tx.insert(schema.riderEarnings).values({
          riderId: parseInt(riderId),
          deliveryId,
          amount: earningAmount,
        });
      }

      return delivery;
    });

    if (!updatedDelivery) {
      return res.status(404).json({ success: false, message: "Delivery not found" });
    }

    // ==========================================
    // REAL-TIME SOCKET.IO NOTIFICATION TO RIDER
    // ==========================================
    const targetRiderId = riderId || updatedDelivery.riderId;
    if (targetRiderId) {
      const io = req.app.get('io');
      if (io) {
        io.to(`rider_${targetRiderId}`).emit('delivery_updated', {
          success: true,
          deliveryId,
          status: updatedDelivery.status,
          paymentStatus: updatedDelivery.paymentStatus,
          earningAmount: earningAmount || "0.00",
          message: `Delivery #${deliveryId} status updated to ${status}`
        });
      }
    }

    res.json({ success: true, data: updatedDelivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Cancel a delivery
deliveryRouter.patch("/deliveries/:id/cancel", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const [cancelledDelivery] = await db
      .update(schema.deliveries)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.deliveries.deliveryId, deliveryId))
      .returning();

    if (!cancelledDelivery) {
      return res.status(404).json({ success: false, message: "Delivery not found" });
    }

    // Notify rider if delivery is cancelled
    if (cancelledDelivery.riderId) {
      const io = req.app.get('io');
      if (io) {
        io.to(`rider_${cancelledDelivery.riderId}`).emit('delivery_cancelled', {
          deliveryId,
          message: `Delivery #${deliveryId} has been cancelled.`
        });
      }
    }

    res.json({ success: true, data: cancelledDelivery });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Reject a delivery offer (by a rider)
deliveryRouter.post("/deliveries/:id/reject", async (req, res) => {
  try {
    const deliveryId = parseInt(req.params.id);

    const { riderId, reason } = req.body;

    await db.insert(schema.riderRejections).values({
      deliveryId,
      riderId: parseInt(riderId),
      reason,
    });

    res.json({ success: true, message: "Delivery offer rejected successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Get total earnings summary for a rider
deliveryRouter.get("/riders/:riderId/earnings", async (req, res) => {
  try {
    const riderId = parseInt(req.params.riderId);

    const earningsHistory = await db
      .select()
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId))
      .orderBy(desc(schema.riderEarnings.createdAt));

    const totalEarningsResult = await db
      .select({
        total: sql`SUM(${schema.riderEarnings.amount})`
      })
      .from(schema.riderEarnings)
      .where(eq(schema.riderEarnings.riderId, riderId));

    res.json({
      success: true,
      data: {
        totalEarnings: totalEarningsResult[0]?.total || "0.00",
        history: earningsHistory,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

deliveryRouter.get("/users/:userId/deliveries/:status/:category", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const status = req.params.status;
    const category = req.params.category;
    console.log("userId:", userId, "status:", status);

    const userDeliveries = await db
      .select()
      .from(schema.deliveries)
      .where(and(
        eq(schema.deliveries.senderId, userId),
        eq(schema.deliveries.deliveryType, status),
        eq(schema.deliveries.status, category)
      ))
      .orderBy(desc(schema.deliveries.createdAt));

    // Group deliveries by date (YYYY-MM-DD)
    const grouped = userDeliveries.reduce((acc, delivery) => {
      const dateKey = new Date(delivery.createdAt).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(delivery);
      return acc;
    }, {});

    const groupedArray = Object.keys(grouped).map((date) => ({
      date: date,             
      deliveries: grouped[date] 
    }));

    return res.json({ success: true, data: groupedArray });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
});


deliveryRouter.get("/users/:userId/deliveries/:status/:category/past", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const status = req.params.status;
    console.log("userId:", userId, "status:", status);

    const userDeliveries = await db
      .select()
      .from(schema.deliveries)
      .where(and(
        eq(schema.deliveries.senderId, userId),
        eq(schema.deliveries.deliveryType, status),
        or(
          eq(schema.deliveries.status, "pending"),
          eq(schema.deliveries.status, "delivered"),
          eq(schema.deliveries.status, "cancelled"),
        )
      ))
      .orderBy(desc(schema.deliveries.createdAt));

    // Group deliveries by date (YYYY-MM-DD)
    const grouped = userDeliveries.reduce((acc, delivery) => {
      const dateKey = new Date(delivery.createdAt).toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(delivery);
      return acc;
    }, {});

    const groupedArray = Object.keys(grouped).map((date) => ({
      date: date,             
      deliveries: grouped[date] 
    }));

    return res.json({ success: true, data: groupedArray });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default deliveryRouter;