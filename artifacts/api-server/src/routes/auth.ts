import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/crypto";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    userRole?: string;
  }
}

const router = Router();

function safeUser<T extends { passwordHash?: unknown }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user as T & { passwordHash?: unknown };
  return safe;
}

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "User not found" });
    return;
  }
  res.json(safeUser(user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier: string; password: string };
  if (!identifier || !password) {
    res.status(400).json({ error: "Email/phone and password are required" });
    return;
  }

  const isEmail = identifier.includes("@");
  const [user] = await db.select().from(usersTable).where(
    isEmail ? eq(usersTable.email, identifier.toLowerCase().trim())
            : eq(usersTable.phone, identifier.trim())
  );

  if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }
  if (user.status === "banned") { res.status(403).json({ error: "This account has been banned" }); return; }
  if (user.status === "suspended") { res.status(403).json({ error: "This account is suspended" }); return; }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }

  req.session.userId = user.id;
  req.session.userRole = user.role;
  res.json({ user: safeUser(user) });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => { res.json({ ok: true }); });
});

export { hashPassword };
export default router;
