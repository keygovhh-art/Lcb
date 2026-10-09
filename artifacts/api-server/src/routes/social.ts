import { Router } from "express";
import { db } from "@workspace/db";
import { followsTable, savedItemsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, getSessionUserId } from "../middlewares/auth";

const router = Router();

const FOLLOW_TYPES = new Set(["group", "project", "cause", "discussion", "news", "user"]);
const SAVED_TYPES = new Set(["discussion", "news", "cause", "group", "project", "minyan"]);

const fmt = (r: typeof followsTable.$inferSelect) => ({ ...r, createdAt: r.createdAt.toISOString() });
const fmtS = (r: typeof savedItemsTable.$inferSelect) => ({ ...r, createdAt: r.createdAt.toISOString() });

// --- Follows ---

router.get("/follows", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const rows = await db.select().from(followsTable).where(eq(followsTable.userId, userId));
  res.json(rows.filter(x=>x.entityType!=="volunteer").map(fmt));
});

router.get("/follows/check", requireAuth, async (req, res) => {
  const entityType = String(req.query.entityType ?? "");
  const entityId = Number(req.query.entityId ?? 0);
  if (!FOLLOW_TYPES.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ error: "Invalid follow target" });
    return;
  }
  const [row] = await db.select().from(followsTable).where(
    and(eq(followsTable.userId, getSessionUserId(req)!), eq(followsTable.entityType, entityType), eq(followsTable.entityId, entityId))
  );
  res.json({ following: !!row, followId: row?.id ?? null });
});

router.post("/follows", requireAuth, async (req, res) => {
  const entityType = String(req.body?.entityType || "");
  const entityId = Number(req.body?.entityId);
  const entityTitle = String(req.body?.entityTitle || "").trim().slice(0, 300);
  const entityUrl = String(req.body?.entityUrl || "").trim().slice(0, 1000);
  const userId = getSessionUserId(req)!;

  if (!FOLLOW_TYPES.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
    res.status(400).json({ error: "Invalid follow target" });
    return;
  }

  try {
    const [row] = await db.insert(followsTable).values({
      userId, entityType, entityId, entityTitle, entityUrl,
    }).onConflictDoNothing().returning();
    if (row) { res.status(201).json(fmt(row)); return; }

    const [existing] = await db.select().from(followsTable).where(
      and(eq(followsTable.userId, userId), eq(followsTable.entityType, entityType), eq(followsTable.entityId, entityId))
    );
    if (!existing) { res.status(409).json({ error: "Follow state changed; please refresh" }); return; }
    res.status(200).json(fmt(existing));
  } catch {
    res.status(400).json({ error: "Could not follow" });
  }
});

router.delete("/follows/:id", requireAuth, async (req, res) => {
  await db.delete(followsTable).where(and(eq(followsTable.id, Number(req.params.id)), eq(followsTable.userId, getSessionUserId(req)!)));
  res.json({ ok: true });
});

// --- Saved Items ---

router.get("/saved", requireAuth, async (req, res) => {
  const userId = getSessionUserId(req)!;
  const rows = await db.select().from(savedItemsTable).where(eq(savedItemsTable.userId, userId));
  res.json(rows.filter(x=>x.contentType!=="volunteer").map(fmtS));
});

router.get("/saved/check", requireAuth, async (req, res) => {
  const contentType = String(req.query.contentType ?? "");
  const contentId = Number(req.query.contentId ?? 0);
  if (!SAVED_TYPES.has(contentType) || !Number.isInteger(contentId) || contentId <= 0) {
    res.status(400).json({ error: "Invalid saved-item target" });
    return;
  }
  const [row] = await db.select().from(savedItemsTable).where(
    and(eq(savedItemsTable.userId, getSessionUserId(req)!), eq(savedItemsTable.contentType, contentType), eq(savedItemsTable.contentId, contentId))
  );
  res.json({ saved: !!row, savedId: row?.id ?? null });
});

router.post("/saved", requireAuth, async (req, res) => {
  const contentType = String(req.body?.contentType || "");
  const contentId = Number(req.body?.contentId);
  const contentTitle = String(req.body?.contentTitle || "").trim().slice(0, 300);
  const contentUrl = String(req.body?.contentUrl || "").trim().slice(0, 1000);
  const userId = getSessionUserId(req)!;

  if (!SAVED_TYPES.has(contentType) || !Number.isInteger(contentId) || contentId <= 0) {
    res.status(400).json({ error: "Invalid saved-item target" });
    return;
  }

  try {
    const [row] = await db.insert(savedItemsTable).values({
      userId, contentType, contentId, contentTitle, contentUrl,
    }).onConflictDoNothing().returning();
    if (row) { res.status(201).json(fmtS(row)); return; }

    const [existing] = await db.select().from(savedItemsTable).where(
      and(eq(savedItemsTable.userId, userId), eq(savedItemsTable.contentType, contentType), eq(savedItemsTable.contentId, contentId))
    );
    if (!existing) { res.status(409).json({ error: "Saved state changed; please refresh" }); return; }
    res.status(200).json(fmtS(existing));
  } catch {
    res.status(400).json({ error: "Could not save" });
  }
});

router.delete("/saved/:id", requireAuth, async (req, res) => {
  await db.delete(savedItemsTable).where(and(eq(savedItemsTable.id, Number(req.params.id)), eq(savedItemsTable.userId, getSessionUserId(req)!)));
  res.json({ ok: true });
});

export default router;
