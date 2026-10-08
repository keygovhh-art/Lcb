import { pool } from "@workspace/db";
import { logger } from "./logger";

export const RESERVED_SUPER_ADMIN_NAME = "עפעס ערענסט";

export async function ensureReservedSuperAdmin() {
  const { rows } = await pool.query(
    `SELECT id, name, nickname, role, status
       FROM users
       WHERE name = $1 OR nickname = $1
       ORDER BY id ASC`,
    [RESERVED_SUPER_ADMIN_NAME],
  );

  if (rows.length === 0) {
    const candidates = await pool.query(
      `SELECT id, name, nickname, role, status
         FROM users
         WHERE name ILIKE '%עפעס%' OR nickname ILIKE '%עפעס%'
            OR name ILIKE '%ערנסט%' OR nickname ILIKE '%ערנסט%'
            OR name ILIKE '%ערענסט%' OR nickname ILIKE '%ערענסט%'
         ORDER BY id ASC
         LIMIT 20`
    );
    logger.warn({
      account: RESERVED_SUPER_ADMIN_NAME,
      candidates: candidates.rows.map(row => ({
        id: row.id,
        name: row.name,
        nickname: row.nickname,
        role: row.role,
        status: row.status,
      })),
    }, "Reserved super-admin account was not found; similar display names listed");
    return;
  }

  if (rows.length !== 1) {
    logger.error(
      { account: RESERVED_SUPER_ADMIN_NAME, matchingIds: rows.map(row => row.id) },
      "Super-admin promotion skipped because the reserved account name is not unique",
    );
    return;
  }

  const user = rows[0];
  if (user.role !== "super_admin") {
    await pool.query("UPDATE users SET role='super_admin' WHERE id=$1", [user.id]);
    logger.info({ userId: user.id }, "Reserved account promoted to super_admin");
  }
}
