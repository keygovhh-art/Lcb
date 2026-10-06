import { Router, type IRouter } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, reservationsTable } from "@workspace/db";
import { requireAuth, requireAdmin, getSessionUserId, getSessionUserRole } from "../middlewares/auth";

const router: IRouter = Router();

const ALLOWED_TIMES = new Set([
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
]);

function isValidReservationDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isPastReservationDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const chosen = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return chosen < today;
}

function isClosedReservationDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  return dow === 5 || dow === 6;
}

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
  const cleanName = String(name || "").trim();
  const cleanDate = String(reservationDate || "");
  const cleanTime = String(reservationTime || "");
  const cleanPurpose = String(purpose || "").trim();

  if (!cleanName || !cleanDate || !cleanTime || !cleanPurpose) {
    res.status(400).json({ error: "name, reservationDate, reservationTime, and purpose are required" });
    return;
  }
  if (!isValidReservationDate(cleanDate) || isPastReservationDate(cleanDate)) {
    res.status(400).json({ error: "Choose a valid current or future date" });
    return;
  }
  if (isClosedReservationDay(cleanDate)) {
    res.status(400).json({ error: "The office is closed on Friday and Saturday" });
    return;
  }
  if (!ALLOWED_TIMES.has(cleanTime)) {
    res.status(400).json({ error: "Choose a valid office time slot" });
    return;
  }

  try {
    const [created] = await db.insert(reservationsTable).values({
      userId: getSessionUserId(req)!,
      name: cleanName,
      reservationDate: cleanDate,
      reservationTime: cleanTime,
      purpose: cleanPurpose,
      notes: notes ? String(notes).trim() : null,
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
  const status = String(req.body?.status || "");
  if (!["confirmed", "cancelled", "completed"].includes(status)) {
    res.status(400).json({ error: "Invalid reservation status" });
    return;
  }

  const [updated] = await db.update(reservationsTable)
    .set({ status })
    .where(eq(reservationsTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

export default router;
