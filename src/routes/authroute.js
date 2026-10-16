import { Router } from "express";
import "../strategies/index.js";
import passport from "passport";
import { validateLogin } from "../validation/index.js";
import {
  createDeleteAccountHandler,
  createLoginHandler,
  getCurrentUser,
  logoutUser,
} from "../controllers/auth.js";
import { createSocialAuthHandler } from "../controllers/socialAuth.js";
import db from "../db/index.js";
import hashpassword from "../utils/hashpassword.js";

const authRoute = Router();
authRoute.post("/login", validateLogin, createLoginHandler(passport));
authRoute.post(
  "/auth/social",
  createSocialAuthHandler({ db, hashpassword }),
);
authRoute.get("/auth/me", getCurrentUser);
authRoute.post("/auth/logout", logoutUser);
authRoute.post(
  "/auth/delete-account",
  createDeleteAccountHandler({ db }),
);

export default authRoute;
