import { users } from "../db/schema.js";

const allowedRoles = ["customer", "rider", "admin"];

export const createAdminManagedUserHandler =
  ({ db, hashpassword }) =>
  async (req, res) => {
    if (
      req.user?.userType !== "admin" ||
      req.user?.isActive !== true ||
      req.user?.isVerified !== true
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Administrator access required." });
    }

    const { fullName, email, phoneNumber, password, userType } = req.body || {};
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedName = typeof fullName === "string" ? fullName.trim() : "";
    const normalizedPhone =
      typeof phoneNumber === "string" ? phoneNumber.trim() : "";
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedName.length < 1 ||
      normalizedName.length > 100 ||
      normalizedPhone.length > 20 ||
      typeof password !== "string" ||
      password.length < 8 ||
      !allowedRoles.includes(userType)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid name, email, phone number, role, and password of at least 8 characters.",
      });
    }

    try {
      const [created] = await db
        .insert(users)
        .values({
          fullName: normalizedName,
          email: normalizedEmail,
          phoneNumber: normalizedPhone || null,
          passwordHash: hashpassword(password),
          userType,
          isVerified: true,
          isActive: true,
          riderOnboardingCompleted: false,
        })
        .returning();
      const { passwordHash, ...safeUser } = created;
      return res.status(201).json({ success: true, data: safeUser });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }
      console.error("Could not create admin-managed account:", error);
      return res.status(500).json({
        success: false,
        message: "Could not create the account.",
      });
    }
  };
