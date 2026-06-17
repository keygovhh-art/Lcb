import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const communityProjectsTable = pgTable("community_projects", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("project"),
  organizerName: text("organizer_name").notNull(),
  location: text("location"),
  status: text("status").notNull().default("active"),
  goalDescription: text("goal_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectMembersTable = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("supporter"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommunityProjectSchema = createInsertSchema(communityProjectsTable).omit({ id: true, createdAt: true });
export type InsertCommunityProject = z.infer<typeof insertCommunityProjectSchema>;
export type CommunityProject = typeof communityProjectsTable.$inferSelect;

export const insertProjectMemberSchema = createInsertSchema(projectMembersTable).omit({ id: true, createdAt: true });
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembersTable.$inferSelect;
