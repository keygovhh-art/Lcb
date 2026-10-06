import type { Request, RequestHandler } from "express";

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

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!getSessionUserId(req)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  const userId = getSessionUserId(req);
  const role = getSessionUserRole(req);
  if (!userId || (role !== "admin" && role !== "moderator")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};
