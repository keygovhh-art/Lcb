import { pgTable, serial, text, integer, timestamp, numeric, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";
import { askanuscases } from "./askanus";

/** A private address book: nothing here is shared with a campaign by default. */
export const communicationContacts = pgTable("communication_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  notes: text("notes").notNull().default(""),
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