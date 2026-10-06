import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

export const entityLikesTable = pgTable("entity_likes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  unique("entity_likes_user_entity_unique").on(t.userId, t.entityType, t.entityId),
]);

export type EntityLike = typeof entityLikesTable.$inferSelect;
