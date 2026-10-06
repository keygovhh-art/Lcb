import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, supportMessagesTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/support-messages", async (req, res): Promise<void> => {
  const { name, email, type, subject, message } = req.body;
  if (!name || !email || !type || !subject || !message) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  const [created] = await db.insert(supportMessagesTable).values({
    userId: getSessionUserId(req) ?? null,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    type: String(type),
    subject: String(subject).trim(),
    message: String(message).trim(),
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
  const { status } = req.body;
  const [updated] = await db.update(supportMessagesTable)
    .set({ status })
    .where(eq(supportMessagesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
