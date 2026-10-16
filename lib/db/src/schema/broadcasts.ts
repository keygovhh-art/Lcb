import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  recipientGroup: text("recipient_group").notNull(),
  channel: text("channel").notNull().default("website"),
  recipientCount: integer("recipient_count").notNull().default(0),
  requestId:text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
},t=>[uniqueIndex("broadcasts_author_request_unique").on(t.authorId,t.requestId)]);

export type Broadcast = typeof broadcastsTable.$inferSelect;
