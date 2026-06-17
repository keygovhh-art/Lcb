import { Router } from "express";
import { db } from "@workspace/db";
import { followsTable, savedItemsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const fmt = (r: typeof followsTable.$inferSelect) => ({ ...r, createdAt: r.createdAt.toISOString() });
const fmtS = (r: typeof savedItemsTable.$inferSelect) => ({ ...r, createdAt: r.createdAt.toISOString() });

// --- Follows ---

router.get("/follows", async (_req, res) => {
  const rows = await db.select().from(followsTable).where(eq(followsTable.userId, 1));
  res.json(rows.map(fmt));
});

router.get("/follows/check", async (req, res) => {
  const entityType = String(req.query.entityType ?? "");
  const entityId = Number(req.query.entityId ?? 0);
  const [row] = await db.select().from(followsTable).where(
    and(eq(followsTable.userId, 1), eq(followsTable.entityType, entityType), eq(followsTable.entityId, entityId))
  );
  res.json({ following: !!row, followId: row?.id ?? null });
});

router.post("/follows", async (req, res) => {
  const { entityType, entityId, entityTitle, entityUrl } = req.body;
  try {
    const [row] = await db.insert(followsTable).values({
      userId: 1, entityType, entityId, entityTitle: entityTitle ?? "", entityUrl: entityUrl ?? "",
    }).onConflictDoNothing().returning();
    if (row) { res.status(201).json(fmt(row)); return; }
    const [existing] = await db.select().from(followsTable).where(
      and(eq(followsTable.userId, 1), eq(followsTable.entityType, entityType), eq(followsTable.entityId, entityId))
    );
    res.status(201).json(fmt(existing));
  } catch {
    res.status(400).json({ error: "Could not follow" });
  }
});

router.delete("/follows/:id", async (req, res) => {
  await db.delete(followsTable).where(and(eq(followsTable.id, Number(req.params.id)), eq(followsTable.userId, 1)));
  res.json({ ok: true });
});

// --- Saved Items ---

router.get("/saved", async (_req, res) => {
  const rows = await db.select().from(savedItemsTable).where(eq(savedItemsTable.userId, 1));
  res.json(rows.map(fmtS));
});

router.get("/saved/check", async (req, res) => {
  const contentType = String(req.query.contentType ?? "");
  const contentId = Number(req.query.contentId ?? 0);
  const [row] = await db.select().from(savedItemsTable).where(
    and(eq(savedItemsTable.userId, 1), eq(savedItemsTable.contentType, contentType), eq(savedItemsTable.contentId, contentId))
  );
  res.json({ saved: !!row, savedId: row?.id ?? null });
});

router.post("/saved", async (req, res) => {
  const { contentType, contentId, contentTitle, contentUrl } = req.body;
  try {
    const [row] = await db.insert(savedItemsTable).values({
      userId: 1, contentType, contentId, contentTitle: contentTitle ?? "", contentUrl: contentUrl ?? "",
    }).onConflictDoNothing().returning();
    if (row) { res.status(201).json(fmtS(row)); return; }
    const [existing] = await db.select().from(savedItemsTable).where(
      and(eq(savedItemsTable.userId, 1), eq(savedItemsTable.contentType, contentType), eq(savedItemsTable.contentId, contentId))
    );
    res.status(201).json(fmtS(existing));
  } catch {
    res.status(400).json({ error: "Could not save" });
  }
});

router.delete("/saved/:id", async (req, res) => {
  await db.delete(savedItemsTable).where(and(eq(savedItemsTable.id, Number(req.params.id)), eq(savedItemsTable.userId, 1)));
  res.json({ ok: true });
});

export default router;
