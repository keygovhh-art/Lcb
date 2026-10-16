import { pgTable, bigserial, integer, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { broadcastsTable } from "./broadcasts";

// Website-only storage. A future hotline IVR adapter may read this with a
// properly verified per-member identity; no outbound calls or SMS are sent.
export const hotlineMailboxEntries = pgTable("hotline_mailbox_entries",{
  id:bigserial("id",{mode:"number"}).primaryKey(),
  broadcastId:integer("broadcast_id").notNull().references(()=>broadcastsTable.id,{onDelete:"restrict"}),
  userId:integer("user_id").notNull(),
  subject:text("subject").notNull(),
  message:text("message").notNull(),
  isRead:boolean("is_read").notNull().default(false),
  listenedAt:timestamp("listened_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  uniqueIndex("hotline_mailbox_unique_delivery_idx").on(table.broadcastId,table.userId),
  index("hotline_mailbox_recipient_idx").on(table.userId,table.isRead,table.createdAt),
]);
