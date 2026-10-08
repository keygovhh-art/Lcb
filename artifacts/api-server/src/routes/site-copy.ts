import { Router, type IRouter, type RequestHandler } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, getSessionUserId, getCurrentSessionUser } from "../middlewares/auth";

const router: IRouter = Router();

const FALLBACK_OVERRIDE_TYPE = "__site_copy_override__";
const FALLBACK_HISTORY_TYPE = "__site_copy_history__";
const FALLBACK_NAME = "Gavhah Site Copy";
const FALLBACK_EMAIL = "site-copy@internal.invalid";

type CopyKey = { page: string; lang: "en" | "yi"; source: string };
type CopyState = {
  publishedValue: string | null;
  draftValue: string | null;
  updatedBy: number | null;
  publishedBy: number | null;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
};
type HistoryState = {
  overrideId: number;
  previousValue: string | null;
  newValue: string | null;
  actorId: number;
  action: "publish" | "restore" | "reset";
  version: number;
  createdAt: string;
};

const requireSameOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (!origin) { next(); return; }
  try {
    const parsed = new URL(origin);
    const host = req.get("x-forwarded-host") || req.get("host");
    if (parsed.host !== host) {
      res.status(403).json({ error: "Invalid request origin" });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Invalid request origin" });
  }
};

let storagePromise: Promise<"native" | "fallback"> | null = null;

function ensureStorage(): Promise<"native" | "fallback"> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const { rows } = await pool.query(
        "SELECT to_regclass('public.site_copy_overrides') AS overrides, to_regclass('public.site_copy_history') AS history"
      );
      return rows[0]?.overrides && rows[0]?.history ? "native" : "fallback";
    })().catch(err => {
      storagePromise = null;
      throw err;
    });
  }
  return storagePromise;
}

function validateKey(body: unknown): CopyKey | null {
  if (!body || typeof body !== "object") return null;
  const item = body as Record<string, unknown>;
  const page = item.page;
  const lang = item.lang;
  const source = item.source;
  if (
    typeof page !== "string" ||
    (page !== "*" && (!page.startsWith("/") || page.startsWith("//"))) ||
    page.length > 300 ||
    /[?#]/.test(page)
  ) return null;
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

function fallbackSubject(key: CopyKey) {
  return JSON.stringify([key.page, key.lang, key.source]);
}

function parseFallbackKey(subject: unknown): CopyKey | null {
  try {
    const parsed = JSON.parse(String(subject));
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    return validateKey({ page: parsed[0], lang: parsed[1], source: parsed[2] });
  } catch {
    return null;
  }
}

function parseCopyState(message: unknown): CopyState | null {
  try {
    const parsed = JSON.parse(String(message)) as Partial<CopyState>;
    return {
      publishedValue: typeof parsed.publishedValue === "string" ? parsed.publishedValue : null,
      draftValue: typeof parsed.draftValue === "string" ? parsed.draftValue : null,
      updatedBy: Number.isInteger(parsed.updatedBy) ? Number(parsed.updatedBy) : null,
      publishedBy: Number.isInteger(parsed.publishedBy) ? Number(parsed.publishedBy) : null,
      version: Number.isInteger(parsed.version) && Number(parsed.version) >= 0 ? Number(parsed.version) : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      publishedAt: typeof parsed.publishedAt === "string" ? parsed.publishedAt : null,
    };
  } catch {
    return null;
  }
}

function parseHistoryState(message: unknown): HistoryState | null {
  try {
    const parsed = JSON.parse(String(message)) as Partial<HistoryState>;
    if (
      !Number.isInteger(parsed.overrideId) ||
      !Number.isInteger(parsed.actorId) ||
      !Number.isInteger(parsed.version) ||
      !["publish", "restore", "reset"].includes(String(parsed.action))
    ) return null;
    return {
      overrideId: Number(parsed.overrideId),
      previousValue: typeof parsed.previousValue === "string" ? parsed.previousValue : null,
      newValue: typeof parsed.newValue === "string" ? parsed.newValue : null,
      actorId: Number(parsed.actorId),
      action: parsed.action as HistoryState["action"],
      version: Number(parsed.version),
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

async function getFallbackOverride(key: CopyKey, client: any = pool) {
  const { rows } = await client.query(
    `SELECT id, subject, message, created_at
       FROM support_messages
       WHERE type=$1 AND subject=$2
       ORDER BY id DESC LIMIT 1`,
    [FALLBACK_OVERRIDE_TYPE, fallbackSubject(key)]
  );
  if (!rows[0]) return null;
  const state = parseCopyState(rows[0].message);
  return state ? { id: Number(rows[0].id), key, state } : null;
}

async function insertFallbackHistory(client: any, history: HistoryState) {
  await client.query(
    `INSERT INTO support_messages
      (user_id, name, email, type, subject, message, status)
     VALUES ($1,$2,$3,$4,$5,$6,'resolved')`,
    [
      history.actorId,
      FALLBACK_NAME,
      FALLBACK_EMAIL,
      FALLBACK_HISTORY_TYPE,
      String(history.overrideId),
      JSON.stringify(history),
    ]
  );
}

function serializeFallbackRow(row: any) {
  const key = parseFallbackKey(row.subject);
  const state = parseCopyState(row.message);
  if (!key || !state) return null;
  return {
    id: Number(row.id),
    page: key.page,
    lang: key.lang,
    source: key.source,
    publishedValue: state.publishedValue,
    draftValue: state.draftValue,
    updatedBy: state.updatedBy,
    publishedBy: state.publishedBy,
    version: state.version,
    updatedAt: state.updatedAt,
    publishedAt: state.publishedAt,
  };
}

router.get("/site-copy", async (req, res, next): Promise<void> => {
  try {
    const page = String(req.query.page ?? "");
    const lang = String(req.query.lang ?? "");
    if (!validateKey({ page, lang, source: "_" }) || page === "*") {
      res.status(400).json({ error: "Invalid page or language" });
      return;
    }

    const storage = await ensureStorage();
    if (storage === "native") {
      const { rows } = await pool.query(
        `SELECT page, lang, source_text AS source, published_value AS value
           FROM site_copy_overrides
           WHERE lang = $1 AND page IN ('*', $2) AND published_value IS NOT NULL
           ORDER BY CASE WHEN page='*' THEN 0 ELSE 1 END, updated_at ASC`,
        [lang, page]
      );
      res.setHeader("Cache-Control", "no-store");
      res.json(rows);
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, subject, message FROM support_messages WHERE type=$1 ORDER BY id ASC",
      [FALLBACK_OVERRIDE_TYPE]
    );
    const serialized = rows
      .map(serializeFallbackRow)
      .filter(Boolean)
      .filter((row: any) => row.lang === lang && (row.page === "*" || row.page === page) && row.publishedValue !== null)
      .sort((a: any, b: any) => (a.page === "*" ? 0 : 1) - (b.page === "*" ? 0 : 1))
      .map((row: any) => ({ page: row.page, lang: row.lang, source: row.source, value: row.publishedValue }));

    res.setHeader("Cache-Control", "no-store");
    res.json(serialized);
  } catch (err) { next(err); }
});

router.get("/admin/site-copy", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const lang = req.query.lang ? String(req.query.lang) : null;
    const page = req.query.page ? String(req.query.page) : null;
    if (lang && !["en","yi"].includes(lang)) { res.status(400).json({ error: "Invalid language" }); return; }
    if (page && page !== "*" && (!page.startsWith("/") || page.length > 300)) { res.status(400).json({ error: "Invalid page" }); return; }

    const storage = await ensureStorage();
    if (storage === "native") {
      const params: string[] = [];
      const filters: string[] = [];
      if (lang) { params.push(lang); filters.push(`lang=$${params.length}`); }
      if (page) { params.push(page); filters.push(`page IN ('*', $${params.length})`); }
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
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, subject, message FROM support_messages WHERE type=$1 ORDER BY id DESC LIMIT 1500",
      [FALLBACK_OVERRIDE_TYPE]
    );
    const result = rows
      .map(serializeFallbackRow)
      .filter(Boolean)
      .filter((row: any) => (!lang || row.lang === lang) && (!page || row.page === "*" || row.page === page))
      .sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 1000);

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (err) { next(err); }
});

router.put("/admin/site-copy", requireSameOrigin, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const key = validateKey(req.body);
    const value = validateValue(req.body?.value);
    if (!key || value === null) { res.status(400).json({ error: "Invalid page/language/text; maximum 4,000 characters" }); return; }
    const actor = getSessionUserId(req)!;
    const storage = await ensureStorage();

    if (storage === "native") {
      const { rows } = await pool.query(
        `INSERT INTO site_copy_overrides (page, lang, source_text, draft_value, updated_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (page,lang,source_text)
         DO UPDATE SET draft_value=excluded.draft_value, updated_by=excluded.updated_by, updated_at=NOW()
         RETURNING id, page, lang, source_text AS source,
                   published_value AS "publishedValue", draft_value AS "draftValue", version`,
        [key.page, key.lang, key.source, value, actor]
      );
      res.json(rows[0]);
      return;
    }

    const current = await getFallbackOverride(key);
    const now = new Date().toISOString();
    const state: CopyState = current?.state ?? {
      publishedValue: null,
      draftValue: null,
      updatedBy: null,
      publishedBy: null,
      version: 0,
      updatedAt: now,
      publishedAt: null,
    };
    state.draftValue = value;
    state.updatedBy = actor;
    state.updatedAt = now;

    if (current) {
      await pool.query(
        "UPDATE support_messages SET message=$1, user_id=$2 WHERE id=$3",
        [JSON.stringify(state), actor, current.id]
      );
      res.json({ id: current.id, page: key.page, lang: key.lang, source: key.source, ...state });
    } else {
      const { rows } = await pool.query(
        `INSERT INTO support_messages
          (user_id,name,email,type,subject,message,status)
         VALUES ($1,$2,$3,$4,$5,$6,'resolved') RETURNING id`,
        [actor, FALLBACK_NAME, FALLBACK_EMAIL, FALLBACK_OVERRIDE_TYPE, fallbackSubject(key), JSON.stringify(state)]
      );
      res.json({ id: Number(rows[0].id), page: key.page, lang: key.lang, source: key.source, ...state });
    }
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/publish", requireSameOrigin, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const key = validateKey(req.body);
    if (!key) { res.status(400).json({ error: "Invalid text key" }); return; }
    const storage = await ensureStorage();

    if (storage === "native") {
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
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await getFallbackOverride(key, client);
      if (!current || current.state.draftValue === null) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "No saved draft for this text" });
        return;
      }
      const previous = current.state.publishedValue;
      const state: CopyState = {
        ...current.state,
        publishedValue: current.state.draftValue,
        publishedBy: actor,
        version: current.state.version + 1,
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      };
      await client.query("UPDATE support_messages SET message=$1,user_id=$2 WHERE id=$3", [JSON.stringify(state), actor, current.id]);
      await insertFallbackHistory(client, {
        overrideId: current.id,
        previousValue: previous,
        newValue: state.publishedValue,
        actorId: actor,
        action: "publish",
        version: state.version,
        createdAt: new Date().toISOString(),
      });
      await client.query("COMMIT");
      res.json({ id: current.id, page: key.page, lang: key.lang, source: key.source, ...state });
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

router.get("/admin/site-copy/history/:id", requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid ID" }); return; }
    const storage = await ensureStorage();

    if (storage === "native") {
      const { rows } = await pool.query(
        `SELECT id, previous_value AS "previousValue", new_value AS "newValue",
                actor_id AS "actorId", action, version, created_at AS "createdAt"
         FROM site_copy_history WHERE override_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]
      );
      res.json(rows);
      return;
    }

    const { rows } = await pool.query(
      "SELECT id,message FROM support_messages WHERE type=$1 AND subject=$2 ORDER BY id DESC LIMIT 100",
      [FALLBACK_HISTORY_TYPE, String(id)]
    );
    const result = rows.map((row: any) => {
      const state = parseHistoryState(row.message);
      return state ? {
        id: Number(row.id),
        previousValue: state.previousValue,
        newValue: state.newValue,
        actorId: state.actorId,
        action: state.action,
        version: state.version,
        createdAt: state.createdAt,
      } : null;
    }).filter(Boolean);
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/restore", requireSameOrigin, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const id = Number(req.body?.id);
    const historyId = Number(req.body?.historyId);
    if (![id, historyId].every(n => Number.isSafeInteger(n) && n > 0)) {
      res.status(400).json({ error: "Invalid history reference" }); return;
    }
    const storage = await ensureStorage();

    if (storage === "native") {
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
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentRow = (await client.query(
        "SELECT id,subject,message FROM support_messages WHERE id=$1 AND type=$2 FOR UPDATE",
        [id, FALLBACK_OVERRIDE_TYPE]
      )).rows[0];
      const historyRow = (await client.query(
        "SELECT id,message FROM support_messages WHERE id=$1 AND type=$2 AND subject=$3",
        [historyId, FALLBACK_HISTORY_TYPE, String(id)]
      )).rows[0];
      const key = currentRow ? parseFallbackKey(currentRow.subject) : null;
      const current = currentRow ? parseCopyState(currentRow.message) : null;
      const history = historyRow ? parseHistoryState(historyRow.message) : null;
      if (!key || !current || !history) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "History record not found" });
        return;
      }
      const previous = current.publishedValue;
      const state: CopyState = {
        ...current,
        publishedValue: history.previousValue,
        draftValue: history.previousValue,
        publishedBy: actor,
        updatedBy: actor,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      };
      await client.query("UPDATE support_messages SET message=$1,user_id=$2 WHERE id=$3", [JSON.stringify(state),actor,id]);
      await insertFallbackHistory(client, {
        overrideId: id,
        previousValue: previous,
        newValue: history.previousValue,
        actorId: actor,
        action: "restore",
        version: state.version,
        createdAt: new Date().toISOString(),
      });
      await client.query("COMMIT");
      res.json({ ok: true, version: state.version });
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

router.post("/admin/site-copy/reset", requireSameOrigin, requireAdmin, async (req, res, next): Promise<void> => {
  try {
    const actor = await requirePublisher(req, res);
    if (!actor) return;
    const key = validateKey(req.body);
    if (!key) { res.status(400).json({ error: "Invalid text key" }); return; }
    const storage = await ensureStorage();

    if (storage === "native") {
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
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await getFallbackOverride(key, client);
      if (!current) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Not found" });
        return;
      }
      const previous = current.state.publishedValue;
      const state: CopyState = {
        ...current.state,
        publishedValue: null,
        draftValue: null,
        updatedBy: actor,
        publishedBy: actor,
        version: current.state.version + 1,
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      };
      await client.query("UPDATE support_messages SET message=$1,user_id=$2 WHERE id=$3", [JSON.stringify(state),actor,current.id]);
      await insertFallbackHistory(client, {
        overrideId: current.id,
        previousValue: previous,
        newValue: null,
        actorId: actor,
        action: "reset",
        version: state.version,
        createdAt: new Date().toISOString(),
      });
      await client.query("COMMIT");
      res.json({ ok: true, version: state.version });
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  } catch (err) { next(err); }
});

export default router;
