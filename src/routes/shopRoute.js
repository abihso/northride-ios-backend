import { and, eq } from "drizzle-orm";
import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  isSupportedDocumentImage,
  storeDocument,
} from "../services/riderDocumentStorage.js";
import {
  isValidUploadedShopImage,
  presentProductImage,
  presentShopImages,
  shopImageContentTypes,
  shopImageKeyPattern,
  shopImageMaxSize,
} from "../services/shopImageStorage.js";

const shoproute = Router();
const isAdmin = (req) =>
  req.user?.userType === "admin" &&
  req.user?.isActive === true &&
  req.user?.isVerified === true;

const shopFields = [
  "ownerId",
  "shopName",
  "shopDescription",
  "shopCategory",
  "address",
  "city",
  "state",
  "country",
  "latitude",
  "longitude",
  "phoneNumber",
  "email",
  "logo",
  "coverImage",
  "isOpen",
  "isVerified",
  "rating",
];

const optionalTextFields = [
  ["shopDescription", 10000],
  ["shopCategory", 50],
  ["city", 50],
  ["state", 50],
  ["country", 50],
  ["phoneNumber", 20],
  ["email", 100],
  ["logo", 255],
  ["coverImage", 255],
];

function parseShop(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Provide shop details." };
  }
  const data = {};
  for (const key of shopFields) {
    if (Object.hasOwn(body, key)) data[key] = body[key];
  }
  if (Object.keys(data).length === 0) {
    return { error: "Provide at least one shop field to update." };
  }

  if (Object.hasOwn(data, "ownerId")) {
    const ownerId = Number(data.ownerId);
    if (!Number.isSafeInteger(ownerId) || ownerId < 1) {
      return { error: "Choose a valid shop owner." };
    }
    data.ownerId = ownerId;
  } else if (!partial) {
    return { error: "Choose a shop owner." };
  }

  for (const [key, maxLength] of optionalTextFields) {
    if (!Object.hasOwn(data, key)) continue;
    if (data[key] === null || data[key] === "") {
      data[key] = null;
      continue;
    }
    if (typeof data[key] !== "string" || data[key].trim().length > maxLength) {
      return { error: `${key} must be no longer than ${maxLength} characters.` };
    }
    data[key] = data[key].trim();
  }

  for (const [key, maxLength] of [
    ["shopName", 100],
    ["address", 255],
  ]) {
    if (!Object.hasOwn(data, key)) continue;
    if (
      typeof data[key] !== "string" ||
      data[key].trim().length < 1 ||
      data[key].trim().length > maxLength
    ) {
      return { error: `${key} is required and must be at most ${maxLength} characters.` };
    }
    data[key] = data[key].trim();
  }
  if (!partial && (!data.shopName || !data.address)) {
    return { error: "Shop name and address are required." };
  }

  for (const key of ["logo", "coverImage"]) {
    const value = data[key];
    if (
      value &&
      !/^https?:\/\/\S+$/i.test(value) &&
      !shopImageKeyPattern.test(value)
    ) {
      return { error: `${key} must be a valid URL or uploaded shop image.` };
    }
  }
  if (Object.hasOwn(data, "email") && data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return { error: "Enter a valid shop email address." };
  }

  for (const key of ["latitude", "longitude"]) {
    if (!Object.hasOwn(data, key)) continue;
    if (data[key] === null || data[key] === "") {
      data[key] = null;
      continue;
    }
    const value = Number(data[key]);
    const min = key === "latitude" ? -90 : -180;
    const max = key === "latitude" ? 90 : 180;
    if (!Number.isFinite(value) || value < min || value > max) {
      return { error: `${key} must be between ${min} and ${max}.` };
    }
    data[key] = String(value);
  }

  if (!partial && (data.latitude === undefined || data.longitude === undefined)) {
    return { error: "Select the shop location on the map." };
  }

  if (
    partial &&
    (Object.hasOwn(data, "latitude") !== Object.hasOwn(data, "longitude"))
  ) {
    return { error: "Update both shop location coordinates together." };
  }

  if (Object.hasOwn(data, "rating")) {
    const rating = Number(data.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      return { error: "Rating must be between 0 and 5." };
    }
    data.rating = rating.toFixed(2);
  }
  for (const key of ["isOpen", "isVerified"]) {
    if (Object.hasOwn(data, key) && typeof data[key] !== "boolean") {
      return { error: `${key} must be true or false.` };
    }
  }
  return { value: data };
}

async function ownerExists(ownerId) {
  const [owner] = await db
    .select({ userId: schema.users.userId })
    .from(schema.users)
    .where(eq(schema.users.userId, ownerId))
    .limit(1);
  return Boolean(owner);
}

function parseId(rawId) {
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : null;
}

shoproute.post(
  "/admin/shop-images/upload",
  (req, res, next) => {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required.",
      });
    }
    return next();
  },
  express.raw({
    type: (req) =>
      shopImageContentTypes.has(
        (req.headers["content-type"] || "")
          .split(";")[0]
          .trim()
          .toLowerCase(),
      ),
    limit: shopImageMaxSize,
  }),
  async (req, res) => {
    const contentType = (req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const body = req.body;
    if (
      !shopImageContentTypes.has(contentType) ||
      !Buffer.isBuffer(body) ||
      body.length < 1 ||
      body.length > shopImageMaxSize ||
      !isSupportedDocumentImage(contentType, body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid JPG, PNG, or WebP image up to 5 MB.",
      });
    }

    const key = `shop-catalog/${randomUUID()}`;
    try {
      await storeDocument({ key, contentType, body });
      return res.json({ success: true, data: { key } });
    } catch (error) {
      console.error("Could not upload shop image:", error);
      return res.status(503).json({
        success: false,
        message: "Image storage is unavailable. Please try again.",
      });
    }
  },
);

shoproute.get("/shops", async (req, res) => {
  try {
    const limitValue = Number.parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Number.isInteger(limitValue)
      ? Math.max(1, Math.min(limitValue, 500))
      : 100;
    const conditions = [];
    if (req.query.isOpen !== undefined) {
      conditions.push(eq(schema.shops.isOpen, req.query.isOpen === "true"));
    }
    if (req.query.isVerified !== undefined) {
      conditions.push(eq(schema.shops.isVerified, req.query.isVerified === "true"));
    }
    if (typeof req.query.city === "string" && req.query.city.trim()) {
      conditions.push(eq(schema.shops.city, req.query.city.trim()));
    }
    let query = db.select().from(schema.shops);
    if (conditions.length) query = query.where(and(...conditions));
    const shops = await query.limit(limit);
    res.json({
      success: true,
      data: await Promise.all(shops.map(presentShopImages)),
    });
  } catch (error) {
    console.error("Could not load shops:", error);
    res.status(500).json({ success: false, message: "Could not load shops." });
  }
});

shoproute.get("/shops/:id", async (req, res) => {
  const shopId = parseId(req.params.id);
  if (!shopId) {
    return res.status(400).json({ success: false, message: "Invalid shop ID." });
  }
  try {
    const [shop] = await db
      .select()
      .from(schema.shops)
      .where(eq(schema.shops.shopId, shopId));
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found." });
    }
    const products = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.shopId, shop.shopId));
    res.json({
      success: true,
      data: {
        ...(await presentShopImages(shop)),
        products: await Promise.all(products.map(presentProductImage)),
      },
    });
  } catch (error) {
    console.error(`Could not load shop ${shopId}:`, error);
    res.status(500).json({ success: false, message: "Could not load shop." });
  }
});

shoproute.post("/shops", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const parsed = parseShop(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  try {
    for (const key of ["logo", "coverImage"]) {
      if (
        shopImageKeyPattern.test(parsed.value[key] || "") &&
        !(await isValidUploadedShopImage(parsed.value[key]))
      ) {
        return res.status(400).json({
          success: false,
          message: `${key} must be a valid uploaded JPG, PNG, or WebP image.`,
        });
      }
    }
    if (!(await ownerExists(parsed.value.ownerId))) {
      return res.status(400).json({
        success: false,
        message: "The selected shop owner does not exist.",
      });
    }
    const [shop] = await db
      .insert(schema.shops)
      .values({
        ...parsed.value,
        isOpen: parsed.value.isOpen ?? true,
        isVerified: parsed.value.isVerified ?? false,
      })
      .returning();
    res.status(201).json({
      success: true,
      data: await presentShopImages(shop),
    });
  } catch (error) {
    console.error("Could not create shop:", error);
    res.status(500).json({ success: false, message: "Could not create shop." });
  }
});

shoproute.patch("/shops/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const shopId = parseId(req.params.id);
  if (!shopId) {
    return res.status(400).json({ success: false, message: "Invalid shop ID." });
  }
  const parsed = parseShop(req.body, true);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }
  try {
    for (const key of ["logo", "coverImage"]) {
      if (
        shopImageKeyPattern.test(parsed.value[key] || "") &&
        !(await isValidUploadedShopImage(parsed.value[key]))
      ) {
        return res.status(400).json({
          success: false,
          message: `${key} must be a valid uploaded JPG, PNG, or WebP image.`,
        });
      }
    }
    if (
      parsed.value.ownerId !== undefined &&
      !(await ownerExists(parsed.value.ownerId))
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected shop owner does not exist.",
      });
    }
    const [shop] = await db
      .update(schema.shops)
      .set(parsed.value)
      .where(eq(schema.shops.shopId, shopId))
      .returning();
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found." });
    }
    res.json({
      success: true,
      data: await presentShopImages(shop),
    });
  } catch (error) {
    console.error(`Could not update shop ${shopId}:`, error);
    res.status(500).json({ success: false, message: "Could not update shop." });
  }
});

shoproute.delete("/shops/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }
  const shopId = parseId(req.params.id);
  if (!shopId) {
    return res.status(400).json({ success: false, message: "Invalid shop ID." });
  }
  try {
    const [order] = await db
      .select({ orderId: schema.orders.orderId })
      .from(schema.orders)
      .where(eq(schema.orders.shopId, shopId))
      .limit(1);
    if (order) {
      return res.status(409).json({
        success: false,
        message:
          "This shop has order history and cannot be deleted. Close it instead to preserve its records.",
      });
    }
    const [shop] = await db
      .delete(schema.shops)
      .where(eq(schema.shops.shopId, shopId))
      .returning({ shopId: schema.shops.shopId });
    if (!shop) {
      return res.status(404).json({ success: false, message: "Shop not found." });
    }
    res.json({ success: true, data: { shopId } });
  } catch (error) {
    console.error(`Could not delete shop ${shopId}:`, error);
    res.status(500).json({ success: false, message: "Could not delete shop." });
  }
});

export { parseShop };
export default shoproute;
