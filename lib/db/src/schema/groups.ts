import { pgTable, text, serial, timestamp, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  privacy: text("privacy").notNull().default("public"),
  password: text("password"),
  ownerId: integer("owner_id").notNull(),
  ownerName: text("owner_name").notNull(),
  imageUrl: text("image_url"),
  memberCount: integer("member_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  allowReplies: boolean("allow_replies").notNull().default(true),
  replyApproval: boolean("reply_approval").notNull().default(false),
  postApproval: boolean("post_approval").notNull().default(false),
  membersCanPost: boolean("members_can_post").notNull().default(true),
  membersCanReply: boolean("members_can_reply").notNull().default(true),
  showViewCounts: boolean("show_view_counts").notNull().default(true),
  allowDownvotes: boolean("allow_downvotes").notNull().default(false),
  platformFeatureOverrides: jsonb("platform_feature_overrides").$type<Record<string,boolean>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  groupId: integer("group_id").notNull(),
  role: text("role").notNull().default("member"),
  protectedByPlatform: boolean("protected_by_platform").notNull().default(false),
  status: text("status").notNull().default("approved"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupPostsTable = pgTable("group_posts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  groupId: integer("group_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  likes: integer("likes").notNull().default(0),
  views: integer("views").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  moderationStatus: text("moderation_status").notNull().default("approved"),
  isPinned: boolean("is_pinned").notNull().default(false),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});


/** Logged-in distinct viewers; no tracking cookies, IP logging, or fake traffic. */
export const groupPostViewsTable = pgTable("group_post_views", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => groupPostsTable.id, {onDelete:"cascade"}),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at", {withTimezone:true}).notNull().defaultNow(),
}, t => [uniqueIndex("group_post_views_post_user_unique").on(t.postId,t.userId)]);

export const groupPostDownvotesTable = pgTable("group_post_downvotes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => groupPostsTable.id,{onDelete:"cascade"}),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [uniqueIndex("group_post_downvotes_post_user_unique").on(t.postId,t.userId)]);

export const groupPostRepliesTable = pgTable("group_post_replies", {
  id: serial("id").primaryKey(),
  parentReplyId: integer("parent_reply_id"),
  deletedAt: timestamp("deleted_at",{withTimezone:true}),
  postId: integer("post_id").notNull().references(() => groupPostsTable.id,{onDelete:"cascade"}),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  moderationStatus: text("moderation_status").notNull().default("approved"),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});

export const groupReportsTable = pgTable("group_post_reports", {
  id: serial("id").primaryKey(),
  // Preserve reports even if the source post or group is later deleted.
  groupId: integer("group_id").notNull(),
  postId: integer("post_id").notNull(),
  reporterId: integer("reporter_id").notNull(),
  reason: text("reason").notNull(),
  postExcerpt: text("post_excerpt").notNull().default(""),
  // NEVER expose toStaff to group owners or group admins, even if group was a recipient.
  toGroup: boolean("to_group").notNull(),
  toStaff: boolean("to_staff").notNull(),
  groupStatus: text("group_status").notNull().default("open"),
  staffStatus: text("staff_status").notNull().default("open"),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [uniqueIndex("group_reports_post_reporter_unique").on(t.postId,t.reporterId)]);

export const insertGroupSchema = createInsertSchema(groupsTable).omit({ id: true, createdAt: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;

export const insertGroupMemberSchema = createInsertSchema(groupMembersTable).omit({ id: true, joinedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;

export const insertGroupPostSchema = createInsertSchema(groupPostsTable).omit({ id: true, createdAt: true });
export type InsertGroupPost = z.infer<typeof insertGroupPostSchema>;
export type GroupPost = typeof groupPostsTable.$inferSelect;

/** Only a real platform super admin can grant private-group access.
 * The database role here is separate from group member administration.
 */
export const groupStaffAccessTable = pgTable("group_staff_access", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  groupId: integer("group_id").notNull(),
  canViewPrivate: boolean("can_view_private").notNull().default(false),
  canModerate: boolean("can_moderate").notNull().default(false),
  grantedBy: integer("granted_by").notNull(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("group_staff_access_user_group_unique").on(t.userId,t.groupId)]);

export const groupAccessAuditTable=pgTable("group_access_audit",{
  id:serial("id").primaryKey(),
  actorId:integer("actor_id").notNull(),
  targetUserId:integer("target_user_id"),
  groupId:integer("group_id"),
  action:text("action").notNull(),
  details:jsonb("details").$type<Record<string,unknown>>().notNull().default({}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
});
