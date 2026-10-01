import { eq } from "drizzle-orm";
import { riders, users, vehicleTypeEnum } from "../db/schema.js";
import { toSafeUser } from "../utils/authUser.js";

const onboardingProfile = (body = {}) => {
  if (!vehicleTypeEnum.enumValues.includes(body.vehicleType)) {
    const error = new Error("Choose a valid vehicle type.");
    error.status = 400;
    throw error;
  }
  const profile = { vehicleType: body.vehicleType };
  for (const [field, maxLength] of [
    ["bankAccountName", 100],
    ["bankAccountNumber", 50],
    ["bankName", 50],
  ]) {
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value || value.length > maxLength) {
      const error = new Error("Complete your payment account details.");
      error.status = 400;
      throw error;
    }
    profile[field] = value;
  }
  return profile;
};

export const createCompleteRiderOnboardingHandler =
  ({ db }) =>
  async (req, res) => {
    if (!req.isAuthenticated?.() || req.user?.userType !== "rider") {
      return res
        .status(403)
        .json({ success: false, message: "A rider account is required." });
    }
    try {
      const profile = onboardingProfile(req.body);
      const user = await db.transaction(async (tx) => {
        // Lock the account so concurrent retries cannot recreate or reset its profile.
        const [account] = await tx
          .select()
          .from(users)
          .where(eq(users.userId, req.user.userId))
          .for("update")
          .limit(1);
        if (
          !account ||
          account.userType !== "rider" ||
          !account.isActive ||
          !account.isVerified
        ) {
          const error = new Error(
            "An active, verified rider account is required.",
          );
          error.status = 403;
          throw error;
        }
        if (account.riderOnboardingCompleted) return account;

        await tx
          .insert(riders)
          .values({
            ...profile,
            userId: account.userId,
            isApproved: false,
            isAvailable: false,
          })
          .onConflictDoUpdate({ target: riders.userId, set: profile });
        const [updatedUser] = await tx
          .update(users)
          .set({
            riderOnboardingCompleted: true,
            updatedAt: new Date(),
          })
          .where(eq(users.userId, account.userId))
          .returning();
        return updatedUser;
      });
      req.user = user;
      return res.json({ success: true, user: toSafeUser(user) });
    } catch (error) {
      return res.status(error.status || 500).json({
        success: false,
        message: error.status
          ? error.message
          : "Unable to save rider onboarding. Please try again.",
      });
    }
  };
