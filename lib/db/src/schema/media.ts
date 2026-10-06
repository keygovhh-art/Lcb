import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const mediaAssetsTable = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
