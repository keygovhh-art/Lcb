import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

type SessionIdentity = {
  userId?: number;
  userRole?: string;
};

function identity(req: Request): SessionIdentity {
  return req.session as typeof req.session & SessionIdentity;
}

export function getSessionUserId(req: Request): number | undefined {
  return identity(req).userId;
}

export function getSessionUserRole(req: Request): string | undefined {
  return identity(req).userRole;
}

export async function getCurrentSessionUser(req: Request) {
  const userId = getSessionUserId(req);
  if (!userId) return null;

  const [user] = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    status: usersTable.status,
  }).from(usersTable).where(eq(usersTable.id, userId));

  if (!user || user.status === "banned" || user.status === "suspended") {
    return null;
  }

  identity(req).userRole = user.role;
  return user;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = await getCurrentSessionUser(req);
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const user = await getCurrentSessionUser(req);
    if (!user || (user.role !== "admin" && user.role !== "moderator" && user.role !== "super_admin")) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
