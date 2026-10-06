import session from "express-session";
type QueryResult<Row = Record<string, unknown>> = { rows: Row[] };
type Queryable = {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
};

// No startup DDL, schema synchronization, timers, or fallback to memory.
// Provision this dedicated table with scripts/sql/session-store.sql before opting in.
export class PostgresSessionStore extends session.Store {
  constructor(private readonly pool: Queryable) {
    super();
  }

  private expiresAt(data: session.SessionData): Date {
    return data.cookie.expires
      ? new Date(data.cookie.expires)
      : new Date(Date.now() + (data.cookie.originalMaxAge ?? 30 * 24 * 60 * 60 * 1000));
  }

  override get(sid: string, callback: (err: unknown, data?: session.SessionData | null) => void): void {
    this.pool.query<{ sess: session.SessionData }>(
      "SELECT sess FROM public.app_sessions WHERE sid = $1 AND expire > CURRENT_TIMESTAMP",
      [sid],
    ).then(
      result => callback(null, result.rows[0]?.sess ?? null),
      error => callback(error),
    );
  }

  override set(sid: string, data: session.SessionData, callback?: (err?: unknown) => void): void {
    this.pool.query(
      `INSERT INTO public.app_sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [sid, JSON.stringify(data), this.expiresAt(data)],
    ).then(() => callback?.(), error => callback?.(error));
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.pool.query("DELETE FROM public.app_sessions WHERE sid = $1", [sid])
      .then(() => callback?.(), error => callback?.(error));
  }

  override touch(sid: string, data: session.SessionData, callback?: (err?: unknown) => void): void {
    this.pool.query(
      "UPDATE public.app_sessions SET expire = $2 WHERE sid = $1 AND expire > CURRENT_TIMESTAMP",
      [sid, this.expiresAt(data)],
    ).then(() => callback?.(), error => callback?.(error));
  }
}
