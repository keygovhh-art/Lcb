import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Never return these methods from public volunteers / help-request endpoints. */
export const memberContactMethodsTable = pgTable("member_contact_methods", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(), // volunteer or help
  primaryMethod: text("primary_method").notNull(), // phone, email, sms
  primaryValue: text("primary_value").notNull(),
  backupMethod: text("backup_method"), // optional; NEVER required
  backupValue: text("backup_value"),
  // This preference alone does NOT authorize a specific introduction.
  // Each side must consent again to the selected person in that case.
  mayConsiderSharing: text("may_consider_sharing").notNull().default("no"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  pk: primaryKey({ columns: [table.userId, table.purpose] }),
}));
export type MemberContactMethods = typeof memberContactMethodsTable.$inferSelect;
