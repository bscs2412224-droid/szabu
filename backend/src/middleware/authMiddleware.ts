import { Request, Response, NextFunction } from "express";
import { verifyJWT, JWTPayload } from "../utils/security.js";
import { userTypeOf, isPlaced } from "../utils/userHelpers.js";
import { prisma } from "../db.js";
import { config } from "../config.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    sessionId: string;
    szabistId: string;
    role: string;
    userType: string;
    email: string;
    fullName: string;
    isPlacedInHierarchy: boolean;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No active session found. Please log in." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyJWT<JWTPayload>(token);

    if (decoded.scope !== "SESSION") {
      res.status(403).json({ message: "Invalid session scope. Standard session required." });
      return;
    }

    // The session row decides whether this token is still valid (logout / password change revoke it)
    const session = await prisma.session.findUnique({
      where: { session_id: decoded.sid },
      include: { user: true },
    });

    if (!session || session.user_id !== decoded.sub) {
      res.status(401).json({ message: "Invalid session token. Please log in again." });
      return;
    }

    if (session.revoked_at) {
      // REQ-3.5: older sessions end after a password change or logout
      // ended by logout, a password change, or the 30-minute inactivity limit
      res.status(401).json({ message: "Your session has ended. Please log in again.", code: "SESSION_ENDED" });
      return;
    }

    // REQ-2.4: the session ends after 30 minutes without activity. Every request counts as activity
    // (the app also sends a small request while the user is touching the screen).
    if (Date.now() - session.last_active_at.getTime() > config.sessionInactivityMs) {
      await prisma.session.update({ where: { session_id: session.session_id }, data: { revoked_at: new Date() } });
      res.status(401).json({ message: "Session expired due to inactivity. Please log in again.", code: "SESSION_EXPIRED" });
      return;
    }

    const user = session.user;

    if (user.status === "SUSPENDED") {
      res.status(403).json({ message: "Account suspended" });
      return;
    }

    if (!user.password_hash) {
      res.status(401).json({ message: "No account found. Please sign up." });
      return;
    }

    await prisma.session.update({
      where: { session_id: session.session_id },
      data: { last_active_at: new Date() },
    });

    req.user = {
      id: user.user_id,
      sessionId: session.session_id,
      szabistId: user.szabist_id,
      role: user.role,
      userType: userTypeOf(user.role),
      email: user.email,
      fullName: user.name,
      isPlacedInHierarchy: isPlaced(user),
    };

    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "TokenExpiredError") {
      res.status(401).json({ message: "Session expired due to inactivity. Please log in again." });
      return;
    }
    res.status(401).json({ message: "Invalid session token. Please log in again." });
  }
}

/**
 * REQ-2.5: Block messaging for users not yet placed in the hierarchy
 */
export function checkHierarchyPlacement(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.isPlacedInHierarchy) {
    res.status(403).json({
      message: "Account awaiting assignment. Messaging and administrative features are blocked until placement.",
      blocked: true,
    });
    return;
  }
  next();
}

/** Only administrators may pass. Use after requireAuth. */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ message: "Administrator access only." });
    return;
  }
  next();
}

/**
 * Messaging and message notifications: a signed-in user who is placed in the hierarchy.
 * The administrator does not use messaging (SRS UC-10: all users except the administrator).
 */
export const messagingGuard = [
  requireAuth,
  checkHierarchyPlacement,
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role === "ADMIN") {
      res.status(403).json({ message: "The administrator account does not use messaging." });
      return;
    }
    next();
  },
];
