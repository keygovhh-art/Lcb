import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, getSessionUserId, getCurrentSessionUser } from "../middlewares/auth";

const router: IRouter = Router();
let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS site_copy_overrides (
          id BIGSERIAL PRIMARY KEY,
          page TEXT NOT NULL,
          lang VARCHAR(2) NOT NULL CHECK (lang IN ('en','yi')),
          source_text TEXT NOT NULL,
          published_value TEXT,
          draft_value TEXT,
          updated_by INTEGER,
          published_by INTEGER,
          version INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          published_at TIMESTAMPTZ,
          UNIQUE (page, lang, source_text)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS site_copy_history (
          id BIGSERIAL PRIMARY KEY,
          override_id BIGINT NOT NULL REFERENCES site_copy_overrides(id) ON DELETE CASCADE,
          previous_value TEXT,
          new_value TEXT,
          actor_id INTEGER NOT NULL,
          action VARCHAR(24) NOT NULL,
          version INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query("CREATE INDEX IF NOT EXISTS site_copy_history_override_idx ON site_copy_history (override_id, created_at DESC)");
      await pool.query("CREATE INDEX IF NOT EXISTS site_copy_overrides_lookup_idx ON site_copy_overrides (lang, page)");
    })().catch(err => {
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}

function validateKey(body: unknown): { page: string; lang: string; source: string } | null {
  if (!body || typeof body !== "object") return null;
  const item = body as Record<string, unknown>;
  const page = item.page;
  const lang = item.lang;
  const source = item.source;
  if (typeof page !== "string" || (page !== "*" && (!page.startsWith("/") || page.startsWith("//"))) || page.length > 300 || /[?#]/.test(page)) return null;
  if (lang !== "en" && lang !== "yi") return null;
  if (typeof source !== "string" || !source.trim() || source.length > 2500) return null;
  return { page, lang, source: source.trim() };
}

function validateValue(value: unknown): string | null {
  return typeof value === "string" && value.length <= 4000 ? value : null;
}

async function requirePublisher(req: any, res: any): Promise<number | null> {
  const user = await getCurrentSessionUser(req);
  if (!user || (user.role !== "admin" && user.role !== "moderator")) {
    res.status(403).json({ error: "Admin or staff access required to publish or restore changes" });
    return null;
  }
  return user.id;
}

router.get("/site-copy", async (req, res, next): Promise<void> => {
  try {
    const page = String(req.query.page ?? "");
    const lang = String(req.query.lang ?? "");
    if (!validateKey({ page, lang, source: "_" }) || page === "*") {
      res.status(400).json({ error: "Invalid page or language" });
      return;
    }
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT page, lang, source_text AS source, published_value AS value
         FROM site_copy_overrides
         WHERE lang = $1 AND page IN ('*', $2) AND published_value IS NOT NULL
         ORDER BY CASE WHEN page='*' THEN 0 ELSE 1 END, updated_at ASC`,
      [lang, page]
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/admin/site-copy", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    await ensureSchema();
    const lang = req.query.lang ? String(req.query.lang) : null;
    const page = req.query.page ? String(req.query.page) : null;
    const params: string[] = [];
    const filters: string[] = [];
    if (lang) {
      if (!["en","yi"].includes(lang)) { res.status(400).json({ error: "Invalid language" }); return; }
      params.push(lang); filters.push(`lang=$${params.length}`);
    }
    if (page) {
      if (page !== "*" && (!page.startsWith("/") || page.length > 300)) { res.status(400).json({ error: "Invalid page" }); return; }
      params.push(page); filters.push(`page IN ('*', $${params.length})`);
    }
    const { rows } = await pool.query(
      `SELECT id, page, lang, source_text AS source, published_value AS "publishedValue",
              draft_value AS "draftValue", updated_by AS "updatedBy",
              published_by AS "publishedBy", version, updated_at AS "updatedAt",
              published_at AS "publishedAt"
         FROM site_copy_overrides
         ${filters.length ? "WHERE " + filters.join(" AND ") : ""}
         ORDER BY updated_at DESC LIMIT 1000`, params
    );
    res.setHeader("Cache-Control", "no-store");
    res.json(rows);
  } catch (err) { next(err); }
});

router.put("/admin/site-copy", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const key = validateKey(req.body);
    const value = validateValue(req.body?.value);
    if (!key || value === null) { res.status(400).json({ error: "Invalid page/language/text; maximum 4,000 characters" }); return; }
    await ensureSchema();
    const { rows } = await pool.query(
      `INSERT INTO site_copy_overrides (page, lang, source_text, draft_value, updated_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (page,lang,source_text)
       DO UPDATE SET draft_value=excluded.draft_value, updated_by=excluded.updated_by, updated_at=NOW()
       RETURNING id, page, lang, source_text AS source,
                 published_value AS "publishedValue", draft_value AS "draftValue", version`,
      [key.page, key.lang, key.source, value, getSessionUserId(req)]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/publish", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const key = validateKey(req.body);
    if (!key) { res.status(400).json({ error: "Invalid text key" }); return; }
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: existing } = await client.query(
        "SELECT * FROM site_copy_overrides WHERE page=$1 AND lang=$2 AND source_text=$3 FOR UPDATE",
        [key.page, key.lang, key.source]
      );
      const current = existing[0];
      if (!current || current.draft_value === null) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "No saved draft for this text" });
        return;
      }
      const version = current.version + 1;
      const { rows } = await client.query(
        `UPDATE site_copy_overrides
           SET published_value=draft_value, published_by=$1, published_at=NOW(), version=$2, updated_at=NOW()
           WHERE id=$3 RETURNING id,page,lang,source_text AS source,
           published_value AS "publishedValue",draft_value AS "draftValue",version`,
        [actor, version, current.id]
      );
      await client.query(
        `INSERT INTO site_copy_history
           (override_id, previous_value, new_value, actor_id, action, version)
           VALUES ($1,$2,$3,$4,'publish',$5)`,
        [current.id, current.published_value, current.draft_value, actor, version]
      );
      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

router.get("/admin/site-copy/history/:id", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, previous_value AS "previousValue", new_value AS "newValue",
              actor_id AS "actorId", action, version, created_at AS "createdAt"
       FROM site_copy_history WHERE override_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/restore", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const id = Number(req.body?.id);
    const historyId = Number(req.body?.historyId);
    if (![id, historyId].every(n => Number.isSafeInteger(n) && n > 0)) {
      res.status(400).json({ error: "Invalid history reference" }); return;
    }
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = (await client.query("SELECT * FROM site_copy_overrides WHERE id=$1 FOR UPDATE", [id])).rows[0];
      const history = (await client.query("SELECT * FROM site_copy_history WHERE id=$1 AND override_id=$2", [historyId,id])).rows[0];
      if (!current || !history) {
        await client.query("ROLLBACK"); res.status(404).json({ error: "History record not found" }); return;
      }
      const version = current.version + 1;
      await client.query(
        `UPDATE site_copy_overrides SET published_value=$1, draft_value=$1,
         published_by=$2, published_at=NOW(), updated_at=NOW(), version=$3 WHERE id=$4`,
        [history.previous_value, actor, version, id]
      );
      await client.query(
        `INSERT INTO site_copy_history (override_id,previous_value,new_value,actor_id,action,version)
         VALUES ($1,$2,$3,$4,'restore',$5)`,
        [id,current.published_value,history.previous_value,actor,version]
      );
      await client.query("COMMIT");
      res.json({ ok: true, version });
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/reset", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const key = validateKey(req.body);
    if (!key) { res.status(400).json({ error: "Invalid text key" }); return; }
    await ensureSchema();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = (await client.query(
        "SELECT * FROM site_copy_overrides WHERE page=$1 AND lang=$2 AND source_text=$3 FOR UPDATE",
        [key.page,key.lang,key.source]
      )).rows[0];
      if (!current) { await client.query("ROLLBACK"); res.status(404).json({error:"Not found"}); return; }
      const version = current.version+1;
      await client.query(
        "UPDATE site_copy_overrides SET published_value=NULL,draft_value=NULL,updated_by=$1,published_by=$1,published_at=NOW(),updated_at=NOW(),version=$2 WHERE id=$3",
        [actor,version,current.id]
      );
      await client.query(
        `INSERT INTO site_copy_history (override_id,previous_value,new_value,actor_id,action,version)
         VALUES ($1,$2,NULL,$3,'reset',$4)`,
        [current.id,current.published_value,actor,version]
      );
      await client.query("COMMIT");
      res.json({ok:true,version});
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

export default router;
