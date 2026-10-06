import { Router, type IRouter } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, reservationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";

const router: IRouter = Router();

function isStaff(role?: string) {
  return role === "admin" || role === "moderator";
}

router.get("/reservations/availability", async (_req, res): Promise<void> => {
  const rows = await db.select({
    reservationDate: reservationsTable.reservationDate,
    reservationTime: reservationsTable.reservationTime,
  }).from(reservationsTable)
    .where(ne(reservationsTable.status, "cancelled"));
  res.json(rows);
});

router.get("/reservations", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(reservationsTable)
    .where(eq(reservationsTable.userId, getSessionUserId(req)!))
    .orderBy(desc(reservationsTable.createdAt));
  res.json(rows);
});

router.get("/admin/reservations", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(reservationsTable).orderBy(desc(reservationsTable.createdAt));
  res.json(rows);
});

router.post("/reservations", requireAuth, async (req, res): Promise<void> => {
  const { name, reservationDate, reservationTime, purpose, notes } = req.body;
  if (!name || !reservationDate || !reservationTime || !purpose) {
    res.status(400).json({ error: "name, reservationDate, reservationTime, and purpose are required" });
    return;
  }

  try {
    const [created] = await db.insert(reservationsTable).values({
      userId: getSessionUserId(req)!,
      name: String(name).trim(),
      reservationDate: String(reservationDate),
      reservationTime: String(reservationTime),
      purpose: String(purpose),
      notes: notes ? String(notes) : null,
      status: "confirmed",
    }).returning();
    res.status(201).json(created);
  } catch {
    res.status(409).json({ error: "That time slot is no longer available" });
  }
});

router.delete("/reservations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = getSessionUserId(req)!;
  const role = getSessionUserRole(req);
  const [existing] = await db.select().from(reservationsTable).where(eq(reservationsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== userId && !isStaff(role)) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  const [updated] = await db.update(reservationsTable)
    .set({ status: "cancelled" })
    .where(and(eq(reservationsTable.id, id), ne(reservationsTable.status, "cancelled")))
    .returning();
  res.json(updated ?? existing);
});

router.patch("/reservations/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const [updated] = await db.update(reservationsTable)
    .set({ status })
    .where(eq(reservationsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
