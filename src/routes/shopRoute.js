import { eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const shoproute = Router();
// =============================================
// SHOP ROUTES
// =============================================

// Get all shops
shoproute.get("/shops", async (req, res) => {
  try {
    const { isOpen, isVerified, city, limit = 100 } = req.query;
    let query = db.select().from(schema.shops);

    if (isOpen !== undefined) {
      query = query.where(eq(schema.shops.isOpen, isOpen === "true"));
    }
    if (isVerified !== undefined) {
      query = query.where(eq(schema.shops.isVerified, isVerified === "true"));
    }
    if (city) {
      query = query.where(eq(schema.shops.city, city));
    }

    const shops = await query.limit(parseInt(limit));
    res.json({ success: true, data: shops });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get shop by ID
shoproute.get("/shops/:id", async (req, res) => {
  try {
    const [shop] = await db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.shopId, parseInt(req.params.id)));

    if (!shop) {
      return res
        .status(404)
        .json({ success: false, message: "Shop not found" });
    }

    // Get shop products
    const products = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.shopId, shop.shopId));

    res.json({ success: true, data: { ...shop, products } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create shop
shoproute.post("/shops", async (req, res) => {
  try {
    const {
      ownerId,
      shopName,
      shopDescription,
      shopCategory,
      address,
      city,
      state,
      country,
      latitude,
      longitude,
      phoneNumber,
      email,
      logo,
      coverImage,
      openingTime,
      closingTime,
    } = req.body;

    const [shop] = await db
      .insert(schema.shops)
      .values({
        ownerId,
        shopName,
        shopDescription,
        shopCategory,
        address,
        city,
        state,
        country,
        latitude,
        longitude,
        phoneNumber,
        email,
        logo,
        coverImage,
        openingTime,
        closingTime,
      })
      .returning();

    res.status(201).json({ success: true, data: shop });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default shoproute;
