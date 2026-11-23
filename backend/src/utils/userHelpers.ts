import type { Request } from "express";
import type { Role, User } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * The ERD has a single `role` enum (STUDENT, FACULTY, PM, HOD, DEAN, ADMIN).
 * The frontend still expects a simple Student / Faculty "userType", so derive it.
 */
export function userTypeOf(role: Role): "STUDENT" | "FACULTY" {
  return role === "STUDENT" ? "STUDENT" : "FACULTY";
}

/** REQ-2.5: users with status AWAITING_ASSIGNMENT are not placed in the hierarchy yet. */
export function isPlaced(user: Pick<User, "status">): boolean {
  return user.status !== "AWAITING_ASSIGNMENT";
}

/** Shape the frontend expects for a logged-in user. */
export function toApiUser(user: User) {
  const placed = isPlaced(user);
  return {
    id: user.user_id,
    szabistId: user.szabist_id,
    email: user.email,
    fullName: user.name,
    role: user.role,
    userType: userTypeOf(user.role),
    isPlacedInHierarchy: placed,
    messagingBlocked: !placed, // REQ-2.5
  };
}

/** Emails are compared in lower case with surrounding spaces removed. */
export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Find a user by SZABIST email address (the only way users identify themselves). */
export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
}

interface AuditInput {
  action: string;
  actorId?: string | null;
  szabistId?: string | null;
  message?: string;
}

/**
 * REQ-2.7: write an entry to the audit_logs table.
 * The ERD table has no ip/user-agent columns, so those go into the `details` JSON.
 */
export async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor_id: input.actorId ?? null,
      action: input.action,
      target_type: "USER",
      target_id: input.actorId ?? null,
      details: {
        szabistId: input.szabistId ?? null,
        ip: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
        message: input.message ?? null,
      },
    },
  });
}
