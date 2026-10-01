import { eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const productroute = Router();
// =============================================
// PRODUCT ROUTES
// =============================================

// Get products by shop
productroute.get("/shops/:shopId/products", async (req, res) => {
  try {
    const { isAvailable, category } = req.query;
    let query = db
      .select()
      .from(schema.products)
      .where(eq(schema.products.shopId, parseInt(req.params.shopId)));

    if (isAvailable !== undefined) {
      query = query.where(
        eq(schema.products.isAvailable, isAvailable === "true"),
      );
    }
    if (category) {
      query = query.where(eq(schema.products.category, category));
    }

    const products = await query;
    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create product
productroute.post("/products", async (req, res) => {
  try {
    const {
      shopId,
      productName,
      productDescription,
      category,
      price,
      discountPrice,
      stockQuantity,
      unit,
      imageUrl,
      isAvailable,
      isFeatured,
      preparationTime,
    } = req.body;

    const [product] = await db
      .insert(schema.products)
      .values({
        shopId,
        productName,
        productDescription,
        category,
        price,
        discountPrice,
        stockQuantity: stockQuantity || 0,
        unit: unit || "piece",
        imageUrl,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        isFeatured: isFeatured || false,
        preparationTime: preparationTime || 0,
      })
      .returning();

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update product stock
productroute.patch("/products/:id/stock", async (req, res) => {
  try {
    const { stockQuantity } = req.body;

    const [product] = await db
      .update(schema.products)
      .set({ stockQuantity })
      .where(eq(schema.products.productId, parseInt(req.params.id)))
      .returning();

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
export default productroute;
