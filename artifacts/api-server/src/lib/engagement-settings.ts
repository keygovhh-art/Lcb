import { db, supportMessagesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export type ReplyMode = "instant" | "review" | "off";
export type EngagementSection = "forum" | "news";

export type EngagementSetting = {
  section: EngagementSection;
  label: string;
  supportsReplies: boolean;
  replyMode: ReplyMode;
  showViews: boolean;
};

const TYPE = "__engagement_setting__";

const DEFAULTS: Record<EngagementSection, EngagementSetting> = {
  forum: {
    section: "forum",
    label: "Askanim Forum",
    supportsReplies: true,
    replyMode: "instant",
    showViews: true,
  },
  news: {
    section: "news",
    label: "Chesed News",
    supportsReplies: false,
    replyMode: "off",
    showViews: true,
  },
};

function parseSetting(section: EngagementSection, message: unknown): EngagementSetting {
  const fallback = DEFAULTS[section];
  try {
    const parsed = JSON.parse(String(message || "{}"));
    const replyMode: ReplyMode =
      parsed.replyMode === "instant" || parsed.replyMode === "review" || parsed.replyMode === "off"
        ? parsed.replyMode
        : fallback.replyMode;
    return {
      ...fallback,
      replyMode: fallback.supportsReplies ? replyMode : "off",
      showViews: typeof parsed.showViews === "boolean" ? parsed.showViews : fallback.showViews,
    };
  } catch {
    return fallback;
  }
}

export async function getEngagementSetting(section: EngagementSection): Promise<EngagementSetting> {
  const [row] = await db.select().from(supportMessagesTable)
    .where(and(eq(supportMessagesTable.type, TYPE), eq(supportMessagesTable.subject, section)))
    .orderBy(desc(supportMessagesTable.id))
    .limit(1);
  return row ? parseSetting(section, row.message) : DEFAULTS[section];
}

export async function getAllEngagementSettings(): Promise<EngagementSetting[]> {
  return Promise.all((Object.keys(DEFAULTS) as EngagementSection[]).map(getEngagementSetting));
}

export async function saveEngagementSetting(
  section: EngagementSection,
  input: Partial<Pick<EngagementSetting, "replyMode" | "showViews">>,
  actorId: number,
): Promise<EngagementSetting> {
  const current = await getEngagementSetting(section);
  const next: EngagementSetting = {
    ...current,
    replyMode: current.supportsReplies && input.replyMode
      ? input.replyMode
      : current.replyMode,
    showViews: input.showViews === undefined ? current.showViews : Boolean(input.showViews),
  };

  const [existing] = await db.select().from(supportMessagesTable)
    .where(and(eq(supportMessagesTable.type, TYPE), eq(supportMessagesTable.subject, section)))
    .orderBy(desc(supportMessagesTable.id))
    .limit(1);

  const payload = JSON.stringify({
    replyMode: next.replyMode,
    showViews: next.showViews,
    updatedBy: actorId,
    updatedAt: new Date().toISOString(),
  });

  if (existing) {
    await db.update(supportMessagesTable)
      .set({ message: payload, userId: actorId, status: "resolved" })
      .where(eq(supportMessagesTable.id, existing.id));
  } else {
    await db.insert(supportMessagesTable).values({
      userId: actorId,
      name: "Engagement Settings",
      email: "engagement@internal.invalid",
      type: TYPE,
      subject: section,
      message: payload,
      status: "resolved",
    });
  }

  return next;
}
