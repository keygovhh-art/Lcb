import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const minyansTable = pgTable("minyans", {
  id: serial("id").primaryKey(),
  synagogueName: text("synagogue_name").notNull(),
  community: text("community").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  address: text("address"),
  shacharis: text("shacharis").notNull(),
  mincha: text("mincha").notNull(),
  maariv: text("maariv").notNull(),
  notes: text("notes"),
  likes: integer("likes").notNull().default(0),
  status: text("status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMinyanSchema = createInsertSchema(minyansTable).omit({ id: true, createdAt: true });
export type InsertMinyan = z.infer<typeof insertMinyanSchema>;
export type Minyan = typeof minyansTable.$inferSelect;
