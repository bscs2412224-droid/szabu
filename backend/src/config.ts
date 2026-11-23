import crypto from "node:crypto";
import dotenv from "dotenv";

// Every setting is read here, once, in one place. Importing this file first guarantees that
// backend/.env has been loaded before anything else needs a secret.
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (isProduction) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
  }
  // Development only: a random secret per start (logins end when the server restarts) instead of a known one.
  console.warn("⚠  JWT_SECRET is missing or shorter than 32 characters; using a temporary random secret.");
  console.warn("   Set a long random JWT_SECRET in backend/.env (see .env.example).");
  return crypto.randomBytes(48).toString("hex");
}

export const config = {
  isProduction,
  /** Signs login, sign-up and password-reset tokens */
  jwtSecret: resolveJwtSecret(),
  /** A login token is valid for at most this long, whatever the activity (REQ-2.4 also ends it after inactivity) */
  sessionMaxAge: "12h",
  /** REQ-2.4: a session ends after 30 minutes without activity */
  sessionInactivityMs: 30 * 60 * 1000,
  /** Websites allowed to call the API (comma separated). Example: https://szabu.vercel.app */
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Set to 1 when the server sits behind a proxy such as Railway, so rate limits see the real visitor address */
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,
};

const PRIVATE_NETWORK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * May a page from `origin` call this server from a browser?
 *  - requests without an Origin header (the Vite proxy, curl, phones' native code) are always fine
 *  - listed in CLIENT_ORIGIN: fine
 *  - development only: localhost and private network addresses (testing the app from a phone on the same Wi-Fi)
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (config.clientOrigins.includes(origin)) return true;
  return !config.isProduction && PRIVATE_NETWORK.test(origin);
}
