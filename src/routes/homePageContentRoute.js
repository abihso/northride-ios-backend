import { asc, desc, eq } from "drizzle-orm";
import express, { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "../db/index.js";
import { homePageContent } from "../db/schema.js";
import {
  createDocumentViewUrl,
  deleteStoredDocument,
  getUploadedDocumentMetadata,
  isSupportedDocumentImage,
  storeDocument,
} from "../services/riderDocumentStorage.js";

const homePageContentRouter = Router();
const contentTypes = new Set(["promotion", "suggestion"]);
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSize = 5 * 1024 * 1024;
const imageKeyPattern =
  /^home-page-content\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isAdmin = (req) => req.user?.userType === "admin";

const removeUploadedImage = async (key) => {
  try {
    const [record] = await db
      .select({ homeContentId: homePageContent.homeContentId })
      .from(homePageContent)
      .where(eq(homePageContent.imageUrl, key))
      .limit(1);
    if (record) return;
    await deleteStoredDocument(key);
  } catch (error) {
    console.error("Could not remove unassociated home content image from S3:", error);
  }
};

const requireAdmin = (req, res, next) => {
  if (isAdmin(req)) return next();
  return res.status(403).json({
    success: false,
    message: "Administrator access required.",
  });
};

const presentRecord = async (record) => ({
  ...record,
  imageUrl: imageKeyPattern.test(record.imageUrl)
    ? await createDocumentViewUrl({
        key: record.imageUrl,
        expiresIn: 3600,
      })
    : record.imageUrl,
});

async function parseContent(body) {
  const contentType =
    typeof body?.contentType === "string" ? body.contentType : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  const distance =
    typeof body?.distance === "string" ? body.distance.trim() : "";
  const location =
    typeof body?.location === "string" ? body.location.trim() : "";
  const rating =
    body?.rating === "" || body?.rating === null || body?.rating === undefined
      ? null
      : Number(body.rating);

  if (!contentTypes.has(contentType)) {
    return { error: "Choose either a promotion or suggestion." };
  }
  if (!title || title.length > 100) {
    return { error: "Title is required and must be 100 characters or fewer." };
  }
  if (!imageKeyPattern.test(imageUrl)) {
    return { error: "Upload a dashboard image before creating the card." };
  }
  if (distance.length > 50 || location.length > 150) {
    return { error: "Distance or location is too long." };
  }
  if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    return { error: "Rating must be a number from 0 to 5." };
  }

  return {
    value: {
      contentType,
      title,
      imageUrl,
      distance: distance || null,
      location: location || null,
      rating: rating === null ? null : rating.toFixed(2),
    },
  };
}

homePageContentRouter.get("/home-page-content", async (_req, res) => {
  try {
    const records = await db
      .select()
      .from(homePageContent)
      .where(eq(homePageContent.isActive, true))
      .orderBy(asc(homePageContent.displayOrder), desc(homePageContent.createdAt));
    return res.json({
      success: true,
      data: await Promise.all(records.map(presentRecord)),
    });
  } catch (error) {
    console.error("Could not load customer home content:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load customer home content.",
    });
  }
});

homePageContentRouter.get("/admin/home-page-content", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  try {
    const records = await db
      .select()
      .from(homePageContent)
      .orderBy(asc(homePageContent.displayOrder), desc(homePageContent.createdAt));
    return res.json({
      success: true,
      data: await Promise.all(records.map(presentRecord)),
    });
  } catch (error) {
    console.error("Could not load admin home content:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load home content.",
    });
  }
});

homePageContentRouter.post(
  "/admin/home-page-content/upload",
  requireAdmin,
  express.raw({
    type: (req) =>
      imageContentTypes.has(
        (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase(),
      ),
    limit: maxImageSize,
  }),
  async (req, res) => {
    const contentType = (req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const body = req.body;
    if (
      !imageContentTypes.has(contentType) ||
      !Buffer.isBuffer(body) ||
      body.length < 1 ||
      body.length > maxImageSize ||
      !isSupportedDocumentImage(contentType, body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid JPG, PNG, or WebP image up to 5 MB.",
      });
    }

    const key = `home-page-content/${randomUUID()}`;
    try {
      await storeDocument({ key, contentType, body });
      return res.json({ success: true, data: { key } });
    } catch (error) {
      console.error("Could not upload home content image:", error);
      return res.status(503).json({
        success: false,
        message: "Image storage is unavailable. Please try again.",
      });
    }
  },
);

homePageContentRouter.post("/admin/home-page-content", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: "Administrator access required.",
    });
  }

  const parsed = await parseContent(req.body);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  try {
    const metadata = await getUploadedDocumentMetadata(parsed.value.imageUrl);
    if (
      !imageContentTypes.has(metadata.contentType) ||
      !Number.isInteger(metadata.fileSize) ||
      metadata.fileSize < 1 ||
      metadata.fileSize > maxImageSize ||
      !metadata.validImage
    ) {
      await removeUploadedImage(parsed.value.imageUrl);
      return res.status(400).json({
        success: false,
        message: "The uploaded image is invalid or exceeds the 5 MB limit.",
      });
    }

    const [record] = await db
      .insert(homePageContent)
      .values(parsed.value)
      .returning();
    return res.status(201).json({
      success: true,
      data: await presentRecord(record),
    });
  } catch (error) {
    console.error("Could not create home content:", error);
    await removeUploadedImage(parsed.value.imageUrl);
    return res.status(500).json({
      success: false,
      message: "Could not create home content.",
    });
  }
});

homePageContentRouter.patch(
  "/admin/home-page-content/:id",
  async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required.",
      });
    }

    const id = Number(req.params.id);
    const { isActive } = req.body || {};
    if (!Number.isSafeInteger(id) || id <= 0 || typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "A valid record ID and active status are required.",
      });
    }

    try {
      const [record] = await db
        .update(homePageContent)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(homePageContent.homeContentId, id))
        .returning();
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Home content record not found.",
        });
      }
      return res.json({
        success: true,
        data: await presentRecord(record),
      });
    } catch (error) {
      console.error("Could not update home content:", error);
      return res.status(500).json({
        success: false,
        message: "Could not update home content.",
      });
    }
  },
);

homePageContentRouter.delete(
  "/admin/home-page-content/:id",
  async (req, res) => {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required.",
      });
    }

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid record ID is required.",
      });
    }

    try {
      const [record] = await db
        .delete(homePageContent)
        .where(eq(homePageContent.homeContentId, id))
        .returning({
          homeContentId: homePageContent.homeContentId,
          imageUrl: homePageContent.imageUrl,
        });
      if (!record) {
        return res.status(404).json({
          success: false,
          message: "Home content record not found.",
        });
      }
      let warning;
      if (imageKeyPattern.test(record.imageUrl)) {
        try {
          await deleteStoredDocument(record.imageUrl);
        } catch (error) {
          console.error("Could not remove deleted home content image from S3:", error);
          warning =
            "The card was deleted, but its image could not be removed from AWS S3.";
        }
      }
      return res.json({
        success: true,
        data: record,
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      console.error("Could not delete home content:", error);
      return res.status(500).json({
        success: false,
        message: "Could not delete home content.",
      });
    }
  },
);

export default homePageContentRouter;
