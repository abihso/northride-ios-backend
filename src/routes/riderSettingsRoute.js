import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

const riderSettingsRoute = Router();

const defaultPreferences = {
  receiveRideOffers: true,
  receiveDeliveryOffers: true,
  receiveRideUpdates: true,
  receiveDeliveryUpdates: true,
  receivePaymentUpdates: true,
  receiveAccountUpdates: true,
  preferredContactMethod: "email",
};

const preferenceKeys = Object.keys(defaultPreferences);

const isRider = (req, res) => {
  if (req.user?.userType === "rider") return true;
  res.status(403).json({
    success: false,
    message: "Rider account required.",
  });
  return false;
};

riderSettingsRoute.get("/riders/me/preferences", async (req, res) => {
  if (!isRider(req, res)) return;
  try {
    const [preferences] = await db
      .select()
      .from(schema.riderPreferences)
      .where(eq(schema.riderPreferences.userId, req.user.userId))
      .limit(1);
    return res.json({
      success: true,
      data: { ...defaultPreferences, ...preferences },
    });
  } catch (error) {
    console.error("Could not load rider preferences:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load rider preferences.",
    });
  }
});

riderSettingsRoute.patch("/riders/me/preferences", async (req, res) => {
  if (!isRider(req, res)) return;
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({
      success: false,
      message: "Provide rider preference updates.",
    });
  }

  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !preferenceKeys.includes(key))) {
    return res.status(400).json({
      success: false,
      message: "One or more rider preferences are invalid.",
    });
  }
  for (const key of keys) {
    if (key === "preferredContactMethod") {
      if (!["email", "phone"].includes(body[key])) {
        return res.status(400).json({
          success: false,
          message: "Choose email or phone as your preferred contact method.",
        });
      }
    } else if (typeof body[key] !== "boolean") {
      return res.status(400).json({
        success: false,
        message: `The ${key} preference must be true or false.`,
      });
    }
  }

  try {
    const [preferences] = await db
      .insert(schema.riderPreferences)
      .values({ userId: req.user.userId, ...body })
      .onConflictDoUpdate({
        target: schema.riderPreferences.userId,
        set: { ...body, updatedAt: new Date() },
      })
      .returning();
    return res.json({ success: true, data: preferences });
  } catch (error) {
    console.error("Could not save rider preferences:", error);
    return res.status(500).json({
      success: false,
      message: "Could not save rider preferences.",
    });
  }
});

riderSettingsRoute.get("/users/me/addresses", async (req, res) => {
  try {
    const addresses = await db
      .select()
      .from(schema.userAddresses)
      .where(eq(schema.userAddresses.userId, req.user.userId))
      .orderBy(desc(schema.userAddresses.updatedAt));
    return res.json({ success: true, data: addresses });
  } catch (error) {
    console.error("Could not load saved places:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load saved places.",
    });
  }
});

riderSettingsRoute.post("/users/me/addresses", async (req, res) => {
  const {
    addressLine1,
    addressLabel,
    addressType,
    latitude,
    longitude,
  } = req.body ?? {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (
    typeof addressLine1 !== "string" ||
    !addressLine1.trim() ||
    addressLine1.trim().length > 255 ||
    typeof addressLabel !== "string" ||
    !addressLabel.trim() ||
    addressLabel.trim().length > 50 ||
    !["home", "work", "other"].includes(addressType) ||
    !Number.isFinite(lat) ||
    Math.abs(lat) > 90 ||
    !Number.isFinite(lng) ||
    Math.abs(lng) > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid place and enter a label.",
    });
  }
  try {
    const [address] = await db
      .insert(schema.userAddresses)
      .values({
        userId: req.user.userId,
        addressLine1: addressLine1.trim(),
        addressLabel: addressLabel.trim(),
        addressType,
        latitude: String(lat),
        longitude: String(lng),
      })
      .returning();
    return res.status(201).json({ success: true, data: address });
  } catch (error) {
    console.error("Could not save place:", error);
    return res.status(500).json({
      success: false,
      message: "Could not save this place.",
    });
  }
});

riderSettingsRoute.delete("/users/me/addresses/:id", async (req, res) => {
  const addressId = Number(req.params.id);
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return res.status(400).json({
      success: false,
      message: "Saved place not found.",
    });
  }
  try {
    const [address] = await db
      .delete(schema.userAddresses)
      .where(
        and(
          eq(schema.userAddresses.addressId, addressId),
          eq(schema.userAddresses.userId, req.user.userId),
        ),
      )
      .returning({ addressId: schema.userAddresses.addressId });
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Saved place not found.",
      });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error("Could not remove saved place:", error);
    return res.status(500).json({
      success: false,
      message: "Could not remove this place.",
    });
  }
});

riderSettingsRoute.get("/users/me/data-export", async (req, res) => {
  try {
    const [user, addresses, rider, preferences] = await Promise.all([
      db
        .select({
          userId: schema.users.userId,
          fullName: schema.users.fullName,
          email: schema.users.email,
          phoneNumber: schema.users.phoneNumber,
          userType: schema.users.userType,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.userId, req.user.userId))
        .limit(1),
      db
        .select()
        .from(schema.userAddresses)
        .where(eq(schema.userAddresses.userId, req.user.userId)),
      db
        .select({
          riderId: schema.riders.riderId,
          vehicleType: schema.riders.vehicleType,
          vehiclePlateNumber: schema.riders.vehiclePlateNumber,
          vehicleModel: schema.riders.vehicleModel,
          vehicleColor: schema.riders.vehicleColor,
          isAvailable: schema.riders.isAvailable,
          isApproved: schema.riders.isApproved,
          rating: schema.riders.rating,
          bankName: schema.riders.bankName,
          bankAccountName: schema.riders.bankAccountName,
          bankAccountNumber: schema.riders.bankAccountNumber,
        })
        .from(schema.riders)
        .where(eq(schema.riders.userId, req.user.userId))
        .limit(1),
      db
        .select({
          receiveRideOffers: schema.riderPreferences.receiveRideOffers,
          receiveDeliveryOffers: schema.riderPreferences.receiveDeliveryOffers,
          receiveRideUpdates: schema.riderPreferences.receiveRideUpdates,
          receiveDeliveryUpdates:
            schema.riderPreferences.receiveDeliveryUpdates,
          receivePaymentUpdates:
            schema.riderPreferences.receivePaymentUpdates,
          receiveAccountUpdates: schema.riderPreferences.receiveAccountUpdates,
          preferredContactMethod:
            schema.riderPreferences.preferredContactMethod,
        })
        .from(schema.riderPreferences)
        .where(eq(schema.riderPreferences.userId, req.user.userId))
        .limit(1),
    ]);
    const [earnings, rides, deliveries] = rider[0]
      ? await Promise.all([
          db
            .select({
              earningId: schema.riderEarnings.earningId,
              earningType: schema.riderEarnings.earningType,
              totalEarned: schema.riderEarnings.totalEarned,
              status: schema.riderEarnings.status,
              createdAt: schema.riderEarnings.createdAt,
            })
            .from(schema.riderEarnings)
            .where(eq(schema.riderEarnings.riderId, rider[0].riderId))
            .orderBy(desc(schema.riderEarnings.createdAt))
            .limit(500),
          db
            .select({
              rideId: schema.rideBookings.rideId,
              rideReference: schema.rideBookings.rideReference,
              status: schema.rideBookings.status,
              pickupAddress: schema.rideBookings.pickupAddress,
              dropoffAddress: schema.rideBookings.dropoffAddress,
              estimatedPrice: schema.rideBookings.estimatedPrice,
              actualPrice: schema.rideBookings.actualPrice,
              bookedAt: schema.rideBookings.bookedAt,
              rideCompletedAt: schema.rideBookings.rideCompletedAt,
            })
            .from(schema.rideBookings)
            .where(eq(schema.rideBookings.riderId, rider[0].riderId))
            .orderBy(desc(schema.rideBookings.bookedAt))
            .limit(500),
          db
            .select({
              deliveryId: schema.deliveries.deliveryId,
              deliveryReference: schema.deliveries.deliveryReference,
              status: schema.deliveries.status,
              pickupAddress: schema.deliveries.pickupAddress,
              dropoffAddress: schema.deliveries.dropoffAddress,
              deliveryFee: schema.deliveries.deliveryFee,
              totalAmount: schema.deliveries.totalAmount,
              createdAt: schema.deliveries.createdAt,
              deliveredAt: schema.deliveries.deliveredAt,
            })
            .from(schema.deliveries)
            .where(eq(schema.deliveries.riderId, rider[0].riderId))
            .orderBy(desc(schema.deliveries.createdAt))
            .limit(500),
        ])
      : [[], [], []];

    return res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        account: user[0] ?? null,
        riderProfile: rider[0] ?? null,
        preferences: { ...defaultPreferences, ...preferences[0] },
        savedPlaces: addresses,
        recentEarnings: earnings,
        recentRides: rides,
        recentDeliveries: deliveries,
        limits: {
          earningRecords: 500,
          rides: 500,
          deliveries: 500,
          note:
            "This export includes at most 500 records of each activity type.",
        },
      },
    });
  } catch (error) {
    console.error("Could not export user data:", error);
    return res.status(500).json({
      success: false,
      message: "Could not prepare your data export.",
    });
  }
});

export default riderSettingsRoute;
