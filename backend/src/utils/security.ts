import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomInt } from "node:crypto";
import { config } from "../config.js";

/** Short fingerprint of a stored password hash (never contains the hash itself). */
export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

const JWT_SECRET = config.jwtSecret;
const SALT_ROUNDS = 10;

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * REQ-1.5: The system shall require a password of at least 8 characters
 * with upper-case, lower-case, a digit and a special character, entered twice.
 */
export function validatePasswordRules(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter (A-Z).");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter (a-z).");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one digit (0-9).");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must contain at least one special character (e.g. ! @ # $ %).");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * REQ-1.6: The system shall store passwords only as salted hashes.
 */
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

/**
 * Compare against a throwaway hash. Used when the email is unknown so the answer takes as long as a real
 * password check, and the response time does not reveal which emails have accounts.
 */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", SALT_ROUNDS);
export async function burnPasswordCheck(plainText: string): Promise<void> {
  await bcrypt.compare(plainText, DUMMY_HASH);
}

/**
 * REQ-1.3, REQ-3.3: 6-digit verification code generator and hash
 */
export function generateSixDigitCode(): string {
  // Cryptographically secure: always 6 digits, 100000 to 999999
  return randomInt(100000, 1_000_000).toString();
}

export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, SALT_ROUNDS);
}

export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export interface JWTPayload {
  sub: string;
  sid: string; // session_id from the sessions table
  szabistId: string;
  role: string;
  userType: string;
  scope?: string;
}

/**
 * REQ-2.4: Issue JWT with user ID and role, ends after 30 minutes of inactivity
 */
export function signAuthToken(payload: {
  userId: string;
  sessionId: string;
  szabistId: string;
  role: string;
  userType: string;
}): string {
  return jwt.sign(
    {
      sub: payload.userId,
      sid: payload.sessionId,
      szabistId: payload.szabistId,
      role: payload.role,
      userType: payload.userType,
      scope: "SESSION",
    },
    JWT_SECRET,
    // Hard cap on one login. The 30-minute INACTIVITY limit (REQ-2.4) is enforced from the sessions table.
    { expiresIn: config.sessionMaxAge as jwt.SignOptions["expiresIn"] }
  );
}

/**
 * Temporary token after code verification for sign-up completion
 */
export function signSignupToken(szabistId: string): string {
  return jwt.sign(
    {
      szabistId,
      scope: "SIGNUP_VERIFIED",
    },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}

/**
 * REQ-3.4: The system shall log the user in with a session limited to changing the password.
 */
export function signPasswordResetToken(userId: string, szabistId: string, passwordHash: string): string {
  return jwt.sign(
    {
      sub: userId,
      // Tied to the current password: once the password changes this token stops matching,
      // so a reset token can be used only once (the sessions table has no scope column).
      fp: passwordFingerprint(passwordHash),
      szabistId,
      scope: "PASSWORD_RESET_ONLY",
    },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
}

export function verifyJWT<T = Record<string, unknown>>(token: string): T {
  // only the algorithm we sign with is accepted
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as T;
}
