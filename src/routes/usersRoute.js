import { eq } from "drizzle-orm";
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
import { deleteStoredDocument } from "../services/riderDocumentStorage.js";
import {
  createRegistrationHandler,
  createVerificationHandler,
} from "../controllers/registration.js";
import { normalizeIdentifier, saveSession } from "../utils/authUser.js";
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

userRoute.post("/verify-email", createVerificationHandler({ db }));

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
    const updateData = {
      fullName,
      email,
      phoneNumber,
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
    const [rider] = await db
      .select({ riderId: schema.riders.riderId })
      .from(schema.riders)
      .where(eq(schema.riders.userId, userId))
      .limit(1);
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
