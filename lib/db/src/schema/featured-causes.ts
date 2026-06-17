import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const featuredCausesTable = pgTable("featured_causes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  organizerName: text("organizer_name"),
  goalAmount: numeric("goal_amount", { precision: 12, scale: 2 }),
  amountRaised: numeric("amount_raised", { precision: 12, scale: 2 }).notNull().default("0"),
  supporterCount: integer("supporter_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  imageUrl: text("image_url"),
  location: text("location"),
  deadline: text("deadline"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featuredCauseSupportersTable = pgTable("featured_cause_supporters", {
  id: serial("id").primaryKey(),
  causeId: integer("cause_id").notNull(),
  name: text("name").notNull(),
  pledgeType: text("pledge_type").notNull().default("volunteer"),
  pledgeAmount: numeric("pledge_amount", { precision: 10, scale: 2 }),
  message: text("message"),
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const causeSubmissionsTable = pgTable("cause_submissions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  submittedBy: text("submitted_by").notNull(),
  location: text("location"),
  urgency: text("urgency").notNull().default("normal"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeaturedCauseSchema = createInsertSchema(featuredCausesTable).omit({ id: true, createdAt: true });
export type InsertFeaturedCause = z.infer<typeof insertFeaturedCauseSchema>;
export type FeaturedCause = typeof featuredCausesTable.$inferSelect;

export const insertFeaturedCauseSupporterSchema = createInsertSchema(featuredCauseSupportersTable).omit({ id: true, createdAt: true });
export type InsertFeaturedCauseSupporter = z.infer<typeof insertFeaturedCauseSupporterSchema>;
export type FeaturedCauseSupporter = typeof featuredCauseSupportersTable.$inferSelect;

export const insertCauseSubmissionSchema = createInsertSchema(causeSubmissionsTable).omit({ id: true, createdAt: true });
export type InsertCauseSubmission = z.infer<typeof insertCauseSubmissionSchema>;
export type CauseSubmission = typeof causeSubmissionsTable.$inferSelect;
