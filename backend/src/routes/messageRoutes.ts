import { Router, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { messagingGuard, AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { allowedContacts, canStartConversation, canExchange } from "../services/messagingRules.js";
import { announceStatus, emitToUser, isOnline } from "../realtime.js";
import { pushToUserInBackground } from "../services/pushService.js";

const router = Router();

const MAX_MESSAGE_LENGTH = 2000; // REQ: up to 2000 characters
const PAGE_SIZE = 50; // history loads 50 at a time (UC-10)
const RATE_LIMIT = 30; // REQ-5.4: 30 messages per minute
const RATE_WINDOW_MS = 60_000;

const NOT_ALLOWED = "You are not allowed to message this user.";
const BAD_LENGTH = `Please enter a message of up to ${MAX_MESSAGE_LENGTH} characters.`;

// Everything here needs a logged-in user placed in the hierarchy. The administrator does not use messaging.
router.use(...messagingGuard);

// ---------- helpers ----------

type MessageStatusLabel = "SENT" | "DELIVERED" | "READ";

function statusOf(statuses: { delivered_at: Date | null; read_at: Date | null }[]): MessageStatusLabel {
  if (statuses.length > 0 && statuses.every((s) => s.read_at)) return "READ";
  if (statuses.length > 0 && statuses.every((s) => s.delivered_at || s.read_at)) return "DELIVERED";
  return "SENT";
}

/** Recipient side: everything sent to me counts as delivered once my app has asked for it. Senders are told live. */
async function markDelivered(userId: string, conversationId?: string): Promise<void> {
  const where = {
    user_id: userId,
    delivered_at: null,
    ...(conversationId ? { message: { conversation_id: conversationId } } : {}),
  };
  const waiting = await prisma.messageStatus.findMany({
    where,
    select: { message_id: true, message: { select: { sender_id: true, conversation_id: true } } },
  });
  if (waiting.length === 0) return;
  await prisma.messageStatus.updateMany({ where, data: { delivered_at: new Date() } });
  announceStatus(
    waiting.map((w) => ({ messageId: w.message_id, senderId: w.message.sender_id, conversationId: w.message.conversation_id })),
    "DELIVERED",
  );
}

/** Sliding window: at most RATE_LIMIT messages per user per minute (kept in memory). */
const sentLog = new Map<string, number[]>();
function overRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (sentLog.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    sentLog.set(userId, recent);
    return true;
  }
  recent.push(now);
  sentLog.set(userId, recent);
  return false;
}

/** The conversation, only if `userId` is a member. Returns the other person for 1:1 chats. */
async function loadMembership(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { conversation_id: conversationId },
    include: { members: { include: { user: { select: { user_id: true, name: true, role: true, status: true } } } } },
  });
  if (!conversation || !conversation.members.some((m) => m.user_id === userId)) return null;
  const other = conversation.members.find((m) => m.user_id !== userId)?.user ?? null;
  return { conversation, other };
}

const participantOf = (u: { user_id: string; name: string; role: string } | null) =>
  u ? { id: u.user_id, name: u.name, role: u.role } : null;

// ---------- who can I message? ----------

/** GET /api/messages/contacts?q=  : only people allowed by the messaging rules (REQ-5.1, REQ-7.2, REQ-7.3) */
router.get("/contacts", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const contacts = await allowedContacts(req.user!.id);
    const shown = q
      ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q))
      : contacts;
    res.status(200).json({ contacts: shown });
  } catch (error) {
    console.error("Contacts error:", error);
    res.status(500).json({ message: "Contacts could not be loaded." });
  }
});

// ---------- inbox ----------

/** GET /api/messages/conversations : latest message and unread count for each conversation (REQ-10.1) */
router.get("/conversations", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    await markDelivered(me);

    const memberships = await prisma.conversationMember.findMany({
      where: { user_id: me },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: { user_id: true, name: true, role: true } } } },
            messages: { orderBy: { sent_at: "desc" }, take: 1 },
          },
        },
      },
    });

    const items = await Promise.all(
      memberships.map(async ({ conversation }) => {
        const last = conversation.messages[0] ?? null;
        const unreadCount = await prisma.message.count({
          where: {
            conversation_id: conversation.conversation_id,
            sender_id: { not: me },
            is_deleted: false,
            statuses: { some: { user_id: me, read_at: null } },
          },
        });
        const other = conversation.members.find((m) => m.user_id !== me)?.user ?? null;
        return {
          id: conversation.conversation_id,
          type: conversation.type,
          participant: participantOf(other),
          lastMessage: last
            ? { body: last.body, sentAt: last.sent_at.toISOString(), fromMe: last.sender_id === me }
            : null,
          unreadCount,
          updatedAt: (last?.sent_at ?? conversation.created_at).toISOString(),
        };
      }),
    );

    // Conversations without any message yet stay out of the inbox
    const withMessages = items.filter((i) => i.lastMessage);
    withMessages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.status(200).json({ conversations: withMessages });
  } catch (error) {
    console.error("Inbox error:", error);
    res.status(500).json({ message: "Messages could not be loaded." });
  }
});

/** POST /api/messages/conversations  { recipientId } : open (or create) the one conversation with this person */
router.post("/conversations", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const recipientId = String(req.body?.recipientId ?? "");
    if (!recipientId) {
      res.status(400).json({ message: "Please choose who to message." });
      return;
    }

    if (!(await canStartConversation(me, recipientId))) {
      res.status(403).json({ message: NOT_ALLOWED });
      return;
    }

    const directKey = [me, recipientId].sort().join(":"); // REQ-6.3: one conversation per pair
    let conversation = await prisma.conversation.findUnique({ where: { direct_key: directKey } });
    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            type: "DIRECT",
            direct_key: directKey,
            members: { create: [{ user_id: me }, { user_id: recipientId }] },
          },
        });
      } catch (e) {
        // two requests at the same moment: the other one created it first
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          conversation = await prisma.conversation.findUnique({ where: { direct_key: directKey } });
        } else {
          throw e;
        }
      }
    }

    const other = await prisma.user.findUnique({
      where: { user_id: recipientId },
      select: { user_id: true, name: true, role: true },
    });
    res.status(200).json({ id: conversation!.conversation_id, participant: participantOf(other) });
  } catch (error) {
    console.error("Open conversation error:", error);
    res.status(500).json({ message: "Conversation could not be opened." });
  }
});

// ---------- one conversation ----------

/** GET /api/messages/conversations/:id/messages?before=<ISO time> : history, 50 at a time (REQ-10.2) */
router.get("/conversations/:id/messages", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const membership = await loadMembership(String(req.params.id), me);
    if (!membership) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }

    await markDelivered(me, membership.conversation.conversation_id);

    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const rows = await prisma.message.findMany({
      where: {
        conversation_id: membership.conversation.conversation_id,
        is_deleted: false,
        ...(before && !Number.isNaN(before.getTime()) ? { sent_at: { lt: before } } : {}),
      },
      orderBy: { sent_at: "desc" },
      take: PAGE_SIZE + 1,
      include: { sender: { select: { name: true } }, statuses: { where: { user_id: { not: me } } } },
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = rows.slice(0, PAGE_SIZE).reverse(); // oldest first

    res.status(200).json({
      conversationId: membership.conversation.conversation_id,
      participant: participantOf(membership.other),
      hasMore,
      messages: page.map((m) => ({
        id: m.message_id,
        clientMsgId: m.client_msg_id,
        senderId: m.sender_id,
        senderName: m.sender.name,
        fromMe: m.sender_id === me,
        body: m.body,
        sentAt: m.sent_at.toISOString(),
        status: m.sender_id === me ? statusOf(m.statuses) : null,
      })),
    });
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ message: "Messages could not be loaded." });
  }
});

/** POST /api/messages/conversations/:id/read : the conversation was opened, so mark it Read (REQ-10.3) */
router.post("/conversations/:id/read", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;
    const membership = await loadMembership(String(req.params.id), me);
    if (!membership) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }
    const now = new Date();
    const unread = await prisma.messageStatus.findMany({
      where: { user_id: me, read_at: null, message: { conversation_id: membership.conversation.conversation_id } },
      select: { message_id: true, message: { select: { sender_id: true, conversation_id: true } } },
    });
    const result = await prisma.messageStatus.updateMany({
      where: { user_id: me, read_at: null, message: { conversation_id: membership.conversation.conversation_id } },
      data: { read_at: now, delivered_at: now },
    });
    // the senders see "Read" right away
    announceStatus(
      unread.map((u) => ({ messageId: u.message_id, senderId: u.message.sender_id, conversationId: u.message.conversation_id })),
      "READ",
    );
    await prisma.conversationMember.update({
      where: { conversation_id_user_id: { conversation_id: membership.conversation.conversation_id, user_id: me } },
      data: { last_read_at: now },
    });
    res.status(200).json({ markedRead: result.count });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ message: "Could not update the conversation." });
  }
});

/** POST /api/messages/conversations/:id/messages  { body, clientMsgId } : save a message, then it counts as Sent */
router.post("/conversations/:id/messages", async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const me = req.user!.id;

    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const clientMsgId = typeof req.body?.clientMsgId === "string" ? req.body.clientMsgId.trim() : "";
    if (!body || body.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ message: BAD_LENGTH });
      return;
    }
    if (!clientMsgId || clientMsgId.length > 100) {
      res.status(400).json({ message: "Message could not be sent. Please try again." });
      return;
    }

    const membership = await loadMembership(String(req.params.id), me);
    if (!membership || !membership.other) {
      res.status(404).json({ message: "Conversation not found." });
      return;
    }

    // A retry of a message that was already saved returns the saved one (no duplicates)
    const existing = await prisma.message.findUnique({
      where: { sender_id_client_msg_id: { sender_id: me, client_msg_id: clientMsgId } },
      include: { statuses: true },
    });
    if (existing) {
      res.status(200).json({
        id: existing.message_id,
        clientMsgId,
        body: existing.body,
        sentAt: existing.sent_at.toISOString(),
        status: statusOf(existing.statuses),
        duplicate: true,
      });
      return;
    }

    // Permission is checked on the server for every message (REQ-5.2)
    const other = membership.other;
    const recipientOk = other.status === "ACTIVE" || other.status === "PENDING";
    if (!recipientOk || !(await canExchange(me, other.user_id))) {
      res.status(403).json({ message: NOT_ALLOWED });
      return;
    }

    if (overRateLimit(me)) {
      res.status(429).json({ message: "You are sending messages too fast. Please wait a moment." });
      return;
    }

    const saved = await prisma.message.create({
      data: {
        conversation_id: membership.conversation.conversation_id,
        sender_id: me,
        body,
        client_msg_id: clientMsgId,
        statuses: { create: [{ user_id: other.user_id }] },
      },
    });

    // REQ-6.4: the recipient is notified of each new message
    const note = await prisma.notification.create({
      data: {
        user_id: other.user_id,
        type: "MESSAGE",
        ref_type: "conversation",
        ref_id: membership.conversation.conversation_id,
        title: `New message from ${req.user!.fullName}`,
      },
    });

    // Live: if the recipient is online the message is delivered at once
    let status: MessageStatusLabel = "SENT";
    const online = await isOnline(other.user_id);
    if (online) {
      await prisma.messageStatus.updateMany({
        where: { message_id: saved.message_id, user_id: other.user_id },
        data: { delivered_at: new Date() },
      });
      status = "DELIVERED";
    }

    const base = {
      id: saved.message_id,
      clientMsgId,
      senderId: me,
      senderName: req.user!.fullName,
      body: saved.body,
      sentAt: saved.sent_at.toISOString(),
    };
    const conversationId = membership.conversation.conversation_id;

    // The recipient is not using the app right now: alert their phone. Title only, never the message text (REQ-9.2).
    if (!online) {
      const unread = await prisma.messageStatus.count({ where: { user_id: other.user_id, read_at: null } });
      pushToUserInBackground(other.user_id, note.notification_id, {
        title: note.title,
        tag: `chat-${conversationId}`,
        url: `/?chat=${conversationId}`,
        unread,
      });
    }

    emitToUser(other.user_id, "message:new", {
      conversationId,
      message: { ...base, fromMe: false, status: null },
      participant: { id: me, name: req.user!.fullName, role: req.user!.role },
    });
    emitToUser(me, "message:new", {
      conversationId,
      message: { ...base, fromMe: true, status },
      participant: participantOf(other),
    });

    res.status(201).json({
      id: saved.message_id,
      clientMsgId,
      body: saved.body,
      sentAt: saved.sent_at.toISOString(),
      status,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Not sent. Tap to retry." });
  }
});

export default router;
