import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import checkEmailOrPhone from "../utils/checkEmailorNumber.js";
import {
  establishSession,
  normalizeIdentifier,
  registrationRole,
  saveSession,
  toSafeUser,
} from "../utils/authUser.js";

export const createRegistrationHandler =
  ({
    db,
    hashpassword,
    generateSixDigitCode,
    sendSms,
    sendVerificationEmail,
  }) =>
    async (req, res) => {
    console.log("hit registration handler");
    let user;
    try {
      const { passwordHash, userType } = req.body || {};
      const role = registrationRole(userType);
      const email = normalizeIdentifier(req.body?.email);
      const emailOrPhone = checkEmailOrPhone(email);
      if (
        emailOrPhone === "Neither" ||
        typeof passwordHash !== "string" ||
        passwordHash.length < 6
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a valid email or phone number and a password of at least 6 characters.",
        });
      }
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser) {
        return res
          .status(409)
          .json({
            success: false,
            message: "User with this email already exists",
          });
      }
      [user] = await db
        .insert(users)
        .values({
          email,
          phoneNumber: emailOrPhone === "Phone" ? email : "not set yet",
          passwordHash: hashpassword(passwordHash),
          userType: role,
          riderOnboardingCompleted: false,
          isVerified: false,
          isActive: true,
        })
        .returning();

      const verificationCode = generateSixDigitCode();
      req.session.verification = {
        email,
        code: verificationCode,
        expiresAt: Date.now() + 5 * 60 * 1000,
        attempts: 0,
        userId: user.userId,
      };
      await saveSession(req);
      if (emailOrPhone === "Phone") {
        await sendSms({ to: email, text: verificationCode });
      } else {
        await sendVerificationEmail(verificationCode, email);
      }
      return res.status(201).json({
        success: true,
        message:
          "User created successfully. Check your email or phone for the verification code.",
        data: toSafeUser(user),
        requiresVerification: true,
      });
    } catch (error) {
      if (user) {
        return res.status(502).json({
          success: false,
          message:
            "Your account was created, but we could not send the verification code. Please try sending it again.",
          accountCreated: true,
          requiresVerification: true,
        });
      }
      return res.status(error.status || 500).json({
        success: false,
        message: error.status
          ? error.message
          : "Unable to create your account. Please try again.",
      });
    }
  };

export const createVerificationHandler =
  ({ db }) =>
  async (req, res) => {
    try {
      const email = normalizeIdentifier(req.body?.email);
      let code = req.body?.code;
      if (Array.isArray(code)) code = code.join("");
      if (!email || !code) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Email and verification code are required",
          });
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }
      if (user.isVerified) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Email already verified. Please sign in.",
          });
      }
      if (!user.isActive) {
        return res
          .status(403)
          .json({ success: false, message: "This account is inactive." });
      }
      const verification = req.session.verification;
      if (
        !verification ||
        normalizeIdentifier(verification.email) !== email ||
        verification.userId !== user.userId
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "No matching verification code found. Please request a new one.",
          });
      }
      if (Date.now() > verification.expiresAt || verification.attempts >= 5) {
        delete req.session.verification;
        await saveSession(req);
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Verification code expired or too many attempts. Please request a new one.",
          });
      }
      if (!/^\d{6}$/.test(String(code)) || verification.code !== Number(code)) {
        verification.attempts += 1;
        await saveSession(req);
        return res
          .status(400)
          .json({
            success: false,
            message: `Invalid verification code. ${5 - verification.attempts} attempts remaining.`,
          });
      }
      const [updatedUser] = await db
        .update(users)
        .set({
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.userId, user.userId))
        .returning();
      delete req.session.verification;
      await establishSession(req, updatedUser);
      const safeUser = toSafeUser(updatedUser);
      return res.status(200).json({
        success: true,
        message: "Email verified successfully!",
        user: safeUser,
        data: safeUser,
      });
    } catch {
      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to verify your account. Please try again or sign in.",
        });
    }
  };
