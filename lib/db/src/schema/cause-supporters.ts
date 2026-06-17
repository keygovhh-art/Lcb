import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const causeSupportersTable = pgTable("cause_supporters", {
  id: serial("id").primaryKey(),
  causeType: text("cause_type").notNull(),
  name: text("name").notNull(),
  pledgeType: text("pledge_type").notNull().default("volunteer"),
  pledgeAmount: numeric("pledge_amount", { precision: 10, scale: 2 }),
  message: text("message"),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCauseSupporterSchema = createInsertSchema(causeSupportersTable).omit({ id: true, createdAt: true });
export type InsertCauseSupporter = z.infer<typeof insertCauseSupporterSchema>;
export type CauseSupporter = typeof causeSupportersTable.$inferSelect;
