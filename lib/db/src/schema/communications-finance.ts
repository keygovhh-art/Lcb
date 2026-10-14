import { pgTable, serial, integer, text, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { askanuscases, caseFollowups } from "./askanus";
import { communicationContacts, fundraisingCallReports } from "./communications-max";

/** A pledge is an obligation, not evidence of received funds. */
export const maxPledges = pgTable("max_pledges",{
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  caseId: integer("case_id").notNull().references(()=>askanuscases.id,{onDelete:"restrict"}),
  contactId: integer("contact_id").references(()=>communicationContacts.id,{onDelete:"set null"}),
  callReportId: integer("call_report_id").references(()=>fundraisingCallReports.id,{onDelete:"set null"}),
  amount: numeric("amount",{precision:12,scale:2}).notNull(),
  paidAmount: numeric("paid_amount",{precision:12,scale:2}).notNull().default("0"),
  status: text("status").notNull().default("open"),
  dueDate: text("due_date"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
},t=>[
  index("max_pledges_owner_case_idx").on(t.userId,t.caseId),
  index("max_pledges_contact_idx").on(t.contactId),
]);
/** Audited individual receipt reports, never substitute for processor verification. */
export const maxReceipts = pgTable("max_receipts",{
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  caseId: integer("case_id").notNull().references(()=>askanuscases.id,{onDelete:"restrict"}),
  contactId: integer("contact_id").references(()=>communicationContacts.id,{onDelete:"set null"}),
  pledgeId: integer("pledge_id").references(()=>maxPledges.id,{onDelete:"restrict"}),
  callReportId: integer("call_report_id").references(()=>fundraisingCallReports.id,{onDelete:"set null"}),
  amount: numeric("amount",{precision:12,scale:2}).notNull(),
  refundedAmount: numeric("refunded_amount",{precision:12,scale:2}).notNull().default("0"),
  method: text("method").notNull().default("other"),
  reference: text("reference").notNull().default(""),
  verification: text("verification").notNull().default("manually_reported"),
  requestId: text("request_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
},t=>[
  uniqueIndex("max_receipts_owner_request_unique").on(t.userId,t.requestId),
  index("max_receipts_owner_case_idx").on(t.userId,t.caseId),
  index("max_receipts_pledge_idx").on(t.pledgeId),
]);
/** One case follow-up may optionally be linked to one donor without duplication. */
export const maxFollowupContacts = pgTable("max_followup_contacts",{
  followupId: integer("followup_id").primaryKey().references(()=>caseFollowups.id,{onDelete:"cascade"}),
  userId: integer("user_id").notNull(),
  contactId: integer("contact_id").notNull().references(()=>communicationContacts.id,{onDelete:"cascade"}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
},t=>[index("max_followup_contacts_contact_idx").on(t.userId,t.contactId)]);

/** Accounting adjustments are immutable and never imply a bank/card refund was processed. */
export const maxReceiptRefunds = pgTable("max_receipt_refunds",{
  id:serial("id").primaryKey(),
  userId:integer("user_id").notNull(),
  receiptId:integer("receipt_id").notNull().references(()=>maxReceipts.id,{onDelete:"restrict"}),
  caseId:integer("case_id").notNull().references(()=>askanuscases.id,{onDelete:"restrict"}),
  amount:numeric("amount",{precision:12,scale:2}).notNull(),
  reason:text("reason").notNull(),
  requestId:text("request_id").notNull(),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},t=>[
  uniqueIndex("max_receipt_refunds_owner_request_unique").on(t.userId,t.requestId),
  index("max_receipt_refunds_receipt_idx").on(t.receiptId),
]);

/** Prevent duplicate monetary progress updates initiated from My Askanus. */
export const maxProgressEvents = pgTable("max_progress_events",{
  id:serial("id").primaryKey(),
  userId:integer("user_id").notNull(),
  caseId:integer("case_id").notNull().references(()=>askanuscases.id,{onDelete:"restrict"}),
  eventKind:text("event_kind").notNull(),
  amount:numeric("amount",{precision:12,scale:2}).notNull(),
  requestId:text("request_id").notNull(),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},t=>[
  uniqueIndex("max_progress_events_owner_request_unique").on(t.userId,t.requestId),
  index("max_progress_events_case_idx").on(t.caseId),
]);

/** Permanent private MAX history timeline: completed work, financial milestones,
 * reopening, edits and explicit deletions are EVENTS, not destructive state changes.
 * No foreign key to case/task/follow-up: parent closure/deletion cannot cascade history.
 * There is deliberately no UPDATE/DELETE API for these historical entries.
 */
export const maxHistoryEvents = pgTable("max_history_events",{
  id:serial("id").primaryKey(),
  userId:integer("user_id").notNull(),
  caseId:integer("case_id"),
  entityType:text("entity_type").notNull(),
  entityId:integer("entity_id").notNull(),
  action:text("action").notNull(),
  title:text("title").notNull(),
  details:text("details").notNull().default(""),
  happenedAt:timestamp("happened_at",{withTimezone:true}).defaultNow().notNull(),
},t=>[
  index("max_history_events_owner_time_idx").on(t.userId,t.happenedAt),
  index("max_history_events_owner_case_idx").on(t.userId,t.caseId),
  index("max_history_events_owner_entity_idx").on(t.userId,t.entityType,t.entityId),
]);
