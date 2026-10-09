import { db, memberContactMethodsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type ContactMethod = "phone" | "email" | "sms";
export type ContactSelection = {
  primaryMethod: ContactMethod;
  primaryValue: string;
  backupMethod: ContactMethod | null;
  backupValue: string | null;
  mayConsiderSharing: "yes" | "no";
};
export type ContactPoint = { method: ContactMethod; value: string };

const validMethods = new Set<ContactMethod>(["phone","email","sms"]);

export function parseContactSelection(raw: unknown): { value: ContactSelection | null; error?: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { value:null, error:"Choose at least one contact method" };
  const v = raw as Record<string, unknown>;
  const main = String(v.primaryMethod || "") as ContactMethod;
  const backup = v.backupMethod ? String(v.backupMethod) as ContactMethod : null;
  const primaryValue = typeof v.primaryValue === "string" ? v.primaryValue.trim() : "";
  const backupValue = typeof v.backupValue === "string" ? v.backupValue.trim() : null;
  if (!validMethods.has(main)) return { value:null,error:"Choose phone, email or text for the primary contact method" };
  if (backup && (!validMethods.has(backup) || backup === main)) {
    return { value:null,error:"The optional backup must use a different contact method" };
  }
  if (!!backup !== !!backupValue) return { value:null,error:"Provide a contact value when choosing a backup" };
  const validPoint = (method: ContactMethod, value: string) => {
    if (value.length > 200 || !value) return false;
    if (method === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return /^\+?[0-9() .-]{7,25}$/.test(value) && value.replace(/\D/g,"").length >= 7 &&
      value.replace(/\D/g,"").length <= 15;
  };
  if (!validPoint(main,primaryValue) || (backup && !validPoint(backup,backupValue!))) {
    return {value:null,error:"Enter a valid email address or phone number for each selected method"};
  }
  if (v.mayConsiderSharing !== "yes" && v.mayConsiderSharing !== "no") {
    return {value:null,error:"Choose whether Gavhah may ask to disclose your details after mutual approval"};
  }
  return { value: {
    primaryMethod: main,
    primaryValue: main === "email" ? primaryValue.toLowerCase() : primaryValue,
    backupMethod: backup,
    backupValue: backup === "email" && backupValue ? backupValue.toLowerCase() : backupValue,
    mayConsiderSharing: v.mayConsiderSharing,
  }};
}

export async function getContactSelection(userId: number, purpose: "volunteer" | "help"): Promise<ContactSelection | null> {
  const [row] = await db.select().from(memberContactMethodsTable)
    .where(and(eq(memberContactMethodsTable.userId,userId),eq(memberContactMethodsTable.purpose,purpose)));
  if (!row) return null;
  const parsed = parseContactSelection(row);
  return parsed.value;
}

export function pointFor(selection: ContactSelection, choice: "primary" | "backup" = "primary"): ContactPoint | null {
  if (choice === "backup") {
    return selection.backupMethod && selection.backupValue
      ? {method:selection.backupMethod,value:selection.backupValue} : null;
  }
  return {method:selection.primaryMethod,value:selection.primaryValue};
}

export function saveContactValues(userId: number, purpose: "volunteer" | "help", selection: ContactSelection) {
  return {userId,purpose,...selection,updatedAt:new Date()};
}
