import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config, isAllowedOrigin } from "./config.js"; // loads backend/.env, must stay the first local import
import authRoutes from "./routes/authRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import pushRoutes from "./routes/pushRoutes.js";
import { initRealtime } from "./realtime.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a proxy (Railway, Vercel rewrites) the visitor address comes from the proxy header
if (config.trustProxy) app.set("trust proxy", config.trustProxy);

// Standard security headers
app.use(helmet());

// Only the app's own website may call the API from a browser (CLIENT_ORIGIN; localhost and local network in development)
app.use(
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "20kb" }));

// Request logger for auditability
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ---- Rate limits on the endpoints anyone can call (per visitor address) ----
// Production numbers apply when NODE_ENV=production (or RATE_LIMIT_STRICT=1). While developing they are 100 times
// looser so repeated testing is not blocked. Account lockout after 5 wrong passwords still applies to every account.
const strict = config.isProduction || process.env.RATE_LIMIT_STRICT === "1";
const limit = (max: number, minutes: number) =>
  rateLimit({
    windowMs: minutes * 60_000,
    limit: strict ? max : max * 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Too many attempts. Please wait a few minutes and try again." },
  });

app.use("/api/auth/login", limit(20, 10));
app.use("/api/auth/signup/request-code", limit(8, 10));
app.use("/api/auth/forgot-password/request-code", limit(8, 10));
app.use("/api/auth/signup/verify-code", limit(30, 10));
app.use("/api/auth/forgot-password/verify-code", limit(30, 10));
app.use("/api/auth/signup/complete", limit(20, 10));
app.use("/api/auth/forgot-password/reset", limit(20, 10));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/push", pushRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "SzabU API",
    time: new Date().toISOString(),
  });
});

const server = http.createServer(app);
initRealtime(server);

server.listen(PORT, () => {
  console.log(`🚀 SzabU backend running on http://localhost:${PORT}${config.isProduction ? " (production mode)" : ""}`);
  console.log(`📡 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`💬 Messages API: http://localhost:${PORT}/api/messages`);
  console.log(`🔔 Push API: http://localhost:${PORT}/api/push`);
  console.log(`⚡ Real-time (Socket.IO): ws://localhost:${PORT}/socket.io`);
});
