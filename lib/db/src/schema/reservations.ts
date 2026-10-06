import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const reservationsTable = pgTable("reservations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  reservationDate: text("reservation_date").notNull(),
  reservationTime: text("reservation_time").notNull(),
  purpose: text("purpose").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reservation = typeof reservationsTable.$inferSelect;
