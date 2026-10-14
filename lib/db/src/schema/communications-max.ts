import { pgTable, serial, text, integer, timestamp, numeric, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";
import { askanuscases, caseFollowups } from "./askanus";

/** A private address book: nothing here is shared with a campaign by default. */
export const communicationContacts = pgTable("communication_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
  organization: text("organization").notNull().default(""),
  city: text("city").notNull().default(""),
  tags: text("tags").notNull().default(""),

  doNotCall: boolean("do_not_call").notNull().default(false),
  preferredTimezone: text("preferred_timezone").notNull().default("America/New_York"),
  preferredHours: text("preferred_hours").notNull().default(""),
  contactRole: text("contact_role").notNull().default("donor"),
  relationshipNotes: text("relationship_notes").notNull().default(""),
  optOutReason: text("opt_out_reason").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [
  index("communication_contacts_user_idx").on(table.userId),
]);

/** One idempotent, manually entered call outcome. No actual provider call is implied. */
export const fundraisingCallReports = pgTable("fundraising_call_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  caseId: integer("case_id").notNull().references(() => askanuscases.id, { onDelete: "restrict" }),
  contactId: integer("contact_id").references(() => communicationContacts.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  outcome: text("outcome").notNull(),
  observedMood: text("observed_mood").notNull().default("neutral"),
  moneyKind: text("money_kind").notNull().default("none"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note").notNull().default(""),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("fundraising_call_reports_owner_request_unique").on(table.userId, table.requestId),
  index("fundraising_call_reports_owner_created_idx").on(table.userId, table.createdAt),
  index("fundraising_call_reports_case_idx").on(table.caseId),
]);
/** Append-only owner-scoped audit of donor reconsent OR an owner decision; never conflate them. */
export const maxContactConsents = pgTable("max_contact_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contactId: integer("contact_id").notNull().references(() => communicationContacts.id,{onDelete:"restrict"}),
  action: text("action").notNull().default("reconsent"),
  method: text("method").notNull(),
  evidence: text("evidence").notNull(),
  priorOptOutReason: text("prior_opt_out_reason").notNull().default(""),
  consentAt: timestamp("consent_at").notNull(),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [
  uniqueIndex("max_contact_consents_owner_request_unique").on(table.userId, table.requestId),
  index("max_contact_consents_owner_contact_idx").on(table.userId, table.contactId),
]);

/** MAX per-owner in-app reminder snoozes. The original follow-up date is never overwritten. */
export const maxReminderSnoozes = pgTable("max_reminder_snoozes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  followupId: integer("followup_id").notNull().references(() => caseFollowups.id, {onDelete:"cascade"}),
  snoozedUntil: timestamp("snoozed_until", {withTimezone:true}).notNull(),
  updatedAt: timestamp("updated_at", {withTimezone:true}).defaultNow().notNull(),
}, table => [
  uniqueIndex("max_reminder_snoozes_owner_followup_unique").on(table.userId,table.followupId),
  index("max_reminder_snoozes_owner_until_idx").on(table.userId,table.snoozedUntil),
]);
