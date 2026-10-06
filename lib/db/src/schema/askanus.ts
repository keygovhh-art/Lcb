import { pgTable, pgEnum, serial, text, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";

export const askanusStatusEnum = pgEnum("askanus_status", ["open", "in_progress", "closed"]);
export const askanusUrgencyEnum = pgEnum("askanus_urgency", ["low", "medium", "high", "critical"]);
export const askanusActivityTypeEnum = pgEnum("askanus_activity_type", ["update", "funds_received", "funds_promised", "contact", "status_change", "note"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);

export const askanuscases = pgTable("askanus_cases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: askanusStatusEnum("status").notNull().default("open"),
  urgency: askanusUrgencyEnum("urgency").notNull().default("medium"),
  category: text("category").notNull().default("General"),
  contactName: text("contact_name").notNull().default(""),
  deadline: text("deadline").notNull().default(""),
  goalAmount: numeric("goal_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  fundsPromised: numeric("funds_promised", { precision: 12, scale: 2 }).notNull().default("0"),
  fundsReceived: numeric("funds_received", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const caseActivityLog = pgTable("case_activity_log", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => askanuscases.id, { onDelete: "cascade" }).notNull(),
  date: text("date").notNull(),
  type: askanusActivityTypeEnum("type").notNull().default("note"),
  note: text("note").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const caseFollowups = pgTable("case_followups", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").references(() => askanuscases.id, { onDelete: "cascade" }).notNull(),
  date: text("date").notNull(),
  note: text("note").notNull(),
  dueDate: text("due_date"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const askanustasks = pgTable("askanus_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  caseTitle: text("case_title").notNull().default(""),
  deadline: text("deadline").notNull().default(""),
  completed: boolean("completed").notNull().default(false),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const askanusnotes = pgTable("askanus_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().default(1),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
