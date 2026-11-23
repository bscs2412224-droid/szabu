import { Router, Request, Response } from "express";
import type { AuthPurpose } from "@prisma/client";
import { prisma } from "../db.js";
import {
  validatePasswordRules,
  hashPassword,
  verifyPassword,
  burnPasswordCheck,
  generateSixDigitCode,
  hashCode,
  verifyCode,
  maskEmail,
  signAuthToken,
  signSignupToken,
  signPasswordResetToken,
  passwordFingerprint,
  verifyJWT,
} from "../utils/security.js";
import {
  userTypeOf,
  isPlaced,
  toApiUser,
  findUserByEmail,
  normalizeEmail,
  writeAudit,
} from "../utils/userHelpers.js";
import { emailService } from "../services/emailService.js";
import { disconnectUser } from "../realtime.js";
import { requireAuth, requireAdmin, AuthenticatedRequest } from "../middleware/authMiddleware.js";

const router = Router();

const CODE_LIFETIME_MS = 10 * 60 * 1000; // REQ: codes expire after 10 minutes

// ==========================================
// Helpers for the auth_codes table
// ==========================================
// ERD auth_codes: code_id, user_id, purpose (SIGNUP | RESET), code_hash, attempts,
// expires_at, used_at. A code that is accepted OR cancelled gets used_at set.
// There is no "sent at" column, so the send time is expires_at minus the 10 minute lifetime.

/** One resend every 60 seconds. Returns seconds left to wait (0 = allowed). */
async function cooldownRemaining(userId: string, purpose: AuthPurpose): Promise<number> {
  const active = await prisma.authCode.findFirst({
    where: { user_id: userId, purpose, used_at: null, expires_at: { gt: new Date() } },
    orderBy: { expires_at: "desc" },
  });
  if (!active) return 0;
  const sentAt = active.expires_at.getTime() - CODE_LIFETIME_MS;
  const diffSeconds = (Date.now() - sentAt) / 1000;
  return diffSeconds < 60 ? Math.ceil(60 - diffSeconds) : 0;
}

/** Cancel older pending codes, then store a new code (hash only, 10 minute expiry). */
async function issueCode(userId: string, purpose: AuthPurpose): Promise<string> {
  const now = new Date();
  await prisma.authCode.updateMany({
    where: { user_id: userId, purpose, used_at: null },
    data: { used_at: now },
  });

  const rawCode = generateSixDigitCode();
  await prisma.authCode.create({
    data: {
      user_id: userId,
      purpose,
      code_hash: await hashCode(rawCode),
      attempts: 0,
      expires_at: new Date(now.getTime() + CODE_LIFETIME_MS),
    },
  });
  return rawCode;
}

/**
 * Check a submitted 6-digit code. Sends the error response itself and returns false on failure.
 * Accepted once, expires after 10 minutes, at most 5 wrong attempts.
 */
async function checkAndConsumeCode(
  userId: string | undefined,
  purpose: AuthPurpose,
  code: string,
  res: Response
): Promise<boolean> {
  const record = userId
    ? await prisma.authCode.findFirst({
        where: { user_id: userId, purpose, used_at: null },
        orderBy: { expires_at: "desc" },
      })
    : null;

  if (!record || record.expires_at < new Date()) {
    res.status(400).json({ message: "Invalid or expired code" });
    return false;
  }

  const isMatch = await verifyCode(code, record.code_hash);

  if (!isMatch) {
    const newAttempts = record.attempts + 1;

    if (newAttempts >= 5) {
      // After 5 wrong attempts the code is cancelled
      await prisma.authCode.update({
        where: { code_id: record.code_id },
        data: { attempts: newAttempts, used_at: new Date() },
      });
      res.status(400).json({
        message: "Code cancelled after 5 wrong attempts. Please request a new code.",
        cancelled: true,
      });
      return false;
    }

    await prisma.authCode.update({
      where: { code_id: record.code_id },
      data: { attempts: newAttempts },
    });
    res.status(400).json({
      message: "Invalid or expired code",
      remainingAttempts: 5 - newAttempts,
    });
    return false;
  }

  // Valid: accept it once
  await prisma.authCode.update({
    where: { code_id: record.code_id },
    data: { used_at: new Date() },
  });
  return true;
}

// ==========================================
// 4.1 SIGN UP (UC-01)
// ==========================================
// A pre-registered person (added by the administrator) is a users row with status PENDING
// and no password_hash. Signing up sets the password and activates the account.
// Everything is identified by the SZABIST email.

const SZABIST_EMAIL_PATTERN = /^[a-z0-9._+-]+@szabist\.(pk|edu\.pk)$/;

/**
 * Creates the record for a SZABIST address the administrator has not added.
 * Role comes from the domain (szabist.pk = student, szabist.edu.pk = faculty). The person is not
 * in the hierarchy yet, so the status is AWAITING_ASSIGNMENT: login works, messaging is blocked.
 */
async function createSelfRegisteredUser(email: string) {
  const local = email.split("@")[0];
  const isStudent = email.endsWith("@szabist.pk");
  const digits = local.match(/\d{6,}/)?.[0];

  let szabistId = isStudent && digits ? digits : local;
  if (await prisma.user.findUnique({ where: { szabist_id: szabistId } })) szabistId = local;

  const name = isStudent
    ? `Student ${digits ?? local}`
    : local.split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

  return prisma.user.create({
    data: {
      szabist_id: szabistId,
      email,
      name,
      role: isStudent ? "STUDENT" : "FACULTY",
      status: "AWAITING_ASSIGNMENT",
    },
  });
}

/** Step 1: User enters the SZABIST email; a 6-digit code is emailed. */
router.post("/signup/request-code", async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      res.status(400).json({ message: "SZABIST email is required." });
      return;
    }

    // Only SZABIST addresses may sign up
    if (!SZABIST_EMAIL_PATTERN.test(email)) {
      res.status(400).json({ message: "Please use your SZABIST email (ending in szabist.pk or szabist.edu.pk)." });
      return;
    }

    // Known person (added by the administrator) or a new SZABIST address.
    // A new address gets a record with no password; it can only become an account by entering
    // the code that is emailed to that address, within 10 minutes.
    let user = await findUserByEmail(email);

    if (!user) {
      user = await createSelfRegisteredUser(email);
    }

    // ...and must not have an account yet
    if (user.password_hash) {
      res.status(409).json({ message: "Account already exists. Please log in." });
      return;
    }

    // One resend every 60 seconds
    const remaining = await cooldownRemaining(user.user_id, "SIGNUP");
    if (remaining > 0) {
      res.status(429).json({
        message: `Please wait ${remaining} seconds before requesting a new code.`,
        retryAfter: remaining,
      });
      return;
    }

    const rawCode = await issueCode(user.user_id, "SIGNUP");
    await emailService.sendVerificationCode(user.email, rawCode, "SIGNUP");

    res.status(200).json({
      message: "Verification code sent to your registered email.",
      emailMasked: maskEmail(user.email),
      expiresInMinutes: 10,
    });
  } catch (error) {
    console.error("Signup request-code error:", error);
    res.status(500).json({ message: "Service temporarily unavailable. Please try again later." });
  }
});

/** Step 2: User enters the 6-digit verification code. */
router.post("/signup/verify-code", async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code ?? "").trim();

    if (!email || !code) {
      res.status(400).json({ message: "SZABIST email and verification code are required." });
      return;
    }

    const user = await findUserByEmail(email);

    const ok = await checkAndConsumeCode(user?.user_id, "SIGNUP", code, res);
    if (!ok || !user) return;

    res.status(200).json({
      message: "Code verified successfully.",
      signupToken: signSignupToken(user.szabist_id),
    });
  } catch (error) {
    console.error("Signup verify-code error:", error);
    res.status(500).json({ message: "Service temporarily unavailable. Please try again later." });
  }
});

/** Step 3: User enters password twice and taps "Create Account". */
router.post("/signup/complete", async (req: Request, res: Response): Promise<void> => {
  try {
    const { signupToken, password, confirmPassword } = req.body;

    if (!signupToken || !password || !confirmPassword) {
      res.status(400).json({ message: "Verification token and both password fields are required." });
      return;
    }

    let decoded: { szabistId: string; scope: string };
    try {
      decoded = verifyJWT<{ szabistId: string; scope: string }>(signupToken);
      if (decoded.scope !== "SIGNUP_VERIFIED") {
        throw new Error("Invalid token scope");
      }
    } catch {
      res.status(401).json({ message: "Session expired or invalid. Please verify code again." });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ message: "Passwords do not match." });
      return;
    }

    const ruleCheck = validatePasswordRules(password);
    if (!ruleCheck.isValid) {
      res.status(400).json({
        message: "Password does not meet required security criteria.",
        rules: ruleCheck.errors,
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { szabist_id: decoded.szabistId } });

    if (!user) {
      res.status(404).json({ message: "This email is not in SZABIST records." });
      return;
    }

    if (user.password_hash) {
      res.status(409).json({ message: "Account already exists. Please log in." });
      return;
    }

    // Activate the record with a salted password hash. The role comes from the record; no phone number.
    // A person already marked AWAITING_ASSIGNMENT keeps that status (can log in, messaging blocked).
    const activated = await prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        password_hash: await hashPassword(password),
        status: user.status === "PENDING" ? "ACTIVE" : user.status,
      },
    });

    await writeAudit(req, {
      action: "SIGNUP",
      actorId: activated.user_id,
      szabistId: activated.szabist_id,
      message: `Account activated for ${activated.name} with role ${activated.role}`,
    });

    res.status(201).json({ message: "Account created successfully. Please log in." });
  } catch (error) {
    console.error("Signup complete error:", error);
    res.status(500).json({ message: "Service temporarily unavailable. Please try again later." });
  }
});

// ==========================================
// 4.2 LOGIN (UC-02)
// ==========================================

const LOGIN_FAILED_MESSAGE = "Incorrect email or password";

// A failed login always takes at least this long, so response time cannot reveal whether an email has an account
const MIN_FAILED_LOGIN_MS = 350;

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const startedAt = Date.now();
  const padFailure = async () => {
    const wait = MIN_FAILED_LOGIN_MS - (Date.now() - startedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };

  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      res.status(400).json({ message: "SZABIST email and password are required." });
      return;
    }

    const user = await findUserByEmail(email);

    // Unknown email, or a record that has not signed up yet: same generic message, same response time
    if (!user || !user.password_hash) {
      await burnPasswordCheck(String(password));
      await writeAudit(req, {
        action: "LOGIN_FAILED",
        actorId: user?.user_id,
        szabistId: user?.szabist_id ?? null,
        message: user ? "Login attempt before sign-up" : `Unknown email login attempt: ${email}`,
      });
      await padFailure();
      res.status(401).json({ message: LOGIN_FAILED_MESSAGE });
      return;
    }

    // Locked?
    const now = new Date();
    if (user.locked_until && user.locked_until > now) {
      const remainingMinutes = Math.ceil((user.locked_until.getTime() - now.getTime()) / (60 * 1000));

      await writeAudit(req, {
        action: "LOGIN_LOCKED",
        actorId: user.user_id,
        szabistId: user.szabist_id,
        message: `Attempt while locked. Remaining: ${remainingMinutes}m`,
      });

      res.status(403).json({
        message: `Account is temporarily locked due to 5 failed attempts. Please try again in ${remainingMinutes} minute(s).`,
        locked: true,
        remainingMinutes,
      });
      return;
    }

    // Suspended?
    if (user.status === "SUSPENDED") {
      await writeAudit(req, {
        action: "LOGIN_SUSPENDED",
        actorId: user.user_id,
        szabistId: user.szabist_id,
        message: "Login denied to suspended account",
      });
      res.status(403).json({ message: "Account suspended" });
      return;
    }

    // Compare password with the stored salted hash
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      const newFailed = user.failed_attempts + 1;

      if (newFailed >= 5) {
        // Lock for 15 minutes after 5 failed attempts
        await prisma.user.update({
          where: { user_id: user.user_id },
          data: { failed_attempts: 0, locked_until: new Date(now.getTime() + 15 * 60 * 1000) },
        });

        await writeAudit(req, {
          action: "ACCOUNT_LOCKED",
          actorId: user.user_id,
          szabistId: user.szabist_id,
          message: "Account locked for 15 minutes after 5 failed login attempts",
        });

        res.status(403).json({
          message: `${LOGIN_FAILED_MESSAGE}. Account is now locked for 15 minutes.`,
          locked: true,
        });
        return;
      }

      await prisma.user.update({
        where: { user_id: user.user_id },
        data: { failed_attempts: newFailed },
      });

      await writeAudit(req, {
        action: "LOGIN_FAILED",
        actorId: user.user_id,
        szabistId: user.szabist_id,
        message: `Failed attempt ${newFailed}/5`,
      });

      await padFailure();
      res.status(401).json({
        message: LOGIN_FAILED_MESSAGE,
        remainingAttempts: 5 - newFailed,
      });
      return;
    }

    // Valid: reset failed attempts and lock
    await prisma.user.update({
      where: { user_id: user.user_id },
      data: { failed_attempts: 0, locked_until: null },
    });

    await writeAudit(req, {
      action: "LOGIN_SUCCESS",
      actorId: user.user_id,
      szabistId: user.szabist_id,
      message: `Successful login with role ${user.role}`,
    });

    // Create a session row and issue a JWT for it
    const session = await prisma.session.create({ data: { user_id: user.user_id } });

    const token = signAuthToken({
      userId: user.user_id,
      sessionId: session.session_id,
      szabistId: user.szabist_id,
      role: user.role,
      userType: userTypeOf(user.role),
    });

    // Users awaiting assignment can log in; the frontend blocks messaging (messagingBlocked)
    res.status(200).json({
      message: "Login successful.",
      token,
      user: toApiUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Unable to log in right now. Please try again later." });
  }
});

/** Logout: ends the session, clears cached data on the device, and is audited. */
router.post("/logout", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user) {
      // End all of this user's active sessions
      await prisma.session.updateMany({
        where: { user_id: req.user.id, revoked_at: null },
        data: { revoked_at: new Date() },
      });

      disconnectUser(req.user.id); // close live connections of this user

      await writeAudit(req, {
        action: "LOGOUT",
        actorId: req.user.id,
        szabistId: req.user.szabistId,
        message: `User ${req.user.szabistId} logged out`,
      });
    }

    res.status(200).json({ message: "Logged out successfully. Device cached data cleared." });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Unable to complete logout." });
  }
});

// ==========================================
// 4.3 RESET FORGOTTEN PASSWORD (UC-03)
// ==========================================

/** Step 1: User enters the SZABIST email. The same message is shown for known and unknown emails. */
router.post("/forgot-password/request-code", async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      res.status(400).json({ message: "SZABIST email is required." });
      return;
    }

    const genericResponse = { message: "If the ID is registered, a code has been sent." };

    const user = await findUserByEmail(email);

    // Unknown email, not signed up yet, or suspended: identical generic message
    if (!user || !user.password_hash || user.status === "SUSPENDED") {
      res.status(200).json(genericResponse);
      return;
    }

    const remaining = await cooldownRemaining(user.user_id, "RESET");
    if (remaining > 0) {
      res.status(429).json({
        message: `Please wait ${remaining} seconds before requesting a new reset code.`,
        retryAfter: remaining,
      });
      return;
    }

    const rawCode = await issueCode(user.user_id, "RESET");
    await emailService.sendVerificationCode(user.email, rawCode, "PASSWORD_RESET");

    await writeAudit(req, {
      action: "PASSWORD_RESET_REQUEST",
      actorId: user.user_id,
      szabistId: user.szabist_id,
      message: "Password reset code dispatched",
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error("Forgot password request-code error:", error);
    res.status(500).json({ message: "Unable to continue. Please try again later." });
  }
});

/** Step 2: User enters the 6-digit code and gets a token limited to changing the password. */
router.post("/forgot-password/verify-code", async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code ?? "").trim();

    if (!email || !code) {
      res.status(400).json({ message: "SZABIST email and verification code are required." });
      return;
    }

    const user = await findUserByEmail(email);

    const ok = await checkAndConsumeCode(user?.user_id, "RESET", code, res);
    if (!ok || !user || !user.password_hash) return;

    res.status(200).json({
      message: "Code verified. Please set your new password.",
      resetToken: signPasswordResetToken(user.user_id, user.szabist_id, user.password_hash),
    });
  } catch (error) {
    console.error("Forgot password verify-code error:", error);
    res.status(500).json({ message: "Unable to continue. Please try again later." });
  }
});

/** Step 3: User enters the new password twice. Ends all older sessions and emails a notice. */
router.post("/forgot-password/reset", async (req: Request, res: Response): Promise<void> => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      res.status(400).json({ message: "Reset token and both password fields are required." });
      return;
    }

    let decoded: { sub: string; fp: string; scope: string };
    try {
      decoded = verifyJWT<{ sub: string; fp: string; scope: string }>(resetToken);
      if (decoded.scope !== "PASSWORD_RESET_ONLY") {
        throw new Error("Invalid reset session scope");
      }
    } catch {
      res.status(401).json({ message: "Reset session expired or invalid. Please request a new code." });
      return;
    }

    const user = await prisma.user.findUnique({ where: { user_id: decoded.sub } });

    // The token only works while the password it was issued for is still the current one
    if (!user || !user.password_hash || passwordFingerprint(user.password_hash) !== decoded.fp) {
      res.status(401).json({ message: "Reset session expired or invalid. Please request a new code." });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ message: "Passwords do not match." });
      return;
    }

    const ruleCheck = validatePasswordRules(newPassword);
    if (!ruleCheck.isValid) {
      res.status(400).json({
        message: "Password does not meet required security criteria.",
        rules: ruleCheck.errors,
      });
      return;
    }

    // The new password must be different from the one the user already has
    if (await verifyPassword(newPassword, user.password_hash)) {
      res.status(400).json({
        message: "New password must be different from your current password.",
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { user_id: user.user_id },
      data: {
        password_hash: await hashPassword(newPassword),
        failed_attempts: 0,
        locked_until: null,
      },
    });

    // End ALL older sessions and cancel leftover codes
    await prisma.session.updateMany({
      where: { user_id: user.user_id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    await prisma.authCode.updateMany({
      where: { user_id: user.user_id, used_at: null },
      data: { used_at: new Date() },
    });

    disconnectUser(user.user_id); // older sessions ended, so their live connections end too

    await emailService.sendPasswordChangedNotice(user.email, user.szabist_id);

    await writeAudit(req, {
      action: "PASSWORD_RESET_SUCCESS",
      actorId: user.user_id,
      szabistId: user.szabist_id,
      message: "Password reset completed. Older sessions terminated.",
    });

    // The password is changed and the user is logged in (new session)
    const newSession = await prisma.session.create({ data: { user_id: user.user_id } });

    res.status(200).json({
      message: "Password changed successfully. You are now logged in.",
      token: signAuthToken({
        userId: updatedUser.user_id,
        sessionId: newSession.session_id,
        szabistId: updatedUser.szabist_id,
        role: updatedUser.role,
        userType: userTypeOf(updatedUser.role),
      }),
      user: toApiUser(updatedUser),
    });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    res.status(500).json({ message: "Unable to continue. Please try again later." });
  }
});

// ==========================================
// SESSION CHECK, AUDIT LOGS & RECORDS (administrator only)
// ==========================================

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(200).json({ user: req.user });
});

router.get("/audit-logs", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 25,
      orderBy: { created_at: "desc" },
      include: { actor: { select: { szabist_id: true } } },
    });

    // Flatten the ERD row into the shape the frontend expects
    res.status(200).json({
      logs: logs.map((l) => {
        const d = (l.details ?? {}) as {
          szabistId?: string | null;
          ip?: string | null;
          userAgent?: string | null;
          message?: string | null;
        };
        return {
          id: l.log_id,
          szabistId: l.actor?.szabist_id ?? d.szabistId ?? null,
          action: l.action,
          ipAddress: d.ip ?? undefined,
          userAgent: d.userAgent ?? undefined,
          details: d.message ?? undefined,
          createdAt: l.created_at.toISOString(),
        };
      }),
    });
  } catch (error) {
    console.error("Audit log fetch error:", error);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

router.get("/hierarchy-records", requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      include: { program: true, deanDepartments: true },
      orderBy: { szabist_id: "asc" },
    });

    res.status(200).json({
      records: users.map((u) => ({
        id: u.user_id,
        szabistId: u.szabist_id,
        email: u.email,
        fullName: u.name,
        userType: userTypeOf(u.role),
        role: u.role,
        department: u.program?.name ?? u.deanDepartments[0]?.name ?? "-",
        isPlacedInHierarchy: isPlaced(u),
        // `user` is only set once the person has actually signed up (has a password)
        user: u.password_hash
          ? {
              id: u.user_id,
              status: u.status,
              failedAttempts: u.failed_attempts,
              lockedUntil: u.locked_until,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Hierarchy records error:", error);
    res.status(500).json({ message: "Failed to fetch hierarchy records" });
  }
});

export default router;
