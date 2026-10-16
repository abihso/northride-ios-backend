import { randomBytes } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import {
  establishSession,
  normalizeIdentifier,
  registrationRole,
  toSafeUser,
} from "../utils/authUser.js";
import {
  verifyFacebookIdentity,
  verifyGoogleIdentity,
} from "../utils/socialIdentity.js";

const subjectColumn = {
  google: schema.users.googleSubject,
  facebook: schema.users.facebookSubject,
};
const subjectField = {
  google: "googleSubject",
  facebook: "facebookSubject",
};

const conflictError = (message) => {
  const error = new Error(message);
  error.status = 409;
  return error;
};

export const createSocialAuthHandler =
  ({
    db,
    hashpassword,
    verifyGoogle = verifyGoogleIdentity,
    verifyFacebook = verifyFacebookIdentity,
  }) =>
  async (req, res) => {
    const { provider, token } = req.body ?? {};
    if (
      !["google", "facebook"].includes(provider) ||
      typeof token !== "string" ||
      token.length < 20 ||
      token.length > 20_000
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid Google or Facebook sign-in token is required.",
      });
    }

    let role;
    try {
      role = registrationRole(req.body?.userType ?? "customer");
    } catch (error) {
      return res.status(error.status || 400).json({
        success: false,
        message: error.message,
      });
    }

    try {
      const identity =
        provider === "google"
          ? await verifyGoogle(token)
          : await verifyFacebook(token);
      const email = normalizeIdentifier(identity.email);
      if (
        !identity.subject ||
        !email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return res.status(401).json({
          success: false,
          message: `The ${provider} account did not provide a valid email address.`,
        });
      }

      const providerColumn = subjectColumn[provider];
      const providerProperty = subjectField[provider];
      const findMatchingUsers = () =>
        db
          .select()
          .from(schema.users)
          .where(
            or(
              eq(providerColumn, identity.subject),
              eq(schema.users.email, email),
            ),
          )
          .limit(2);
      const persistSession = async (user) => {
        if (user.userType === "admin") {
          return res.status(403).json({
            success: false,
            message: "Use administrator credentials to access this account.",
          });
        }
        if (!user.isActive) {
          return res.status(403).json({
            success: false,
            message: "This account is inactive.",
          });
        }
        await establishSession(req, user);
        return res.json({
          success: true,
          user: toSafeUser(user),
          isNewAccount: false,
        });
      };

      const [firstMatch, secondMatch] = await findMatchingUsers();
      if (firstMatch && secondMatch && firstMatch.userId !== secondMatch.userId) {
        throw conflictError(
          "This social account and email are already linked to different accounts. Sign in with your existing account and contact support.",
        );
      }

      if (firstMatch) {
        const currentSubject = firstMatch[providerProperty];
        if (currentSubject && currentSubject !== identity.subject) {
          throw conflictError(
            "This email is already linked to another social account.",
          );
        }
        if (firstMatch.userType === "admin") {
          return res.status(403).json({
            success: false,
            message: "Use administrator credentials to access this account.",
          });
        }
        if (!firstMatch.isActive) {
          return res.status(403).json({
            success: false,
            message: "This account is inactive.",
          });
        }

        const [user] = await db
          .update(schema.users)
          .set({
            [providerProperty]: identity.subject,
            isVerified: true,
            ...(!firstMatch.fullName && identity.fullName
              ? { fullName: identity.fullName.slice(0, 100) }
              : {}),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.users.userId, firstMatch.userId),
              or(
                isNull(providerColumn),
                eq(providerColumn, identity.subject),
              ),
            ),
          )
          .returning();
        if (!user) {
          throw conflictError(
            "This social account was linked elsewhere. Sign in again.",
          );
        }
        return persistSession(user);
      }

      const [createdUser] = await db
        .insert(schema.users)
        .values({
          email,
          fullName: identity.fullName?.trim().slice(0, 100) || null,
          passwordHash: hashpassword(randomBytes(48).toString("base64url")),
          userType: role,
          [providerProperty]: identity.subject,
          isVerified: true,
          isActive: true,
          riderOnboardingCompleted: false,
        })
        .onConflictDoNothing()
        .returning();
      if (createdUser) {
        await establishSession(req, createdUser);
        return res.status(201).json({
          success: true,
          user: toSafeUser(createdUser),
          isNewAccount: true,
        });
      }

      const [concurrentMatch, anotherMatch] = await findMatchingUsers();
      if (
        !concurrentMatch ||
        (anotherMatch && anotherMatch.userId !== concurrentMatch.userId)
      ) {
        throw conflictError(
          "This email or social account is already linked to another account.",
        );
      }
      const currentSubject = concurrentMatch[providerProperty];
      if (currentSubject && currentSubject !== identity.subject) {
        throw conflictError(
          "This email is already linked to another social account.",
        );
      }
      const [user] = await db
        .update(schema.users)
        .set({
          [providerProperty]: identity.subject,
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.users.userId, concurrentMatch.userId),
            or(isNull(providerColumn), eq(providerColumn, identity.subject)),
          ),
        )
        .returning();
      if (!user) {
        throw conflictError(
          "This social account was linked elsewhere. Sign in again.",
        );
      }
      return persistSession(user);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          success: false,
          message: error.message,
        });
      }
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message:
            "This social account or email is already linked to another account.",
        });
      }
      console.error("Social sign-in failed:", error);
      return res.status(500).json({
        success: false,
        message: "Could not complete social sign-in. Please try again.",
      });
    }
  };
