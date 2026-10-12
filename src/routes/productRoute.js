import { and, eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  isValidUploadedShopImage,
  presentProductImage,
  shopImageKeyPattern,
} from "../services/shopImageStorage.js";

const productroute = Router();
const isAdmin = (req) =>
  req.user?.userType === "admin" &&
  req.user?.isActive === true &&
  req.user?.isVerified === true;

const productFields = [
  "productName",
  "productDescription",
  "category",
  "price",
  "discountPrice",
  "stockQuantity",
  "unit",
  "imageUrl",
  "isAvailable",
  "isFeatured",
  "preparationTime",
];

function parseId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}

function parseProduct(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Provide product details." };
  }
  const data = {};
  for (const key of productFields) {
    if (Object.hasOwn(body, key)) data[key] = body[key];
  }
  if (!Object.keys(data).length) {
    return { error: "Provide at least one product field to update." };
  }

  for (const [key, maxLength] of [
    ["productName", 100],
    ["productDescription", 10000],
    ["category", 50],
    ["unit", 20],
  ]) {
    if (!Object.hasOwn(data, key)) continue;
    if (data[key] === null || data[key] === "") {
      if (key === "productName") {
        return { error: "Product name is required." };
      }
      data[key] = null;
      continue;
    }
    if (typeof data[key] !== "string" || data[key].trim().length > maxLength) {
      return { error: `${key} must be no longer than ${maxLength} characters.` };
    }
    data[key] = data[key].trim();
  }
  if (!partial && !data.productName) {
    return { error: "Product name is required." };
  }
  if (!partial && !Object.hasOwn(data, "price")) {
    return { error: "Product price is required." };
  }

  for (const key of ["price", "discountPrice"]) {
    if (!Object.hasOwn(data, key)) continue;
    if (key === "price" && (data[key] === null || data[key] === "")) {
      return { error: "Product price is required." };
    }
    if (key === "discountPrice" && (data[key] === null || data[key] === "")) {
      data[key] = null;
      continue;
    }
    const value = Number(data[key]);
    if (!Number.isFinite(value) || value < 0 || value > 99999999.99) {
      return { error: `${key} must be between 0 and 99,999,999.99.` };
    }
    data[key] = value.toFixed(2);
  }
  if (
    data.discountPrice !== undefined &&
    data.discountPrice !== null &&
    data.price !== undefined &&
    Number(data.discountPrice) >= Number(data.price)
  ) {
    return { error: "Discount price must be less than the regular price." };
  }
  for (const key of ["stockQuantity", "preparationTime"]) {
    if (!Object.hasOwn(data, key)) continue;
    if (data[key] === null || data[key] === "") {
      return { error: `${key} must be a non-negative whole number.` };
    }
    const value = Number(data[key]);
    if (!Number.isSafeInteger(value) || value < 0) {
      return { error: `${key} must be a non-negative whole number.` };
    }
    data[key] = value;
  }
  for (const key of ["isAvailable", "isFeatured"]) {
    if (Object.hasOwn(data, key) && typeof data[key] !== "boolean") {
      return { error: `${key} must be true or false.` };
    }
  }
  if (Object.hasOwn(data, "imageUrl")) {
    if (data.imageUrl === null || data.imageUrl === "") {
      data.imageUrl = null;
    } else if (
      typeof data.imageUrl !== "string" ||
      data.imageUrl.length > 255 ||
      (!/^https?:\/\/\S+$/i.test(data.imageUrl.trim()) &&
        !shopImageKeyPattern.test(data.imageUrl.trim()))
    ) {
      return {
        error: "Product image must be a valid URL or uploaded shop image.",
      };
    } else {
      data.imageUrl = data.imageUrl.trim();
    }
  }
  return { value: data };
}

productroute.get("/shops/:shopId/products", async (req, res) => {
  const shopId = parseId(req.params.shopId);
  if (!shopId) {
    return res.status(400).json({ success: false, message: "Invalid shop ID." });
  }
  try {
    const conditions = [eq(schema.products.shopId, shopId)];
    if (req.query.isAvailable !== undefined) {
      conditions.push(
        eq(schema.products.isAvailable, req.query.isAvailable === "true"),
      );
    }
    if (typeof req.query.category === "string" && req.query.category.trim()) {
      conditions.push(eq(schema.products.category, req.query.category.trim()));
    }
    const products = await db
      .select()
      .from(schema.products)
      .where(and(...conditions));
    res.json({
      success: true,
      data: await Promise.all(products.map(presentProductImage)),
    });
  } catch (error) {
    console.error(`Could not load products for shop ${shopId}:`, error);
    res.status(500).json({ success: false, message: "Could not load products." });
  }
});

productroute.post("/products", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const shopId = parseId(String(req.body?.shopId ?? ""));
  if (!shopId) {
    return res.status(400).json({ success: false, message: "Choose a valid shop." });
  }
  const parsed = parseProduct(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  try {
    if (
      shopImageKeyPattern.test(parsed.value.imageUrl || "") &&
      !(await isValidUploadedShopImage(parsed.value.imageUrl))
    ) {
      return res.status(400).json({
        success: false,
        message: "Product image must be a valid uploaded JPG, PNG, or WebP image.",
      });
    }
    const [shop] = await db
      .select({ shopId: schema.shops.shopId })
      .from(schema.shops)
      .where(eq(schema.shops.shopId, shopId))
      .limit(1);
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found." });
    }
    const [product] = await db
      .insert(schema.products)
      .values({
        ...parsed.value,
        shopId,
        stockQuantity: parsed.value.stockQuantity ?? 0,
        unit: parsed.value.unit ?? "piece",
        isAvailable: parsed.value.isAvailable ?? true,
        isFeatured: parsed.value.isFeatured ?? false,
        preparationTime: parsed.value.preparationTime ?? 0,
      })
      .returning();
    res.status(201).json({
      success: true,
      data: await presentProductImage(product),
    });
  } catch (error) {
    console.error("Could not create product:", error);
    res.status(500).json({ success: false, message: "Could not create product." });
  }
});

productroute.patch("/products/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const productId = parseId(req.params.id);
  if (!productId) {
    return res.status(400).json({ success: false, message: "Invalid product ID." });
  }
  const parsed = parseProduct(req.body, true);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  try {
    if (
      shopImageKeyPattern.test(parsed.value.imageUrl || "") &&
      !(await isValidUploadedShopImage(parsed.value.imageUrl))
    ) {
      return res.status(400).json({
        success: false,
        message: "Product image must be a valid uploaded JPG, PNG, or WebP image.",
      });
    }
    const [existing] = await db
      .select({
        price: schema.products.price,
        discountPrice: schema.products.discountPrice,
      })
      .from(schema.products)
      .where(eq(schema.products.productId, productId));
    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    const finalPrice = parsed.value.price ?? existing.price;
    const finalDiscount =
      parsed.value.discountPrice !== undefined
        ? parsed.value.discountPrice
        : existing.discountPrice;
    if (finalDiscount !== null && Number(finalDiscount) >= Number(finalPrice)) {
      return res.status(400).json({
        success: false,
        message: "Discount price must be less than the regular price.",
      });
    }
    const [product] = await db
      .update(schema.products)
      .set(parsed.value)
      .where(eq(schema.products.productId, productId))
      .returning();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    res.json({
      success: true,
      data: await presentProductImage(product),
    });
  } catch (error) {
    console.error(`Could not update product ${productId}:`, error);
    res.status(500).json({ success: false, message: "Could not update product." });
  }
});

productroute.patch("/products/:id/stock", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const productId = parseId(req.params.id);
  const stockQuantity = Number(req.body?.stockQuantity);
  if (!productId || !Number.isSafeInteger(stockQuantity) || stockQuantity < 0) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid product ID and non-negative stock quantity.",
    });
  }
  try {
    const [product] = await db
      .update(schema.products)
      .set({ stockQuantity })
      .where(eq(schema.products.productId, productId))
      .returning();
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    console.error(`Could not update stock for product ${productId}:`, error);
    res.status(500).json({ success: false, message: "Could not update product stock." });
  }
});

productroute.delete("/products/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const productId = parseId(req.params.id);
  if (!productId) {
    return res.status(400).json({ success: false, message: "Invalid product ID." });
  }
  try {
    const [product] = await db
      .delete(schema.products)
      .where(eq(schema.products.productId, productId))
      .returning({ productId: schema.products.productId });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    res.json({ success: true, data: product });
  } catch (error) {
    console.error(`Could not delete product ${productId}:`, error);
    res.status(500).json({ success: false, message: "Could not delete product." });
  }
});

export { parseProduct };
export default productroute;
