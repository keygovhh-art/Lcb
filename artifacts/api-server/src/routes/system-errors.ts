import { Router, type IRouter } from "express";
import { db, supportMessagesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "../middlewares/auth";
import { createRateLimiter } from "../middlewares/rate-limit";
import { notifyStaff } from "../lib/notify";

const router: IRouter = Router();

const systemErrorLimiter = createRateLimiter({
  name: "system-errors",
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many automatic error reports.",
});

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

router.post("/system-errors", systemErrorLimiter, async (req, res): Promise<void> => {
  const type = clean(req.body?.type, 60) || "unknown";
  const route = clean(req.body?.route, 300).split("?")[0].split("#")[0] || "/";
  const message = clean(req.body?.message, 1600) || "Unknown frontend error";
  const stack = clean(req.body?.stack, 5000);
  const componentStack = clean(req.body?.componentStack, 4000);
  const resource = clean(req.body?.resource, 500);
  const statusCode = clean(req.body?.statusCode, 10);
  const userAgent = clean(req.body?.userAgent, 500);

  const userId = getSessionUserId(req) ?? null;
  let reporter = "Automatic system reporter";
  let contact = "system@internal.invalid";

  if (userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user) {
      reporter = user.nickname || user.name || reporter;
      contact = user.email || user.phone || contact;
    }
  }

  const subject = `AUTO ERROR: ${type} on ${route}`.slice(0, 200);
  const details = [
    `Route: ${route}`,
    `Type: ${type}`,
    statusCode ? `Status: ${statusCode}` : "",
    resource ? `Resource: ${resource}` : "",
    `Message: ${message}`,
    userId ? `User ID: ${userId}` : "User: guest/unknown",
    userAgent ? `Device: ${userAgent}` : "",
    stack ? `Stack:\n${stack}` : "",
    componentStack ? `Component stack:\n${componentStack}` : "",
  ].filter(Boolean).join("\n\n");

  const [created] = await db.insert(supportMessagesTable).values({
    userId,
    name: reporter.slice(0, 120),
    email: contact.slice(0, 200),
    type: "system_error",
    subject,
    message: details.slice(0, 5000),
    status: "open",
  }).returning();

  await notifyStaff(subject, "/founder", "admin_system_error");
  res.status(201).json({ ok: true, id: created.id });
});

export default router;
