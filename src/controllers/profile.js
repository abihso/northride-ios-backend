import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";
import { toSafeUser } from "../utils/authUser.js";

export const createFullNameHandler =
  ({ db }) =>
  async (req, res) => {
    if (
      !req.isAuthenticated?.() ||
      req.user?.userType !== "rider" ||
      req.user?.isActive !== true ||
      req.user?.isVerified !== true
    ) {
      return res
        .status(403)
        .json({ success: false, message: "An active, verified rider account is required." });
    }

    const fullName =
      typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    if (!fullName || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Enter a full name of no more than 100 characters.",
      });
    }

    try {
      const [user] = await db
        .update(users)
        .set({ fullName, updatedAt: new Date() })
        .where(eq(users.userId, req.user.userId))
        .returning();
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found." });
      }

      req.user = user;
      return res.json({ success: true, user: toSafeUser(user) });
    } catch (error) {
      console.error("Could not save rider full name:", error);
      return res.status(500).json({
        success: false,
        message: "Could not save your name. Please try again.",
      });
    }
  };
