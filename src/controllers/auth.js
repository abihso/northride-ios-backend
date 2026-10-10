import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { deleteStoredDocument } from "../services/riderDocumentStorage.js";
import { establishSession, toSafeUser } from "../utils/authUser.js";

export const createLoginHandler = (passport) => (req, res, next) => {
  return passport.authenticate("local", async (error, user, info) => {
    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: error?.message || info?.message || "Invalid credentials",
      });
    }
    try {
      await establishSession(req, user);
      return res.status(200).json({
        success: true,
        user: toSafeUser(user),
        message: "Login successful",
      });
    } catch {
      return res.status(500).json({
        success: false,
        message: "Unable to save your session. Please sign in again.",
      });
    }
  })(req, res, next);
};

export const getCurrentUser = (req, res) => {
  if (
    !req.isAuthenticated?.() ||
    !req.user?.isActive ||
    !req.user?.isVerified
  ) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }
  return res.json({ success: true, user: toSafeUser(req.user) });
};

export const logoutUser = async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      req.logout((error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie("connect.sid", { path: "/" });
    return res.json({ success: true });
  } catch {
    return res
      .status(500)
      .json({
        success: false,
        message: "Unable to sign out. Please try again.",
      });
  }
};

export const createDeleteAccountHandler =
  ({ db, deleteStoredDocumentFn = deleteStoredDocument }) =>
  async (req, res) => {
    if (req.user?.userType !== "rider") {
      return res.status(403).json({
        success: false,
        message: "This account deletion flow is for rider accounts.",
      });
    }
    if (req.body?.confirmation !== "DELETE") {
      return res.status(400).json({
        success: false,
        message: "Type DELETE to confirm rider account removal.",
      });
    }

    try {
      const [rider] = await db
        .select({ riderId: schema.riders.riderId })
        .from(schema.riders)
        .where(eq(schema.riders.userId, req.user.userId))
        .limit(1);

      if (rider) {
        const [activeDelivery] = await db
          .select({ deliveryId: schema.deliveries.deliveryId })
          .from(schema.deliveries)
          .where(
            and(
              eq(schema.deliveries.riderId, rider.riderId),
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
              eq(schema.rideBookings.riderId, rider.riderId),
              inArray(schema.rideBookings.status, [
                "confirmed",
                "arrived",
                "in_progress",
              ]),
            ),
          )
          .limit(1);
        const [pendingEarning] = await db
          .select({ earningId: schema.riderEarnings.earningId })
          .from(schema.riderEarnings)
          .where(
            and(
              eq(schema.riderEarnings.riderId, rider.riderId),
              eq(schema.riderEarnings.status, "pending"),
            ),
          )
          .limit(1);

        if (activeDelivery || activeRide) {
          return res.status(409).json({
            success: false,
            message:
              "Complete or resolve your active ride or delivery before deleting your account.",
          });
        }
        if (pendingEarning) {
          return res.status(409).json({
            success: false,
            message:
              "Wait until your pending earnings are paid, or contact support before deleting your account.",
          });
        }
      }

      const storedDocuments = rider
        ? await db
            .select({ storageKey: schema.riderDocuments.storageKey })
            .from(schema.riderDocuments)
            .where(eq(schema.riderDocuments.riderId, rider.riderId))
            .limit(6)
        : [];

      await db.transaction(async (tx) => {
        if (rider) {
          await tx
            .update(schema.riders)
            .set({
              isAvailable: false,
              isApproved: false,
              currentLatitude: null,
              currentLongitude: null,
              vehiclePlateNumber: null,
              vehicleModel: null,
              vehicleColor: null,
              licenseNumber: null,
              bankAccountName: null,
              bankAccountNumber: null,
              bankName: null,
              idCardImage: null,
              driverLicenseImage: null,
              vehicleRegistrationImage: null,
              insuranceImage: null,
            })
            .where(eq(schema.riders.riderId, rider.riderId));
          await tx
            .delete(schema.riderLocations)
            .where(eq(schema.riderLocations.riderId, rider.riderId));
          await tx
            .delete(schema.riderDocuments)
            .where(eq(schema.riderDocuments.riderId, rider.riderId));
        }
        await tx
          .delete(schema.userAddresses)
          .where(eq(schema.userAddresses.userId, req.user.userId));
        await tx
          .delete(schema.riderPreferences)
          .where(eq(schema.riderPreferences.userId, req.user.userId));
        await tx
          .delete(schema.notifications)
          .where(eq(schema.notifications.userId, req.user.userId));
        await tx
          .update(schema.users)
          .set({
            fullName: "Deleted rider",
            email: `deleted-rider-${req.user.userId}@accounts.northride.invalid`,
            phoneNumber: null,
            profilePicture: null,
            isActive: false,
            disableNotifications: true,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.userId, req.user.userId));
      });

      const documentCleanup = await Promise.allSettled(
        storedDocuments.map(({ storageKey }) =>
          deleteStoredDocumentFn(storageKey),
        ),
      );
      const failedCleanup = documentCleanup.filter(
        (result) => result.status === "rejected",
      );
      for (const failure of failedCleanup) {
        console.error("Could not remove stored rider document:", failure.reason);
      }

      await new Promise((resolve, reject) => {
        req.logout((error) => (error ? reject(error) : resolve()));
      });
      await new Promise((resolve, reject) => {
        req.session.destroy((error) => (error ? reject(error) : resolve()));
      });
      res.clearCookie("connect.sid", { path: "/" });
      if (failedCleanup.length) {
        return res.status(500).json({
          success: false,
          message:
            "Your account was deactivated, but some document images could not be removed. Please contact support.",
        });
      }
      return res.json({
        success: true,
        message:
          "Your account has been deactivated and personal profile details removed. Required transaction records are retained.",
      });
    } catch (error) {
      console.error("Could not delete rider account:", error);
      return res.status(500).json({
        success: false,
        message: "Could not delete your account. Please try again.",
      });
    }
  };
