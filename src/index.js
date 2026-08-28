import express from "express";
import http from "http"; // <-- Required to wrap Express in an HTTP server
import { Server } from "socket.io"; // <-- Import Socket.io
import { configDotenv } from "dotenv";
import session from 'express-session';
import cors from "cors";
import axios from "axios";
import crypto from "crypto";
import db from "./db/index.js";
import { users } from "./db/schema.js";
import userRoute from "./routes/usersRoute.js";
import riderRoute from "./routes/ridersRoute.js";
import shoproute from "./routes/shopRoute.js";
import productroute from "./routes/productRoute.js";
import ridesbookroute from "./routes/rideBookingsRoutes.js";
import orderroute from "./routes/orderRoute.js";
import ridersearningsrouter from "./routes/ridersEarningsRoutes.js";
import notificationrouter from "./routes/notificationRoute.js";
import ticketrouter from "./routes/ticketRoute.js";
import pricerouter from "./routes/pricingRoute.js";
import promotionrouter from "./routes/promotionRoute.js";
import sysrouter from "./routes/systemConfigRoute.js";
import authRoute from "./routes/authroute.js";
import passport from "passport";
import PG from "pg";
import connectPgSimple from 'connect-pg-simple';
import deliveryRouter from "./routes/delivery.js";
import configRoute from "./routes/configRoute.js";

configDotenv();

const app = express();
const server = http.createServer(app); 

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.set('io', io);

const PgStore = connectPgSimple(session);

app.set('trust proxy', 1);

app.use(cors({
  origin: true, 
  credentials: true, 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new PgStore({
    conString: process.env.DATABASE_URL, 
    tableName: 'session', 
    schemaName: 'public', 
    createTableIfMissing: true, 
    pruneSessionInterval: false, 
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // true for pro n false for dev
    httpOnly: true,
    sameSite:  'none' , // lax for dev n none for pro 
    maxAge: 30 * 24 * 60 * 60 * 1000 
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  req.db = db;
  next();
});

// =============================================
// SOCKET.IO CONNECTION MANAGEMENT
// =============================================
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // When a rider app connects, it joins a secure room matching its riderId
  socket.on('join_rider_room', (riderId) => {
    socket.join(`rider_${riderId}`);
    console.log(`Rider joined room: rider_${riderId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.get("/abihsolo", (r, res) => {
  return res.sendStatus(200);
});

app.use("/api", userRoute);
app.use("/api", riderRoute);
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

app.get("/", async (req, res) => {
  return res.status(200).json({
    sessionData: req.session
  });     
}); 

const PORT = process.env.PORT || 5000;
// Note: Use `server.listen` instead of `app.listen` so WebSockets share the same port
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} http://localhost:${PORT}`);
});