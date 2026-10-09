import { Router, type IRouter } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import {
  db,
  newsTable,
  discussionsTable,
  groupsTable,
  minyansTable,
  communityProjectsTable,
  featuredCausesTable,
  charitiesTable,
} from "@workspace/db";

const router: IRouter = Router();

function contains(column: unknown, query: string) {
  return sql`position(lower(${query}) in lower(coalesce(${column}, ''))) > 0`;
}

router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    res.json([]);
    return;
  }

  const [news, discussions, groups, minyans, _privateVolunteers, projects, causes, charities] = await Promise.all([
    db.select({
      id: newsTable.id,
      title: newsTable.title,
      description: newsTable.summary,
      category: newsTable.category,
    }).from(newsTable).where(or(
      contains(newsTable.title, q),
      contains(newsTable.summary, q),
      contains(newsTable.content, q),
      contains(newsTable.organization, q),
    )).limit(8),

    req.session.userId
      ? db.select({
          id: discussionsTable.id,
          title: discussionsTable.title,
          description: discussionsTable.content,
          category: discussionsTable.category,
        }).from(discussionsTable).where(or(
          contains(discussionsTable.title, q),
          contains(discussionsTable.content, q),
        )).limit(8)
      : Promise.resolve([]),

    db.select({
      id: groupsTable.id,
      title: groupsTable.name,
      description: groupsTable.description,
    }).from(groupsTable).where(and(
      eq(groupsTable.privacy, "public"),
      or(contains(groupsTable.name, q), contains(groupsTable.description, q)),
    )).limit(8),

    db.select({
      id: minyansTable.id,
      title: minyansTable.synagogueName,
      city: minyansTable.city,
      country: minyansTable.country,
      community: minyansTable.community,
    }).from(minyansTable).where(and(
      eq(minyansTable.status, "approved"),
      or(
        contains(minyansTable.synagogueName, q),
        contains(minyansTable.community, q),
        contains(minyansTable.city, q),
        contains(minyansTable.country, q),
        contains(minyansTable.address, q),
      ),
    )).limit(8),

    // Confidential volunteer applications are NEVER searchable site-wide.
    Promise.resolve([] as Array<{id:number;title:string;description:string|null;location:string|null}>),

    db.select({
      id: communityProjectsTable.id,
      title: communityProjectsTable.title,
      description: communityProjectsTable.description,
      location: communityProjectsTable.location,
    }).from(communityProjectsTable).where(and(
      eq(communityProjectsTable.status, "active"),
      or(
        contains(communityProjectsTable.title, q),
        contains(communityProjectsTable.description, q),
        contains(communityProjectsTable.location, q),
      ),
    )).limit(8),

    db.select({
      id: featuredCausesTable.id,
      title: featuredCausesTable.title,
      description: featuredCausesTable.description,
      location: featuredCausesTable.location,
    }).from(featuredCausesTable).where(and(
      eq(featuredCausesTable.status, "active"),
      or(
        contains(featuredCausesTable.title, q),
        contains(featuredCausesTable.description, q),
        contains(featuredCausesTable.location, q),
      ),
    )).limit(8),

    db.select({
      id: charitiesTable.id,
      title: charitiesTable.name,
      description: charitiesTable.description,
    }).from(charitiesTable).where(and(
      eq(charitiesTable.isActive, true),
      or(contains(charitiesTable.name, q), contains(charitiesTable.description, q)),
    )).limit(8),
  ]);

  const cleanSnippet = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 180 ? normalized.slice(0, 179) + "…" : normalized;
  };

  res.json([
    ...news.map(item => ({
      type: "news",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: item.category,
      url: `/news/${item.id}`,
    })),
    ...discussions.map(item => ({
      type: "discussion",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: item.category,
      url: `/forum/${item.id}`,
    })),
    ...groups.map(item => ({
      type: "group",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: "Public group",
      url: `/groups/${item.id}`,
    })),
    ...minyans.map(item => ({
      type: "minyan",
      id: item.id,
      title: item.title,
      description: cleanSnippet([item.community, item.city, item.country].filter(Boolean).join(" · ")),
      meta: "Minyan",
      url: "/minyans",
    })),
    ...projects.map(item => ({
      type: "project",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: item.location || "Community project",
      url: "/community-projects",
    })),
    ...causes.map(item => ({
      type: "cause",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: item.location || "Featured cause",
      url: "/united",
    })),
    ...charities.map(item => ({
      type: "charity",
      id: item.id,
      title: item.title,
      description: cleanSnippet(item.description),
      meta: "Charity campaign",
      url: "/charity",
    })),
  ]);
});

export default router;
