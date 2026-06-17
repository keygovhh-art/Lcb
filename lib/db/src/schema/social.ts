import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  entityTitle: text("entity_title").notNull().default(""),
  entityUrl: text("entity_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.userId, t.entityType, t.entityId)]);

export const savedItemsTable = pgTable("saved_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  contentType: text("content_type").notNull(),
  contentId: integer("content_id").notNull(),
  contentTitle: text("content_title").notNull().default(""),
  contentUrl: text("content_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [unique().on(t.userId, t.contentType, t.contentId)]);

export type Follow = typeof followsTable.$inferSelect;
export type SavedItem = typeof savedItemsTable.$inferSelect;
