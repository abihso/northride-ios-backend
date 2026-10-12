import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { createAdminManagedUserHandler } from "../controllers/adminUsers.js";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import { users } from "../db/schema.js";
import checkEmailOrPhone from "../utils/checkEmailorNumber.js";
import hashpassword from "../utils/hashpassword.js";
import sendVerificationEmail from "../utils/sendEmail.js";
import generateSixDigitCode from "../utils/sixdigits.js";
import sendSms from "../utils/sms.js";
import { createFullNameHandler } from "../controllers/profile.js";
import { deleteStoredDocument } from "../services/riderDocumentStorage.js";
import {
  createRegistrationHandler,
  createVerificationHandler,
} from "../controllers/registration.js";
import {
  normalizeIdentifier,
  saveSession,
  toSafeUser,
} from "../utils/authUser.js";
const userRoute = Router();

const isAdmin = (req) =>
  req.user?.userType === "admin" &&
  req.user?.isActive === true &&
  req.user?.isVerified === true;

userRoute.get("/users", async (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  try {
    const { limit = 100, offset = 0, userType } = req.query;
    let query = db.select().from(schema.users);

    if (userType) {
      query = query.where(eq(schema.users.userType, userType));
    }

    const users = await query.limit(parseInt(limit)).offset(parseInt(offset));
    res.json({
      success: true,
      data: users.map(({ passwordHash, ...user }) => user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.get("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (userId !== req.user.userId && !isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot view this user." });
  }
  try {
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.userId, userId));

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ success: true, data: userWithoutPassword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.post(
  "/users",
  createRegistrationHandler({
    db,
    hashpassword,
    generateSixDigitCode,
    sendSms,
    sendVerificationEmail,
  }),
);

userRoute.post(
  "/users/admin",
  createAdminManagedUserHandler({ db, hashpassword }),
);

userRoute.patch("/users/me/phone-number", async (req, res) => {
  if (
    !["customer", "rider"].includes(req.user?.userType) ||
    req.user?.isActive !== true ||
    req.user?.isVerified !== true
  ) {
    return res.status(403).json({
      success: false,
      message: "An active, verified customer or rider account is required.",
    });
  }

  const phoneNumber =
    typeof req.body?.phoneNumber === "string"
      ? req.body.phoneNumber.trim()
      : "";
  if (
    phoneNumber.length > 20 ||
    checkEmailOrPhone(phoneNumber) !== "Phone"
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid phone number.",
    });
  }

  try {
    const [existingUser] = await db
      .select({ userId: schema.users.userId })
      .from(schema.users)
      .where(eq(schema.users.phoneNumber, phoneNumber))
      .limit(1);
    if (existingUser && existingUser.userId !== req.user.userId) {
      return res.status(409).json({
        success: false,
        message: "That phone number is already linked to another account.",
      });
    }

    const [user] = await db
      .update(schema.users)
      .set({ phoneNumber, updatedAt: new Date() })
      .where(eq(schema.users.userId, req.user.userId))
      .returning();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }
    req.user.phoneNumber = user.phoneNumber;
    return res.json({ success: true, user: toSafeUser(user) });
  } catch (error) {
    console.error("Could not save account phone number:", error);
    return res.status(500).json({
      success: false,
      message: "Could not save your phone number.",
    });
  }
});

userRoute.post("/verify-email", createVerificationHandler({ db }));

userRoute.patch(
  "/users/me/full-name",
  createFullNameHandler({ db }),
);

userRoute.post("/resend-verification", async (req, res) => {
  try {
    const email = normalizeIdentifier(req.body?.email);
    const emailOrPhone = checkEmailOrPhone(email);
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if user exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = existingUser[0];

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified",
      });
    }

    // Generate new verification code
    const newCode = generateSixDigitCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store new verification data in session
    req.session.verification = {
      email: email,
      code: newCode,
      expiresAt: expiresAt,
      attempts: 0,
      userId: user.userId,
    };

    await saveSession(req);

    emailOrPhone == "Phone"
      ? await sendSms({ to: email, text: newCode })
      : await sendVerificationEmail(newCode, email);

    res.status(200).json({
      success: true,
      message: `New verification code sent to your ${emailOrPhone.toLowerCase()}. Please check your ${emailOrPhone.toLowerCase()}.`,
    });
  } catch (error) {
    console.error("Error resending verification code:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
userRoute.put("/users/:id", async (req, res) => {
  const userId = Number(req.params.id);
  const admin = isAdmin(req);
  if (userId !== req.user.userId && !admin) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot update this user." });
  }
  try {
    const { fullName, email, phoneNumber, profilePicture, userType, isActive } =
      req.body;
    if (
      admin &&
      (typeof fullName !== "string" ||
        !fullName.trim() ||
        fullName.trim().length > 100 ||
        typeof email !== "string" ||
        checkEmailOrPhone(email.trim()) === "Neither" ||
        (phoneNumber !== null &&
          (typeof phoneNumber !== "string" || phoneNumber.length > 20)) ||
        !["customer", "rider", "admin"].includes(userType) ||
        typeof isActive !== "boolean")
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter valid account details.",
      });
    }
    if (
      admin &&
      userId === req.user.userId &&
      (userType !== "admin" || !isActive)
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot disable or demote your own administrator account.",
      });
    }
    if (admin) {
      const [target] = await db
        .select({ userType: schema.users.userType })
        .from(schema.users)
        .where(eq(schema.users.userId, userId))
        .limit(1);
      if (
        target?.userType === "admin" &&
        (userType !== "admin" || !isActive)
      ) {
        const activeAdmins = await db
          .select({ userId: schema.users.userId })
          .from(schema.users)
          .where(
            and(
              eq(schema.users.userType, "admin"),
              eq(schema.users.isActive, true),
            ),
          );
        if (activeAdmins.length <= 1) {
          return res.status(409).json({
            success: false,
            message: "The last active administrator cannot be disabled.",
          });
        }
      }
    }
    const updateData = {
      fullName: typeof fullName === "string" ? fullName.trim() : fullName,
      email: typeof email === "string" ? email.trim().toLowerCase() : email,
      phoneNumber:
        typeof phoneNumber === "string" && !phoneNumber.trim()
          ? null
          : phoneNumber,
      profilePicture,
      updatedAt: new Date(),
    };
    if (admin) {
      updateData.userType = userType;
      updateData.isActive = isActive;
    }

    const [user] = await db
      .update(schema.users)
      .set(updateData)
      .where(eq(schema.users.userId, userId))
      .returning();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.delete("/users/:id", async (req, res) => {
  if (!isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "User not found." });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own administrator account.",
      });
    }
    const [target] = await db
      .select({
        userType: schema.users.userType,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .where(eq(schema.users.userId, userId))
      .limit(1);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    if (target.userType === "admin" && target.isActive) {
      const activeAdmins = await db
        .select({ userId: schema.users.userId })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.userType, "admin"),
            eq(schema.users.isActive, true),
          ),
        );
      if (activeAdmins.length <= 1) {
        return res.status(409).json({
          success: false,
          message: "The last active administrator cannot be deleted.",
        });
      }
    }
    const [rider] = await db
      .select({ riderId: schema.riders.riderId })
      .from(schema.riders)
      .where(eq(schema.riders.userId, userId))
      .limit(1);
    const [order] = await db
      .select({ orderId: schema.orders.orderId })
      .from(schema.orders)
      .where(eq(schema.orders.userId, userId))
      .limit(1);
    const [delivery] = await db
      .select({ deliveryId: schema.deliveries.deliveryId })
      .from(schema.deliveries)
      .where(eq(schema.deliveries.senderId, userId))
      .limit(1);
    const [ride] = await db
      .select({ rideId: schema.rideBookings.rideId })
      .from(schema.rideBookings)
      .where(eq(schema.rideBookings.userId, userId))
      .limit(1);
    const [ownedShop] = await db
      .select({ shopId: schema.shops.shopId })
      .from(schema.shops)
      .where(eq(schema.shops.ownerId, userId))
      .limit(1);
    if (ownedShop) {
      return res.status(409).json({
        success: false,
        message:
          "This account owns a shop and cannot be deleted until the shop is transferred or deleted. Disable the account instead if you do not want to transfer the shop.",
      });
    }
    const [assignedOrder] = rider
      ? await db
          .select({ orderId: schema.orders.orderId })
          .from(schema.orders)
          .where(eq(schema.orders.riderId, rider.riderId))
          .limit(1)
      : [];
    const [assignedDelivery] = rider
      ? await db
          .select({ deliveryId: schema.deliveries.deliveryId })
          .from(schema.deliveries)
          .where(eq(schema.deliveries.riderId, rider.riderId))
          .limit(1)
      : [];
    const [assignedRide] = rider
      ? await db
          .select({ rideId: schema.rideBookings.rideId })
          .from(schema.rideBookings)
          .where(eq(schema.rideBookings.riderId, rider.riderId))
          .limit(1)
      : [];
    const [wallet] = await db
      .select({
        walletId: schema.wallets.walletId,
        balance: schema.wallets.balance,
      })
      .from(schema.wallets)
      .where(eq(schema.wallets.userId, userId))
      .limit(1);
    const [walletTransaction] = await db
      .select({ transactionId: schema.walletTransactions.transactionId })
      .from(schema.walletTransactions)
      .where(eq(schema.walletTransactions.userId, userId))
      .limit(1);
    const [riderEarning] = rider
      ? await db
          .select({ earningId: schema.riderEarnings.earningId })
          .from(schema.riderEarnings)
          .where(eq(schema.riderEarnings.riderId, rider.riderId))
          .limit(1)
      : [];
    if (
      order ||
      delivery ||
      ride ||
      assignedOrder ||
      assignedDelivery ||
      assignedRide ||
      walletTransaction ||
      (wallet && Number(wallet.balance || 0) !== 0) ||
      riderEarning
    ) {
      return res.status(409).json({
        success: false,
        message:
          "This account has order, delivery, ride, wallet, or rider-earning history and cannot be deleted. Disable the account instead to preserve its records.",
      });
    }
    if (rider) {
      const documents = await db
        .select({ storageKey: schema.riderDocuments.storageKey })
        .from(schema.riderDocuments)
        .where(eq(schema.riderDocuments.riderId, rider.riderId));
      for (const document of documents) {
        await deleteStoredDocument(document.storageKey);
      }
    }
    const [user] = await db
      .delete(schema.users)
      .where(eq(schema.users.userId, userId))
      .returning();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("Could not delete user account:", error);
    res.status(500).json({
      success: false,
      message: "Could not delete the account and its stored documents.",
    });
  }
});

userRoute.post("/users/login/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (userId !== req.user.userId && !isAdmin(req)) {
    return res
      .status(403)
      .json({ success: false, message: "You cannot update this user." });
  }
  try {
    const [user] = await db
      .update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.userId, userId))
      .returning();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default userRoute;
