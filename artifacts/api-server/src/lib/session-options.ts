import type { SessionOptions } from "express-session";

// Keep Replit's current behavior; Vercel must never use per-instance memory.
export function sessionOptions(env: NodeJS.ProcessEnv): SessionOptions {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is required");
  const store = env.SESSION_STORE ?? (env.VERCEL === "1" ? "postgres" : "memory");
  if (store !== "postgres" && store !== "memory") {
    throw new Error("SESSION_STORE must be postgres or memory");
  }
  if (env.VERCEL === "1" && store !== "postgres") {
    throw new Error("Vercel requires SESSION_STORE=postgres");
  }
  if (env.SESSION_COOKIE_SECURE && !["true", "false"].includes(env.SESSION_COOKIE_SECURE)) {
    throw new Error("SESSION_COOKIE_SECURE must be true or false");
  }
  if (env.VERCEL === "1" && env.SESSION_COOKIE_SECURE === "false") {
    throw new Error("Vercel requires secure session cookies");
  }
  return {
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.VERCEL === "1" || env.SESSION_COOKIE_SECURE === "true",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  };
}

export function usesPostgresSessions(env: NodeJS.ProcessEnv): boolean {
  return (env.SESSION_STORE ?? (env.VERCEL === "1" ? "postgres" : "memory")) === "postgres";
}
