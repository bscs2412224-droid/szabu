import type { Role, UserStatus } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Messaging permissions. Enforced on the server for every message.
 *
 * Everyone in the SzabU directory can message everyone else in it: the Dean, Heads of Department, Program Managers,
 * faculty and students. Leadership and Program Managers are faculty members too, so they are not kept apart.
 * (This replaces the strict hierarchy of SRS Table 1.)
 *
 * What still blocks a message:
 *   - the administrator does not use messaging (neither sends nor receives)
 *   - people not yet placed in the hierarchy cannot message (REQ-2.5), checked in the route guard
 *   - suspended people cannot receive messages
 *   - nobody can message themselves
 */

export interface Contact {
  id: string;
  name: string;
  role: Role;
  /** Program the person belongs to (shown as the department line). Never a phone number or email. */
  group: string;
}

// Pre-registered people (PENDING) can receive messages: they see them when they sign up.
// Suspended people and people not yet placed in the hierarchy cannot.
const MESSAGEABLE: UserStatus[] = ["ACTIVE", "PENDING"];

/** The people this user may START a conversation with (REQ-5.1, REQ-7.2): everyone else in the directory. */
export async function allowedContacts(userId: string): Promise<Contact[]> {
  const people = await prisma.user.findMany({
    where: { user_id: { not: userId }, status: { in: MESSAGEABLE }, role: { not: "ADMIN" } },
    select: { user_id: true, name: true, role: true, program: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  return people.map((p) => ({ id: p.user_id, name: p.name, role: p.role, group: p.program?.name ?? "" }));
}

/** May `senderId` START a conversation with `recipientId`? */
export async function canStartConversation(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return false;
  const person = await prisma.user.findUnique({
    where: { user_id: recipientId },
    select: { role: true, status: true },
  });
  return !!person && person.role !== "ADMIN" && MESSAGEABLE.includes(person.status);
}

/**
 * May `senderId` send a message in a conversation with `recipientId`?
 * Allowed if the sender may message them, or they may message the sender (so a reply is always possible).
 */
export async function canExchange(senderId: string, recipientId: string): Promise<boolean> {
  if (await canStartConversation(senderId, recipientId)) return true;
  return canStartConversation(recipientId, senderId);
}
