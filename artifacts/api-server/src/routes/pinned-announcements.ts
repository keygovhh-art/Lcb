import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, newsTable, supportMessagesTable } from "@workspace/db";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";

const router: IRouter = Router();
const TYPE = "__pinned_announcement__";

type PinState = {
  newsId: number;
  label: string;
  headline: string;
  summary: string;
  priority: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  rotationSeconds: number;
  updatedAt: string;
  updatedBy: number;
};

const requireSameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (!origin) { next(); return; }
  try {
    const parsed = new URL(origin);
    const host = req.get("x-forwarded-host") || req.get("host");
    if (parsed.host !== host) {
      res.status(403).json({ error: "Invalid request origin" });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
  }
};

function parseDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function parseState(message: unknown): PinState | null {
  try {
    const parsed = JSON.parse(String(message || "{}"));
    const newsId = Number(parsed.newsId);
    if (!Number.isSafeInteger(newsId) || newsId <= 0) return null;
    return {
      newsId,
      label: cleanText(parsed.label || "Announcement", 50) || "Announcement",
      headline: cleanText(parsed.headline, 180),
      summary: cleanText(parsed.summary, 320),
      priority: Number.isFinite(Number(parsed.priority))
        ? Math.max(0, Math.min(100, Math.round(Number(parsed.priority))))
        : 50,
      enabled: parsed.enabled !== false,
      startAt: typeof parsed.startAt === "string" && parsed.startAt ? parsed.startAt : null,
      endAt: typeof parsed.endAt === "string" && parsed.endAt ? parsed.endAt : null,
      rotationSeconds: Number.isFinite(Number(parsed.rotationSeconds))
        ? Math.max(2, Math.min(30, Math.round(Number(parsed.rotationSeconds))))
        : 5,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      updatedBy: Number.isSafeInteger(Number(parsed.updatedBy)) ? Number(parsed.updatedBy) : 0,
    };
  } catch {
    return null;
  }
}

function isActive(pin: PinState, now = Date.now()) {
  if (!pin.enabled) return false;
  if (pin.startAt) {
    const start = new Date(pin.startAt).getTime();
    if (Number.isFinite(start) && start > now) return false;
  }
  if (pin.endAt) {
    const end = new Date(pin.endAt).getTime();
    if (Number.isFinite(end) && end <= now) return false;
  }
  return true;
}

async function loadRows() {
  return db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.type, TYPE))
    .orderBy(desc(supportMessagesTable.id));
}

async function withNews(rows: Array<typeof supportMessagesTable.$inferSelect>) {
  const parsed = rows
    .map(row => ({ row, pin: parseState(row.message) }))
    .filter((item): item is { row: typeof supportMessagesTable.$inferSelect; pin: PinState } => Boolean(item.pin));

  const ids = Array.from(new Set(parsed.map(item => item.pin.newsId)));
  const newsRows = ids.length
    ? await db.select().from(newsTable).where(inArray(newsTable.id, ids))
    : [];
  const newsById = new Map(newsRows.map(item => [item.id, item]));

  return parsed.map(({ row, pin }) => {
    const news = newsById.get(pin.newsId) ?? null;
    return {
      id: row.id,
      ...pin,
      news: news ? {
        id: news.id,
        title: news.title,
        summary: news.summary,
        category: news.category,
        urgency: news.urgency,
        imageUrl: news.imageUrl,
        createdAt: news.createdAt,
      } : null,
    };
  });
}

router.get("/pinned-announcements", async (_req, res, next): Promise<void> => {
  try {
    const rows = await withNews(await loadRows());
    const active = rows
      .filter(item => item.news && isActive(item))
      .sort((a, b) => b.priority - a.priority || b.id - a.id)
      .map(item => ({
        id: item.id,
        newsId: item.newsId,
        label: item.label,
        headline: item.headline || item.news!.title,
        summary: item.summary || item.news!.summary || "",
        priority: item.priority,
        rotationSeconds: item.rotationSeconds,
        news: item.news,
      }));
    res.setHeader("Cache-Control", "no-store");
    res.json(active);
  } catch (error) {
    next(error);
  }
});

router.get("/admin/pinned-announcements", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const rows = await withNews(await loadRows());
    res.setHeader("Cache-Control", "no-store");
    res.json(rows.map(item => ({
      ...item,
      activeNow: Boolean(item.news) && isActive(item),
    })));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/admin/pinned-announcements",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const actorId = getSessionUserId(req)!;
      const newsId = Number(req.body?.newsId);
      if (!Number.isSafeInteger(newsId) || newsId <= 0) {
        res.status(400).json({ error: "Choose a valid News post" });
        return;
      }
      const [news] = await db.select().from(newsTable).where(eq(newsTable.id, newsId));
      if (!news) {
        res.status(404).json({ error: "News post not found" });
        return;
      }

      const existingRows = await loadRows();
      const alreadyPinned = existingRows.some(row => parseState(row.message)?.newsId === newsId);
      if (alreadyPinned) {
        res.status(409).json({ error: "This News post is already pinned" });
        return;
      }

      const startAt = parseDate(req.body?.startAt);
      const endAt = parseDate(req.body?.endAt);
      if (req.body?.startAt && startAt === undefined) {
        res.status(400).json({ error: "Invalid start time" });
        return;
      }
      if (req.body?.endAt && endAt === undefined) {
        res.status(400).json({ error: "Invalid end time" });
        return;
      }
      if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        res.status(400).json({ error: "End time must be after start time" });
        return;
      }

      const state: PinState = {
        newsId,
        label: cleanText(req.body?.label || "Announcement", 50) || "Announcement",
        headline: cleanText(req.body?.headline, 180),
        summary: cleanText(req.body?.summary, 320),
        priority: Math.max(0, Math.min(100, Math.round(Number(req.body?.priority ?? 50) || 50))),
        enabled: req.body?.enabled !== false,
        startAt: startAt ?? null,
        endAt: endAt ?? null,
        rotationSeconds: Math.max(2, Math.min(30, Math.round(Number(req.body?.rotationSeconds ?? 5) || 5))),
        updatedAt: new Date().toISOString(),
        updatedBy: actorId,
      };

      const [created] = await db.insert(supportMessagesTable).values({
        userId: actorId,
        name: "Pinned Announcement",
        email: "pinned-announcement@internal.invalid",
        type: TYPE,
        subject: `news:${newsId}`,
        message: JSON.stringify(state),
        status: "resolved",
      }).returning();

      res.status(201).json({ id: created.id, ...state, news });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/admin/pinned-announcements/:id",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid pin ID" });
        return;
      }
      const [row] = await db.select().from(supportMessagesTable).where(and(
        eq(supportMessagesTable.id, id),
        eq(supportMessagesTable.type, TYPE),
      ));
      const current = row ? parseState(row.message) : null;
      if (!row || !current) {
        res.status(404).json({ error: "Pinned announcement not found" });
        return;
      }

      const nextNewsId = req.body?.newsId === undefined ? current.newsId : Number(req.body.newsId);
      if (!Number.isSafeInteger(nextNewsId) || nextNewsId <= 0) {
        res.status(400).json({ error: "Choose a valid News post" });
        return;
      }
      const [news] = await db.select().from(newsTable).where(eq(newsTable.id, nextNewsId));
      if (!news) {
        res.status(404).json({ error: "News post not found" });
        return;
      }

      const startAt = req.body?.startAt === undefined ? current.startAt : parseDate(req.body.startAt);
      const endAt = req.body?.endAt === undefined ? current.endAt : parseDate(req.body.endAt);
      if (startAt === undefined || endAt === undefined) {
        res.status(400).json({ error: "Invalid schedule time" });
        return;
      }
      if (startAt && endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
        res.status(400).json({ error: "End time must be after start time" });
        return;
      }

      const state: PinState = {
        newsId: nextNewsId,
        label: req.body?.label === undefined ? current.label : (cleanText(req.body.label, 50) || "Announcement"),
        headline: req.body?.headline === undefined ? current.headline : cleanText(req.body.headline, 180),
        summary: req.body?.summary === undefined ? current.summary : cleanText(req.body.summary, 320),
        priority: req.body?.priority === undefined
          ? current.priority
          : Math.max(0, Math.min(100, Math.round(Number(req.body.priority) || 0))),
        enabled: req.body?.enabled === undefined ? current.enabled : Boolean(req.body.enabled),
        startAt,
        endAt,
        rotationSeconds: req.body?.rotationSeconds === undefined
          ? current.rotationSeconds
          : Math.max(2, Math.min(30, Math.round(Number(req.body.rotationSeconds) || 5))),
        updatedAt: new Date().toISOString(),
        updatedBy: getSessionUserId(req)!,
      };

      const [updated] = await db.update(supportMessagesTable)
        .set({
          userId: getSessionUserId(req)!,
          subject: `news:${nextNewsId}`,
          message: JSON.stringify(state),
          status: "resolved",
        })
        .where(eq(supportMessagesTable.id, id))
        .returning();

      res.json({ id: updated.id, ...state, news });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/admin/pinned-announcements/:id",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid pin ID" });
        return;
      }
      const deleted = await db.delete(supportMessagesTable).where(and(
        eq(supportMessagesTable.id, id),
        eq(supportMessagesTable.type, TYPE),
      )).returning({ id: supportMessagesTable.id });
      if (!deleted.length) {
        res.status(404).json({ error: "Pinned announcement not found" });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
