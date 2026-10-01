import { Router } from "express";
import "../strategies/index.js";
import passport from "passport";
import { validateLogin } from "../validation/index.js";
import {
  createLoginHandler,
  getCurrentUser,
  logoutUser,
} from "../controllers/auth.js";

const authRoute = Router();
authRoute.post("/login", validateLogin, createLoginHandler(passport));
authRoute.get("/auth/me", getCurrentUser);
authRoute.post("/auth/logout", logoutUser);

export default authRoute;
