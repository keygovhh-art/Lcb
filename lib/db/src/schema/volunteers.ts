import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const volunteerProfilesTable = pgTable("volunteer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  skills: text("skills").array().notNull().default([]),
  availability: text("availability").notNull(),
  bio: text("bio"),
  location: text("location").notNull(),
  areasOfInterest: text("areas_of_interest").array().notNull().default([]),
  labels: text("labels").array().notNull().default([]),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const helpRequestsTable = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  name: text("name").notNull(),
  contactInfo: text("contact_info").notNull(),
  location: text("location"),
  needType: text("need_type").notNull(),
  description: text("description").notNull(),
  urgency: text("urgency").notNull().default("medium"),
  isFeatured: boolean("is_featured").notNull().default(false),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVolunteerProfileSchema = createInsertSchema(volunteerProfilesTable).omit({ id: true, createdAt: true });
export type InsertVolunteerProfile = z.infer<typeof insertVolunteerProfileSchema>;
export type VolunteerProfile = typeof volunteerProfilesTable.$inferSelect;

export const insertHelpRequestSchema = createInsertSchema(helpRequestsTable).omit({ id: true, createdAt: true });
export type InsertHelpRequest = z.infer<typeof insertHelpRequestSchema>;
export type HelpRequest = typeof helpRequestsTable.$inferSelect;
