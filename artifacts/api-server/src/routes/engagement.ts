import { Router, type IRouter, type RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db, pool, commentsTable, discussionsTable, supportMessagesTable,
} from "@workspace/db";
import {
  getAllEngagementSettings,
  saveEngagementSetting,
  type EngagementSection,
  type ReplyMode,
} from "../lib/engagement-settings";
import { requireAdmin, getSessionUserId } from "../middlewares/auth";
import { notifyUser } from "../lib/notify";

const router: IRouter = Router();
export const PENDING_COMMENT_TYPE = "__pending_comment__";

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

type PendingComment = {
  discussionId: number;
  content: string;
  parentId: number | null;
  authorId: number;
  authorName: string;
  createdAt: string;
};

function parsePending(message: unknown): PendingComment | null {
  try {
    const parsed = JSON.parse(String(message));
    if (
      !Number.isSafeInteger(parsed.discussionId) ||
      !Number.isSafeInteger(parsed.authorId) ||
      typeof parsed.content !== "string" ||
      !parsed.content.trim() ||
      typeof parsed.authorName !== "string"
    ) return null;
    const parentId = parsed.parentId === null || parsed.parentId === undefined
      ? null
      : Number(parsed.parentId);
    if (parentId !== null && !Number.isSafeInteger(parentId)) return null;
    return {
      discussionId: Number(parsed.discussionId),
      content: parsed.content,
      parentId,
      authorId: Number(parsed.authorId),
      authorName: parsed.authorName,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

router.get("/engagement-settings", async (_req, res, next): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getAllEngagementSettings());
  } catch (error) {
    next(error);
  }
});

router.get("/admin/engagement-overview", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const [
      settings,
      forumStats,
      newsStats,
      pendingStats,
      topForum,
      topNews,
    ] = await Promise.all([
      getAllEngagementSettings(),
      pool.query(
        `SELECT COALESCE(SUM(views),0)::int AS views,
                COALESCE(SUM(comment_count),0)::int AS comments,
                COUNT(*)::int AS discussions
         FROM discussions`,
      ),
      pool.query(
        `SELECT COALESCE(SUM(view_count),0)::int AS views,
                COUNT(*)::int AS articles
         FROM news`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS pending
         FROM support_messages
         WHERE type=$1 AND status='open'`,
        [PENDING_COMMENT_TYPE],
      ),
      pool.query(
        `SELECT id,title,views,comment_count AS "commentCount"
         FROM discussions
         ORDER BY views DESC, comment_count DESC
         LIMIT 10`,
      ),
      pool.query(
        `SELECT id,title,view_count AS views
         FROM news
         ORDER BY view_count DESC
         LIMIT 10`,
      ),
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      settings,
      stats: {
        forum: forumStats.rows[0] ?? { views: 0, comments: 0, discussions: 0 },
        news: newsStats.rows[0] ?? { views: 0, articles: 0 },
        pendingComments: pendingStats.rows[0]?.pending ?? 0,
      },
      top: {
        forum: topForum.rows,
        news: topNews.rows,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/admin/engagement-settings/:section",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const section = String(req.params.section) as EngagementSection;
      if (section !== "forum" && section !== "news") {
        res.status(404).json({ error: "Unknown section" });
        return;
      }

      const patch: { replyMode?: ReplyMode; showViews?: boolean } = {};
      if (req.body?.replyMode !== undefined) {
        const mode = String(req.body.replyMode);
        if (!["instant", "review", "off"].includes(mode)) {
          res.status(400).json({ error: "Invalid reply mode" });
          return;
        }
        patch.replyMode = mode as ReplyMode;
      }
      if (req.body?.showViews !== undefined) patch.showViews = Boolean(req.body.showViews);

      const updated = await saveEngagementSetting(
        section,
        patch,
        getSessionUserId(req)!,
      );
      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/admin/pending-comments/:id/approve",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid pending comment ID" });
        return;
      }

      const [pendingRow] = await db.select().from(supportMessagesTable).where(and(
        eq(supportMessagesTable.id, id),
        eq(supportMessagesTable.type, PENDING_COMMENT_TYPE),
        eq(supportMessagesTable.status, "open"),
      ));
      const pending = pendingRow ? parsePending(pendingRow.message) : null;
      if (!pendingRow || !pending) {
        res.status(404).json({ error: "Pending comment not found" });
        return;
      }

      const [discussion] = await db.select().from(discussionsTable)
        .where(eq(discussionsTable.id, pending.discussionId));
      if (!discussion) {
        await db.update(supportMessagesTable)
          .set({ status: "resolved" })
          .where(eq(supportMessagesTable.id, id));
        res.status(409).json({ error: "Discussion no longer exists" });
        return;
      }

      let parent: typeof commentsTable.$inferSelect | null = null;
      if (pending.parentId !== null) {
        [parent] = await db.select().from(commentsTable).where(and(
          eq(commentsTable.id, pending.parentId),
          eq(commentsTable.discussionId, pending.discussionId),
        ));
        if (!parent) {
          res.status(409).json({ error: "Parent comment no longer exists" });
          return;
        }
      }

      const [comment] = await db.insert(commentsTable).values({
        content: pending.content,
        discussionId: pending.discussionId,
        authorId: pending.authorId,
        authorName: pending.authorName,
        parentId: pending.parentId,
      }).returning();

      await db.update(discussionsTable)
        .set({ commentCount: sql`${discussionsTable.commentCount} + 1` })
        .where(eq(discussionsTable.id, pending.discussionId));
      await db.update(supportMessagesTable)
        .set({ status: "resolved" })
        .where(eq(supportMessagesTable.id, id));

      await notifyUser(
        pending.authorId,
        "comment_approved",
        "Your forum reply was approved and is now live.",
        `/forum/${pending.discussionId}`,
      );

      if (discussion.authorId !== pending.authorId) {
        await notifyUser(
          discussion.authorId,
          "discussion_reply",
          `${pending.authorName} replied to your discussion "${discussion.title}".`,
          `/forum/${pending.discussionId}`,
        );
      }
      if (
        parent &&
        parent.authorId !== pending.authorId &&
        parent.authorId !== discussion.authorId
      ) {
        await notifyUser(
          parent.authorId,
          "comment_reply",
          `${pending.authorName} replied to your forum comment.`,
          `/forum/${pending.discussionId}`,
        );
      }

      res.json(comment);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/admin/pending-comments/:id/reject",
  requireSameOrigin,
  requireAdmin,
  async (req, res, next): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ error: "Invalid pending comment ID" });
        return;
      }

      const [pendingRow] = await db.select().from(supportMessagesTable).where(and(
        eq(supportMessagesTable.id, id),
        eq(supportMessagesTable.type, PENDING_COMMENT_TYPE),
        eq(supportMessagesTable.status, "open"),
      ));
      const pending = pendingRow ? parsePending(pendingRow.message) : null;
      if (!pendingRow || !pending) {
        res.status(404).json({ error: "Pending comment not found" });
        return;
      }

      await db.update(supportMessagesTable)
        .set({ status: "resolved" })
        .where(eq(supportMessagesTable.id, id));

      await notifyUser(
        pending.authorId,
        "comment_rejected",
        "Your forum reply was reviewed and was not published.",
        `/forum/${pending.discussionId}`,
      );

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
