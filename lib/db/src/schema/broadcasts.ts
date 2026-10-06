import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const broadcastsTable = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  recipientGroup: text("recipient_group").notNull(),
  channel: text("channel").notNull().default("website"),
  recipientCount: integer("recipient_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Broadcast = typeof broadcastsTable.$inferSelect;
