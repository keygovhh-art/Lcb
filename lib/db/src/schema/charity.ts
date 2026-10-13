import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const charitiesTable = pgTable("charities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  successStories: text("success_stories"),
  imageUrl: text("image_url"),
  goalAmount: integer("goal_amount").notNull().default(0),
  raisedAmount: integer("raised_amount").notNull().default(0),
  isTodaysFeatured: boolean("is_todays_featured").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  // Staged editorial workflow; legacy rows remain live after migration.
  publicationState: text("publication_state").notNull().default("live"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  featuredFrom: timestamp("featured_from", { withTimezone: true }),
  phoneNumber: text("phone_number"),
  phoneExtension: text("phone_extension"),
  phoneButtonText: text("phone_button_text"),
  donationUrl: text("donation_url"),
  linkButtonText: text("link_button_text"),
  buttonStyle: text("button_style").notNull().default("classic"),
  buttonLayout: text("button_layout").notNull().default("stacked"),
  nativeDonationEnabled: boolean("native_donation_enabled").notNull().default(false),
  nativeDonationButtonText: text("native_donation_button_text"),
  nativeDonationButtonStyle: text("native_donation_button_style").notNull().default("gold"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configuration ONLY. Do not store gateway secrets or donor payment details here. */
export const charityNativeDonationSettingsTable = pgTable("charity_native_donation_settings", {
  id: integer("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  defaultButtonText: text("default_button_text").notNull().default("Donate Securely"),
  minimumAmount: integer("minimum_amount").notNull().default(1),
  maximumAmount: integer("maximum_amount").notNull().default(10000),
  suggestedAmounts: text("suggested_amounts").notNull().default("18,36,72,180"),
  allowCustomAmount: boolean("allow_custom_amount").notNull().default(true),
  allowRecurring: boolean("allow_recurring").notNull().default(false),
  allowAnonymous: boolean("allow_anonymous").notNull().default(false),
  sendReceipt: boolean("send_receipt").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const donationsTable = pgTable("donations", {
  id: serial("id").primaryKey(),
  charityId: integer("charity_id").notNull(),
  amount: integer("amount").notNull(),
  donorName: text("donor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCharitySchema = createInsertSchema(charitiesTable).omit({ id: true, createdAt: true });
export type InsertCharity = z.infer<typeof insertCharitySchema>;
export type Charity = typeof charitiesTable.$inferSelect;

export const insertDonationSchema = createInsertSchema(donationsTable).omit({ id: true, createdAt: true });
export type InsertDonation = z.infer<typeof insertDonationSchema>;
export type Donation = typeof donationsTable.$inferSelect;
