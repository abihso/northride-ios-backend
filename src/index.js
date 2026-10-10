import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import crypto from "crypto";
import { configDotenv } from "dotenv";
import { eq } from "drizzle-orm";
import express from "express";
import session from "express-session";
import http from "http"; // <-- Required to wrap Express in an HTTP server
import passport from "passport";
import { Server } from "socket.io"; // <-- Import Socket.io
import db from "./db/index.js";
import { riders } from "./db/schema.js";
import authRoute from "./routes/authroute.js";
import configRoute from "./routes/configRoute.js";
import deliveryRouter from "./routes/delivery.js";
import mapsRoute from "./routes/mapsRoute.js";
import notificationrouter from "./routes/notificationRoute.js";
import orderroute from "./routes/orderRoute.js";
import pricerouter from "./routes/pricingRoute.js";
import productroute from "./routes/productRoute.js";
import promotionrouter from "./routes/promotionRoute.js";
import ridesbookroute from "./routes/rideBookingsRoutes.js";
import ridersearningsrouter from "./routes/ridersEarningsRoutes.js";
import riderRoute from "./routes/ridersRoute.js";
import riderSettingsRoute from "./routes/riderSettingsRoute.js";
import shoproute from "./routes/shopRoute.js";
import sysrouter from "./routes/systemConfigRoute.js";
import ticketrouter from "./routes/ticketRoute.js";
import userRoute from "./routes/usersRoute.js";

configDotenv();

const app = express();
const server = http.createServer(app);
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = new Set(
  (
    process.env.CLIENT_ORIGINS ||
    (isProduction
      ? ""
      : "http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://localhost:5173,http://127.0.0.1:5173")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin is not allowed by CORS."));
  },
  credentials: true,
};

const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);

const PgStore = connectPgSimple(session);

app.set("trust proxy", 1);

app.use(cors(corsOptions));

app.use(
  express.json({
    verify(req, res, buffer) {
      req.rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  store: new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    schemaName: "public",
    createTableIfMissing: true,
    pruneSessionInterval: false,
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());
io.engine.use(passport.initialize());
io.engine.use(passport.session());

app.use((req, res, next) => {
  req.db = db;
  next();
});

// =============================================
// SOCKET.IO CONNECTION MANAGEMENT
// =============================================
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join_rider_room", async (requestedRiderId) => {
    const user = socket.request.user;
    if (!user || user.userType !== "rider") {
      return socket.emit("auth_error", {
        message: "Rider authentication required.",
      });
    }

    const [rider] = await db
      .select({ riderId: riders.riderId })
      .from(riders)
      .where(eq(riders.userId, user.userId))
      .limit(1);

    if (!rider || rider.riderId !== Number(requestedRiderId)) {
      return socket.emit("auth_error", {
        message: "You cannot join this rider room.",
      });
    }

    socket.join(`rider_${rider.riderId}`);
    console.log(`Rider joined room: rider_${rider.riderId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get("/abihsolo", (r, res) => {
  return res.sendStatus(200);
});

const publicApiRoutes = new Set([
  "POST /login",
  "POST /users",
  "POST /verify-email",
  "POST /resend-verification",
  "POST /payments/webhook",
  "GET /payments/callback",
]);

app.use("/api", (req, res, next) => {
  const path = req.originalUrl.split("?")[0].replace(/^\/api/, "");
  if (publicApiRoutes.has(`${req.method} ${path}`)) {
    return next();
  }
  if (!req.isAuthenticated?.()) {
    return res
      .status(401)
      .json({ success: false, message: "Authentication required" });
  }
  const isAdminMutation =
    (req.method === "POST" &&
      ["/shops", "/products", "/ride-pricing", "/notifications"].includes(
        path,
      )) ||
    (req.method === "PATCH" &&
      (/^\/products\/\d+\/stock$/.test(path) ||
        /^\/support-tickets\/\d+$/.test(path) ||
        /^\/rider-earnings\/\d+\/pay$/.test(path))) ||
    (req.method === "PUT" && /^\/system-config\/[^/]+$/.test(path));
  if (
    (isAdminMutation || (req.method === "GET" && path === "/system-config")) &&
    req.user?.userType !== "admin"
  ) {
    return res
      .status(403)
      .json({ success: false, message: "Administrator access required." });
  }
  return next();
});

app.use("/api", userRoute);
app.use("/api", riderRoute);
app.use("/api", riderSettingsRoute);
app.use("/api", shoproute);
app.use("/api", authRoute);
app.use("/api", productroute);
app.use("/api", ridesbookroute);
app.use("/api", orderroute);
app.use("/api", ridersearningsrouter);
app.use("/api", notificationrouter);
app.use("/api", ticketrouter);
app.use("/api", pricerouter);
app.use("/api", promotionrouter);
app.use("/api", sysrouter);
app.use("/api", deliveryRouter);
app.use("/api", configRoute);
app.use("/api", mapsRoute);

app.get("/", async (req, res) => {
  return res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 5000;
// Note: Use `server.listen` instead of `app.listen` so WebSockets share the same port
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} http://localhost:${PORT}`);
});
