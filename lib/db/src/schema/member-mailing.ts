import { pgTable, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Private member-supplied postal address. Never join into public user responses. */
export const memberMailingTable = pgTable("member_mailing_preferences", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  recipient: text("recipient").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").notNull().default("US"),
  uspsConsent: boolean("usps_consent").notNull().default(false),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  addressUpdatedAt: timestamp("address_updated_at", { withTimezone: true }).notNull().defaultNow(),
  mailingHold: boolean("mailing_hold").notNull().default(false),
  adminNote: text("admin_note"),
});
export type MemberMailing = typeof memberMailingTable.$inferSelect;
