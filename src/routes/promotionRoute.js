import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const promotionrouter = Router()

// =============================================
// PROMOTION ROUTES
// =============================================

// Get active promotions
promotionrouter.get("/promotions", async (req, res) => {
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
promotionrouter.get("/promotions/validate/:code", async (req, res) => {
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
export default promotionrouter