import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, supportMessagesTable, usersTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();

const SUPPORT_TYPES = new Set(["support", "feedback", "suggestion", "report", "other"]);
const MEMBER_REQUEST_TYPES = new Set(["volunteer_contact", "help_offer"]);

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

router.post("/support-messages", async (req, res): Promise<void> => {
  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 200).toLowerCase();
  const type = cleanText(req.body?.type, 40);
  const subject = cleanText(req.body?.subject, 200);
  const message = cleanText(req.body?.message, 5000);

  if (!name || !email || !type || !subject || !message) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }
  if (!validEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address" });
    return;
  }
  if (!SUPPORT_TYPES.has(type)) {
    res.status(400).json({ error: "Invalid support message type" });
    return;
  }

  const [created] = await db.insert(supportMessagesTable).values({
    userId: getSessionUserId(req) ?? null,
    name,
    email,
    type,
    subject,
    message,
    status: "open",
  }).returning();

  res.status(201).json(created);
});

router.post("/member-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = getSessionUserId(req)!;
  const type = cleanText(req.body?.type, 40);
  const subject = cleanText(req.body?.subject, 200);
  const message = cleanText(req.body?.message, 5000);

  if (!type || !subject || !message) {
    res.status(400).json({ error: "type, subject, and message are required" });
    return;
  }
  if (!MEMBER_REQUEST_TYPES.has(type)) {
    res.status(400).json({ error: "Invalid member request type" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [created] = await db.insert(supportMessagesTable).values({
    userId,
    name: user.nickname || user.name,
    email: user.email || user.phone || "Gavhah member",
    type,
    subject,
    message,
    status: "open",
  }).returning();

  res.status(201).json(created);
});

router.get("/admin/support-messages", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(supportMessagesTable).orderBy(desc(supportMessagesTable.createdAt));
  res.json(rows);
});

router.patch("/admin/support-messages/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || "");
  if (!["open", "resolved"].includes(status)) {
    res.status(400).json({ error: "Invalid support status" });
    return;
  }

  const [updated] = await db.update(supportMessagesTable)
    .set({ status })
    .where(eq(supportMessagesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
