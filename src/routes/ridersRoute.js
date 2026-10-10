import { and, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createRiderDashboardHandler } from "../controllers/riderDashboard.js";
import { createCompleteRiderOnboardingHandler } from "../controllers/riderOnboarding.js";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import calculateDistance from "../utils/cal.js";
import {
  createDocumentUploadUrl,
  createDocumentViewUrl,
  deleteStoredDocument,
  getUploadedDocumentMetadata,
} from "../services/riderDocumentStorage.js";
const riderRoute = Router();
const isAdmin = (req) =>
  req.user?.userType === "admin" &&
  req.user?.isActive === true &&
  req.user?.isVerified === true;
const allowedDocumentTypes = [
  "ghana_card_front",
  "ghana_card_back",
  "driver_license_front",
  "driver_license_back",
  "roadworthiness",
  "insurance",
];
const allowedDocumentContentTypes = ["image/jpeg", "image/png", "image/webp"];
const maxDocumentSize = 5 * 1024 * 1024;

riderRoute.post(
  "/riders/onboarding/complete",
  createCompleteRiderOnboardingHandler({ db }),
);

riderRoute.post("/riders/me/documents/upload-url", async (req, res) => {
  if (
    req.user?.userType !== "rider" ||
    req.user?.isActive !== true ||
    req.user?.isVerified !== true
  ) {
    return res
      .status(403)
      .json({ success: false, message: "A rider account is required." });
  }
  const { documentType, contentType, fileSize } = req.body || {};
  if (
    !allowedDocumentTypes.includes(documentType) ||
    !allowedDocumentContentTypes.includes(contentType) ||
    !Number.isInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > maxDocumentSize
  ) {
    return res.status(400).json({
      success: false,
      message: "Choose a supported document image up to 5 MB.",
    });
  }
  try {
    const [rider] = await db
      .select({ riderId: schema.riders.riderId })
      .from(schema.riders)
      .where(eq(schema.riders.userId, req.user.userId))
      .limit(1);
    if (!rider) {
      return res.status(409).json({
        success: false,
        message: "Complete rider setup before uploading documents.",
      });
    }
    const key = `rider-documents/${req.user.userId}/${documentType}/${randomUUID()}`;
    const uploadUrl = await createDocumentUploadUrl({
      key,
      contentType,
      fileSize,
    });
    return res.json({ success: true, data: { uploadUrl, key } });
  } catch (error) {
    console.error("Could not create rider document upload URL:", error);
    return res.status(503).json({
      success: false,
      message: "Private document storage is unavailable. Please try again.",
    });
  }
});

riderRoute.post("/riders/me/documents", async (req, res) => {
  if (
    req.user?.userType !== "rider" ||
    req.user?.isActive !== true ||
    req.user?.isVerified !== true
  ) {
    return res
      .status(403)
      .json({ success: false, message: "A rider account is required." });
  }
  const { documentType, key } = req.body || {};
  if (!allowedDocumentTypes.includes(documentType) || typeof key !== "string") {
    return res.status(400).json({
      success: false,
      message: "The uploaded document reference is invalid.",
    });
  }
  const expectedPrefix = `rider-documents/${req.user.userId}/${documentType}/`;
  const keyId = key.startsWith(expectedPrefix)
    ? key.slice(expectedPrefix.length)
    : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(keyId)) {
    return res.status(400).json({
      success: false,
      message: "The uploaded document reference is invalid.",
    });
  }

  try {
    const metadata = await getUploadedDocumentMetadata(key);
    if (
      !allowedDocumentContentTypes.includes(metadata.contentType) ||
      !metadata.validImage ||
      !Number.isInteger(metadata.fileSize) ||
      metadata.fileSize < 1 ||
      metadata.fileSize > maxDocumentSize
    ) {
      return res.status(400).json({
        success: false,
        message:
          "The uploaded document must be a valid JPG, PNG, or WebP image up to 5 MB.",
      });
    }
    const [rider] = await db
      .select({ riderId: schema.riders.riderId })
      .from(schema.riders)
      .where(eq(schema.riders.userId, req.user.userId))
      .limit(1);
    if (!rider) {
      return res.status(409).json({
        success: false,
        message: "Complete rider setup before uploading documents.",
      });
    }

    const [previousDocument] = await db
      .select({ storageKey: schema.riderDocuments.storageKey })
      .from(schema.riderDocuments)
      .where(
        and(
          eq(schema.riderDocuments.riderId, rider.riderId),
          eq(schema.riderDocuments.documentType, documentType),
        ),
      )
      .limit(1);

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.riderDocuments)
        .where(
          and(
            eq(schema.riderDocuments.riderId, rider.riderId),
            eq(schema.riderDocuments.documentType, documentType),
          ),
        );
      await tx
        .insert(schema.riderDocuments)
        .values({
          riderId: rider.riderId,
          documentType,
          storageKey: key,
          contentType: metadata.contentType,
          fileSize: metadata.fileSize,
        });
      await tx
        .update(schema.riders)
        .set({ isApproved: false, isAvailable: false })
        .where(eq(schema.riders.riderId, rider.riderId));
    });

    if (previousDocument && previousDocument.storageKey !== key) {
      try {
        await deleteStoredDocument(previousDocument.storageKey);
      } catch (error) {
        console.error("Could not remove replaced rider document:", error);
      }
    }
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error("Could not save uploaded rider document:", error);
    return res.status(503).json({
      success: false,
      message: "Could not save the uploaded document. Please try again.",
    });
  }
});

riderRoute.get("/riders/:id/documents", async (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  const riderId = Number(req.params.id);
  if (!Number.isInteger(riderId) || riderId <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Rider not found." });
  }
  try {
    const [rider] = await db
      .select({ riderId: schema.riders.riderId })
      .from(schema.riders)
      .where(eq(schema.riders.riderId, riderId))
      .limit(1);
    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found." });
    }
    const documents = await db
      .select({
        documentId: schema.riderDocuments.documentId,
        documentType: schema.riderDocuments.documentType,
        storageKey: schema.riderDocuments.storageKey,
        contentType: schema.riderDocuments.contentType,
        fileSize: schema.riderDocuments.fileSize,
      })
      .from(schema.riderDocuments)
      .where(eq(schema.riderDocuments.riderId, riderId));
    const data = await Promise.all(
      documents.map(async ({ storageKey, ...document }) => ({
        ...document,
        url: await createDocumentViewUrl({
          key: storageKey,
          contentType: document.contentType,
        }),
      })),
    );
    return res.json({ success: true, data });
  } catch (error) {
    console.error("Could not load rider application documents:", error);
    return res.status(503).json({
      success: false,
      message: "Could not load rider documents. Please try again.",
    });
  }
});

riderRoute.patch("/riders/:id/payout-details", async (req, res) => {
  try {
    const riderId = Number(req.params.id);
    const [rider] = await db
      .select()
      .from(schema.riders)
      .where(eq(schema.riders.riderId, riderId));
    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found." });
    }
    if (rider.userId !== req.user.userId && !isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "You cannot update this payout account.",
      });
    }

    const { bankAccountName, bankAccountNumber, bankName } = req.body;
    if (
      typeof bankAccountName !== "string" ||
      !bankAccountName.trim() ||
      bankAccountName.trim().length > 100 ||
      typeof bankAccountNumber !== "string" ||
      !/^[0-9+ -]{5,50}$/.test(bankAccountNumber.trim()) ||
      typeof bankName !== "string" ||
      !bankName.trim() ||
      bankName.trim().length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid account name, account number, and bank name.",
      });
    }

    const [updatedRider] = await db
      .update(schema.riders)
      .set({
        bankAccountName: bankAccountName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        bankName: bankName.trim(),
      })
      .where(eq(schema.riders.riderId, riderId))
      .returning({
        riderId: schema.riders.riderId,
        bankAccountName: schema.riders.bankAccountName,
        bankAccountNumber: schema.riders.bankAccountNumber,
        bankName: schema.riders.bankName,
      });

    return res.json({ success: true, data: updatedRider });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

riderRoute.get("/riders/me/dashboard", createRiderDashboardHandler({ db }));

// =============================================
// RIDER ROUTES
// =============================================

// Get all riders
riderRoute.get("/riders", async (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  try {
    const { isAvailable, isApproved, limit = 100 } = req.query;
    let query = db.select({
      riderId: schema.riders.riderId,
      userId: schema.riders.userId,
      vehicleType: schema.riders.vehicleType,
      vehiclePlateNumber: schema.riders.vehiclePlateNumber,
      vehicleModel: schema.riders.vehicleModel,
      vehicleColor: schema.riders.vehicleColor,
      licenseNumber: schema.riders.licenseNumber,
      isAvailable: schema.riders.isAvailable,
      isApproved: schema.riders.isApproved,
      idCardImage: schema.riders.idCardImage,
      driverLicenseImage: schema.riders.driverLicenseImage,
      vehicleRegistrationImage: schema.riders.vehicleRegistrationImage,
      insuranceImage: schema.riders.insuranceImage,
      createdAt: schema.riders.createdAt,
    }).from(schema.riders);

    if (isAvailable !== undefined) {
      query = query.where(
        eq(schema.riders.isAvailable, isAvailable === "true"),
      );
    }
    if (isApproved !== undefined) {
      query = query.where(eq(schema.riders.isApproved, isApproved === "true"));
    }

    const riders = await query.limit(parseInt(limit));
    res.json({ success: true, data: riders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

riderRoute.patch("/riders/:id/review", async (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  if (typeof req.body?.isApproved !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "Rider review decision must be true or false.",
    });
  }
  const riderId = Number(req.params.id);
  if (!Number.isInteger(riderId) || riderId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Rider not found.",
    });
  }
  const reviewedDocumentIds = req.body.reviewedDocumentIds;
  if (
    req.body.isApproved &&
    (!Array.isArray(reviewedDocumentIds) ||
      reviewedDocumentIds.length !== allowedDocumentTypes.length ||
      reviewedDocumentIds.some(
        (documentId) =>
          !Number.isInteger(documentId) || documentId <= 0,
      ) ||
      new Set(reviewedDocumentIds).size !== allowedDocumentTypes.length)
  ) {
    return res.status(400).json({
      success: false,
      message: "Preview and confirm all six rider documents before approval.",
    });
  }
  try {
    const [rider] = await db.transaction(async (tx) => {
      if (req.body.isApproved) {
        const documents = await tx
          .select({
            documentId: schema.riderDocuments.documentId,
            documentType: schema.riderDocuments.documentType,
          })
          .from(schema.riderDocuments)
          .where(eq(schema.riderDocuments.riderId, riderId))
          .for("update");
        const currentIds = new Set(
          documents.map((document) => document.documentId),
        );
        if (
          documents.length !== allowedDocumentTypes.length ||
          allowedDocumentTypes.some(
            (documentType) =>
              !documents.some((document) => document.documentType === documentType),
          ) ||
          reviewedDocumentIds.some((documentId) => !currentIds.has(documentId))
        ) {
          const error = new Error(
            "Rider documents changed or are incomplete. Review them again before approval.",
          );
          error.status = 409;
          throw error;
        }
      }
      return tx
        .update(schema.riders)
        .set({
          isApproved: req.body.isApproved,
          ...(req.body.isApproved ? {} : { isAvailable: false }),
        })
        .where(eq(schema.riders.riderId, riderId))
        .returning();
    });
    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found." });
    }
    return res.json({ success: true, data: rider });
  } catch (error) {
    if (error.status === 409) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }
    console.error("Could not update rider application review:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the rider application.",
    });
  }
});

// Get rider by ID
riderRoute.get("/riders/:id", async (req, res) => {
  try {
    const [rider] = await db
      .select()
      .from(schema.riders)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)));

    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found" });
    }
    if (rider.userId !== req.user.userId && !isAdmin(req)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot view this rider." });
    }
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create rider
riderRoute.post("/riders", async (req, res) => {
  try {
    const {
      vehicleType,
      vehiclePlateNumber,
      vehicleModel,
      vehicleColor,
      licenseNumber,
      currentLatitude,
      currentLongitude,
      maxPassengers,
      hasAirConditioning,
      hasWifi,
      bankAccountName,
      bankAccountNumber,
      bankName,
    } = req.body;

    const [rider] = await db
      .insert(schema.riders)
      .values({
        userId: req.user.userId,
        vehicleType,
        vehiclePlateNumber,
        vehicleModel,
        vehicleColor,
        licenseNumber,
        isAvailable: false,
        isApproved: false,
        currentLatitude,
        currentLongitude,
        maxPassengers: maxPassengers || 1,
        hasAirConditioning: hasAirConditioning || false,
        hasWifi: hasWifi || false,
        bankAccountName,
        bankAccountNumber,
        bankName,
      })
      .returning();

    res.status(201).json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update rider availability
riderRoute.patch("/riders/:id/availability", async (req, res) => {
  try {
    const { isAvailable, latitude, longitude } = req.body;
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Availability must be true or false.",
      });
    }

    const [existingRider] = await db
      .select()
      .from(schema.riders)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)));
    if (!existingRider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found" });
    }
    if (existingRider.userId !== req.user.userId && !isAdmin(req)) {
      return res
        .status(403)
        .json({ success: false, message: "You cannot update this rider." });
    }
    if (!isAdmin(req) && !existingRider.isApproved) {
      return res
        .status(403)
        .json({ success: false, message: "Rider approval is required." });
    }
    if (isAvailable) {
      const [activeDelivery] = await db
        .select({ deliveryId: schema.deliveries.deliveryId })
        .from(schema.deliveries)
        .where(
          and(
            eq(schema.deliveries.riderId, existingRider.riderId),
            inArray(schema.deliveries.status, [
              "accepted",
              "picked_up",
              "in_transit",
            ]),
          ),
        )
        .limit(1);
      const [activeRide] = await db
        .select({ rideId: schema.rideBookings.rideId })
        .from(schema.rideBookings)
        .where(
          and(
            eq(schema.rideBookings.riderId, existingRider.riderId),
            inArray(schema.rideBookings.status, [
              "confirmed",
              "arrived",
              "in_progress",
            ]),
          ),
        )
        .limit(1);
      if (activeDelivery || activeRide) {
        return res.status(409).json({
          success: false,
          message: "Complete your active job before going online.",
        });
      }
      if (
        !Number.isFinite(Number(latitude)) ||
        !Number.isFinite(Number(longitude))
      ) {
        return res.status(400).json({
          success: false,
          message: "A current location is required to go online.",
        });
      }
    }

    const updateData = { isAvailable };
    if (latitude !== undefined) updateData.currentLatitude = latitude;
    if (longitude !== undefined) updateData.currentLongitude = longitude;

    const [rider] = await db
      .update(schema.riders)
      .set(updateData)
      .where(eq(schema.riders.riderId, parseInt(req.params.id)))
      .returning();

    if (!rider) {
      return res
        .status(404)
        .json({ success: false, message: "Rider not found" });
    }
    res.json({ success: true, data: rider });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Find nearby riders
riderRoute.get("/riders/nearby", async (req, res) => {
  try {
    const { latitude, longitude, radius = 5, rideType } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required",
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radiusKm = parseFloat(radius);

    let query = db
      .select({
        riderId: schema.riders.riderId,
        vehicleType: schema.riders.vehicleType,
        vehicleModel: schema.riders.vehicleModel,
        vehicleColor: schema.riders.vehicleColor,
        currentLatitude: schema.riders.currentLatitude,
        currentLongitude: schema.riders.currentLongitude,
        rating: schema.riders.rating,
        totalDeliveries: schema.riders.totalDeliveries,
        totalRides: schema.riders.totalRides,
        maxPassengers: schema.riders.maxPassengers,
        hasAirConditioning: schema.riders.hasAirConditioning,
        hasWifi: schema.riders.hasWifi,
      })
      .from(schema.riders)
      .where(
        and(
          eq(schema.riders.isAvailable, true),
          eq(schema.riders.isApproved, true),
          sql`${schema.riders.currentLatitude} IS NOT NULL`,
          sql`${schema.riders.currentLongitude} IS NOT NULL`,
        ),
      );

    if (rideType) {
      query = query.where(eq(schema.riders.vehicleType, rideType));
    }

    const riders = await query;

    // Calculate distance using Haversine formula
    const nearbyRiders = riders
      .map((rider) => {
        const distance = calculateDistance(
          lat,
          lng,
          parseFloat(rider.currentLatitude),
          parseFloat(rider.currentLongitude),
        );
        return { ...rider, distance };
      })
      .filter((rider) => rider.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    res.json({ success: true, data: nearbyRiders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default riderRoute;
