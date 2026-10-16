import {pgTable,bigserial,integer,text,timestamp,uniqueIndex,index} from "drizzle-orm/pg-core";
import {broadcastsTable} from "./broadcasts";
import {usersTable} from "./users";

/** Server delivered mailbox item. NOT proof of an outbound call, SMS, or audio playback. */
export const hotlineMailboxItems=pgTable("hotline_mailbox_items",{
 id:bigserial("id",{mode:"number"}).primaryKey(),
 broadcastId:integer("broadcast_id").notNull().references(()=>broadcastsTable.id,{onDelete:"restrict"}),
 userId:integer("user_id").notNull().references(()=>usersTable.id,{onDelete:"restrict"}),
 subject:text("subject").notNull(),
 message:text("message").notNull(),
 audioUrl:text("audio_url"),
 readAt:timestamp("read_at",{withTimezone:true}),
 createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
 uniqueIndex("hotline_mailbox_broadcast_member_unique").on(t.broadcastId,t.userId),
 index("hotline_mailbox_owner_idx").on(t.userId,t.createdAt),
]);
