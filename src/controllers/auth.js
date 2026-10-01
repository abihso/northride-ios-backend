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
